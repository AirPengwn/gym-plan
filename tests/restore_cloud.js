'use strict';
// One-shot cloud restoration. Drops:
//   1. Day A May 12 2:10 PM session (stale write from accidental non-primary device)
//   2. Day D session with labeled "Rear: X pec: Y" Pec fly entry (pre-Split duplicate)
// PUTs the corrected state. Verifies. Reads credentials from index.html in-memory.
const fs=require('fs');
const https=require('https');
const HTML=fs.readFileSync('C:\\dev\\gym-plan\\index.html','utf8');
const ID=(HTML.match(/var JBIN_ID\s*=\s*'([^']+)'/)||[])[1];
const KEY=(HTML.match(/var JBIN_KEY\s*=\s*'([^']+)'/)||[])[1];

function req(method, body){
  return new Promise((resolve,reject)=>{
    const headers={'X-Master-Key':KEY,'X-Bin-Meta':'false'};
    if(method==='PUT') headers['Content-Type']='application/json';
    const r=https.request({method,hostname:'api.jsonbin.io',path:'/v3/b/'+ID,headers}, res=>{
      let chunks=[]; res.on('data',c=>chunks.push(c));
      res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString('utf8')}));
    });
    r.on('error',reject);
    if(body) r.write(body);
    r.end();
  });
}

function hasLabeledPecFly(sess){
  return (sess.entries||[]).some(e=>e&&e.ex==='Pec fly'&&/Rear:\s*[\d.]+/i.test(e.note||'')&&/pec:\s*[\d.]+/i.test(e.note||''));
}

(async()=>{
  console.log('1. GET current cloud...');
  const get=await req('GET');
  if(get.status!==200){ console.error('GET failed:', get.status, get.body.slice(0,200)); process.exit(1); }
  const p=JSON.parse(get.body);
  console.log('   Day A sessions:', (p.gymlog_a||[]).length);
  console.log('   Day D sessions:', (p.gymlog_d||[]).length);

  // ── Day A: drop 2:10 PM stale session ──
  const dayAStale=(p.gymlog_a||[]).filter(s=>/2:10 PM/.test(s.date||''));
  console.log('\n2. Day A surgery:');
  if(dayAStale.length){
    dayAStale.forEach(s=>console.log('     drop  ·', s.date, '· entries:', (s.entries||[]).length));
    p.gymlog_a=(p.gymlog_a||[]).filter(s=>!/2:10 PM/.test(s.date||''));
  } else {
    console.log('     (no 2:10 PM session found — Day A may already be clean)');
  }

  // ── Day D: drop labeled-Pec-fly duplicate session ──
  const dayDBad=(p.gymlog_d||[]).filter(hasLabeledPecFly);
  const dayDGood=(p.gymlog_d||[]).filter(s=>!hasLabeledPecFly(s));
  console.log('\n3. Day D surgery:');
  if(dayDBad.length){
    dayDBad.forEach(s=>console.log('     drop  ·', s.date, '· (has labeled Pec fly) entries:', (s.entries||[]).length));
    dayDGood.forEach(s=>console.log('     keep  ·', s.date, '· (clean Pec fly) entries:', (s.entries||[]).length));
    p.gymlog_d=dayDGood;
  } else {
    console.log('     (no labeled Pec fly found — Day D may already be clean)');
  }

  if(dayAStale.length===0 && dayDBad.length===0){
    console.log('\n   Nothing to fix. Aborting PUT.');
    process.exit(0);
  }

  console.log('\n4. After surgery:');
  console.log('   Day A sessions:', (p.gymlog_a||[]).length);
  console.log('   Day D sessions:', (p.gymlog_d||[]).length);

  console.log('\n5. PUT corrected state (authoritative)...');
  const put=await req('PUT', JSON.stringify(p));
  console.log('   status:', put.status);
  if(put.status!==200){
    console.error('PUT failed:', put.body.slice(0,300));
    process.exit(2);
  }
  console.log('   ✓ Write succeeded.');

  console.log('\n6. Verifying with fresh GET...');
  const verify=await req('GET');
  const vp=JSON.parse(verify.body);
  const stillStaleA=(vp.gymlog_a||[]).some(s=>/2:10 PM/.test(s.date||''));
  const stillLabeled=(vp.gymlog_d||[]).some(hasLabeledPecFly);
  console.log('   Day A sessions:', (vp.gymlog_a||[]).length);
  console.log('   Day D sessions:', (vp.gymlog_d||[]).length);
  console.log('   2:10 PM Day A still present:', stillStaleA?'❌':'✓ gone');
  console.log('   Labeled Pec fly still present:', stillLabeled?'❌':'✓ gone');
  if(!stillStaleA && !stillLabeled){
    console.log('\n   ✓ Cloud restored to clean state.');
  } else {
    console.log('\n   ⚠️ Restoration incomplete — manual check needed.');
    process.exit(3);
  }
})().catch(e=>{ console.error('Error:', e.message); process.exit(4); });
