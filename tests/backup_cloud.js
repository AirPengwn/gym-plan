'use strict';
// Disaster-recovery backup: fetch the live JSONbin contents and write them to
// a timestamped local file in the project's backups dir. Credentials read
// from index.html in-memory (never echoed). This is an explicit user-requested
// backup before a large refactor, for rollback to v2.73.
const fs=require('fs');
const https=require('https');
const HTML=fs.readFileSync('C:\\dev\\gym-plan\\index.html','utf8');
const ID=(HTML.match(/var JBIN_ID\s*=\s*'([^']+)'/)||[])[1];
const KEY=(HTML.match(/var JBIN_KEY\s*=\s*'([^']+)'/)||[])[1];
const OUT='C:\\dev\\gym-plan\\backups\\v2.73-2026-05-21\\jsonbin-cloud-backup.json';

https.request({method:'GET',hostname:'api.jsonbin.io',path:'/v3/b/'+ID,headers:{'X-Master-Key':KEY,'X-Bin-Meta':'false'}}, res=>{
  let chunks=[]; res.on('data',c=>chunks.push(c));
  res.on('end',()=>{
    if(res.statusCode!==200){ console.error('GET failed:', res.statusCode); process.exit(1); }
    const raw=Buffer.concat(chunks).toString('utf8');
    let p;
    try{ p=JSON.parse(raw); }catch(e){ console.error('parse failed:', e.message); process.exit(2); }
    // Pretty-print for human readability + diffability.
    fs.writeFileSync(OUT, JSON.stringify(p, null, 2), 'utf8');
    // Summary
    let total=0;
    ['a','b','c','d','e'].forEach(d=>{ total += (p['gymlog_'+d]||[]).length; });
    console.log('✓ Cloud backup written:', OUT);
    console.log('  bytes        :', raw.length);
    console.log('  schema       :', p.__schema||'(none)');
    console.log('  total sessions:', total);
    ['a','b','c','d','e'].forEach(d=>{ console.log('  Day '+d.toUpperCase()+':', (p['gymlog_'+d]||[]).length, 'session(s)'); });
    console.log('  measurements :', (p.body_measurements||[]).length);
    console.log('  archived     :', (p.archived_exercises||[]).length);
  });
}).on('error', e=>{ console.error('Network error:', e.message); process.exit(3); }).end();
