'use strict';
// Live JSONbin review — credentials read from index.html in-memory, no /tmp dump,
// focused on Pec fly + Rear delt state per user request.
const fs=require('fs');
const https=require('https');
const HTML=fs.readFileSync('C:\\dev\\gym-plan\\index.html','utf8');
const ID  = (HTML.match(/var JBIN_ID\s*=\s*'([^']+)'/)||[])[1];
const KEY = (HTML.match(/var JBIN_KEY\s*=\s*'([^']+)'/)||[])[1];
if(!ID || !KEY){ console.error('Could not read JBIN_ID/KEY from index.html'); process.exit(1); }

const req=https.request({
  method:'GET',
  hostname:'api.jsonbin.io',
  path:'/v3/b/'+ID,
  headers:{ 'X-Master-Key':KEY, 'X-Bin-Meta':'false' }
}, (res)=>{
  let chunks=[];
  res.on('data', c=>chunks.push(c));
  res.on('end', ()=>{
    if(res.statusCode!==200){ console.error('HTTP', res.statusCode); process.exit(2); }
    let payload;
    try{ payload=JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch(e){ console.error('JSON parse failed:', e.message); process.exit(3); }
    review(payload);
  });
});
req.on('error', e=>{ console.error('Network error:', e.message); process.exit(4); });
req.end();

function review(p){
  console.log('=== LIVE JSONbin REVIEW (', new Date().toISOString(),') ===\n');
  // Schema + top-level shape
  console.log('Schema version :', p.__schema || '(none)');
  ['a','b','c','d','e'].forEach(d=>{
    const sessions=Array.isArray(p['gymlog_'+d])?p['gymlog_'+d]:[];
    console.log('Day '+d.toUpperCase()+' sessions:', sessions.length);
  });
  console.log('');

  // Focus: Pec fly + Rear delt across all days
  const focus=['pec fly','rear delt'];
  focus.forEach(name=>{
    console.log('─── '+name.toUpperCase()+' ───');
    let total=0;
    ['a','b','c','d','e'].forEach(d=>{
      const sessions=Array.isArray(p['gymlog_'+d])?p['gymlog_'+d]:[];
      sessions.forEach((sess,si)=>{
        (sess.entries||[]).forEach((e,ei)=>{
          if(!e || !e.ex) return;
          if(e.ex.toLowerCase()!==name) return;
          total++;
          const lbl=sess.label||'(no label)';
          const date=sess.date||'(no date)';
          const ts=sess.ts||0;
          const setsField=Array.isArray(e.sets)?(' · .sets='+JSON.stringify(e.sets)):' · NO .sets';
          const labeled=/Rear:\s*[\d.]+/i.test(e.note||'') && /pec:\s*[\d.]+/i.test(e.note||'');
          const doubled=/\d\s+(?:lbs|kg)\s+(?:lbs|kg)/i.test(e.note||'');
          console.log('  Day '+d+' / session['+si+'] / entry['+ei+'] '+(labeled?'⚠ LABELED ':'')+(doubled?'⚠ DOUBLED ':''));
          console.log('    label : '+lbl);
          console.log('    date  : '+date);
          console.log('    ts    : '+ts+(ts?' = '+new Date(ts).toISOString():''));
          console.log('    note  : '+(e.note||'(none)'));
          console.log('    sets  : '+(Array.isArray(e.sets)?JSON.stringify(e.sets):'(absent)'));
        });
      });
    });
    if(!total) console.log('  (no entries found)');
    console.log('');
  });

  // Health summary
  console.log('─── DATA-HEALTH SUMMARY ───');
  let labeledCount=0, doubledCount=0, dupGroups=0, setBearing=0, withSets=0;
  const dupMap={};
  ['a','b','c','d','e'].forEach(d=>{
    const sessions=Array.isArray(p['gymlog_'+d])?p['gymlog_'+d]:[];
    sessions.forEach(sess=>{
      // Duplicate session detection (same day + ts + label)
      const ts=sess.ts || (Date.parse(String(sess.date||'').replace(' at ',' '))||0);
      const key=d+'|'+ts+'|'+(sess.label||'');
      dupMap[key]=(dupMap[key]||0)+1;
      (sess.entries||[]).forEach(e=>{
        if(!e || typeof e.note!=='string') return;
        if(/\d\s+(?:lbs|kg)\s+(?:lbs|kg)/i.test(e.note)) doubledCount++;
        if(/Rear:\s*[\d.]+/i.test(e.note) && /pec:\s*[\d.]+/i.test(e.note)) labeledCount++;
        // Fix: per-segment check (matches in-app _anySetParsable). Otherwise the
        // greedy `[\s\S]*?[\d.]+` jumps across pipe-delim boundaries and finds
        // a digit in "Set 2:" headers, over-counting bodyweight entries.
        if(e.note.indexOf('Set ')===0){
          var anyParsable=false;
          e.note.split('|').forEach(function(seg){
            if(/Set\s*\d+:[\s\S]*?[\d.]+/.test(seg.trim())) anyParsable=true;
          });
          if(anyParsable){
            setBearing++;
            if(Array.isArray(e.sets)) withSets++;
          }
        }
      });
    });
  });
  Object.keys(dupMap).forEach(k=>{ if(dupMap[k]>1) dupGroups++; });
  console.log('  Set-bearing entries with .sets : '+withSets+'/'+setBearing+(withSets===setBearing?' ✓':' ⚠ partial'));
  console.log('  Doubled-unit notes ("lbs lbs") : '+doubledCount+(doubledCount?' ⚠':' ✓'));
  console.log('  Combined Rear+Pec labeled notes: '+labeledCount+(labeledCount?' ⚠':' ✓'));
  console.log('  Duplicate session groups       : '+dupGroups+(dupGroups?' ⚠':' ✓'));
}
