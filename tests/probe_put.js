'use strict';
// Endpoint health probe: GET current data, PUT it back unchanged. Verifies
// the PUT pathway works with the same credentials the iPhone uses. Semantic
// no-op (writes the same bytes back); JSONbin's versioning creates a new
// version stamp but data is unchanged.
const fs=require('fs');
const https=require('https');
const HTML=fs.readFileSync('C:\\dev\\gym-plan\\index.html','utf8');
const ID  = (HTML.match(/var JBIN_ID\s*=\s*'([^']+)'/)||[])[1];
const KEY = (HTML.match(/var JBIN_KEY\s*=\s*'([^']+)'/)||[])[1];

function req(method, body){
  return new Promise((resolve,reject)=>{
    const headers={ 'X-Master-Key':KEY, 'X-Bin-Meta':'false' };
    if(method==='PUT'){
      headers['Content-Type']='application/json';
      // v2.72: NO X-Bin-Versioning (free tier rejects it with 403)
    }
    const r=https.request({method, hostname:'api.jsonbin.io', path:'/v3/b/'+ID, headers}, res=>{
      let chunks=[];
      res.on('data', c=>chunks.push(c));
      res.on('end', ()=>resolve({status:res.statusCode, body:Buffer.concat(chunks).toString('utf8')}));
    });
    r.on('error', reject);
    if(body) r.write(body);
    r.end();
  });
}

(async()=>{
  console.log('1. GET current cloud bin…');
  const get=await req('GET');
  console.log('   status:', get.status);
  console.log('   bytes :', get.body.length);
  if(get.status!==200){ console.error('GET failed — aborting probe'); process.exit(1); }
  const payload=JSON.parse(get.body);
  console.log('   keys  :', Object.keys(payload).join(', '));
  console.log('');
  console.log('2. PUT same data back (no-op)…');
  const put=await req('PUT', JSON.stringify(payload));
  console.log('   status:', put.status);
  if(put.status===200){
    console.log('   ✓ PUT succeeded. Endpoint + credentials work for writes.');
    console.log('   → The iPhone\'s cloud-sync failure is iPhone-specific (network, cache, or fetch path).');
  } else {
    console.log('   ✗ PUT failed.');
    console.log('   body:', put.body.slice(0,500));
    console.log('   → Endpoint or credentials are the problem; iPhone fix is secondary.');
  }
})().catch(e=>{ console.error('Probe error:', e.message); process.exit(2); });
