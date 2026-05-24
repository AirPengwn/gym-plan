'use strict';
// Find the 2 set-bearing entries in cloud that lack .sets.
const fs=require('fs');
const https=require('https');
const HTML=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const ID  = (HTML.match(/var JBIN_ID\s*=\s*'([^']+)'/)||[])[1];
const KEY = (HTML.match(/var JBIN_KEY\s*=\s*'([^']+)'/)||[])[1];
https.request({method:'GET',hostname:'api.jsonbin.io',path:'/v3/b/'+ID,headers:{'X-Master-Key':KEY,'X-Bin-Meta':'false'}}, res=>{
  let chunks=[]; res.on('data',c=>chunks.push(c));
  res.on('end',()=>{
    const p=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    console.log('--- Set-bearing entries WITHOUT .sets ---');
    let n=0;
    ['a','b','c','d','e'].forEach(d=>{
      (p['gymlog_'+d]||[]).forEach((sess,si)=>{
        (sess.entries||[]).forEach((e,ei)=>{
          if(!e || typeof e.note!=='string') return;
          if(e.note.indexOf('Set ')!==0) return;
          if(!/Set\s*\d+:[\s\S]*?[\d.]+/.test(e.note)) return; // bodyweight / unparseable: excluded from count
          if(Array.isArray(e.sets)) return;
          n++;
          console.log('  Day '+d+' / session['+si+'] / entry['+ei+']');
          console.log('    ex   : '+e.ex);
          console.log('    label: '+(sess.label||''));
          console.log('    note : '+e.note);
          console.log('    sets : '+JSON.stringify(e.sets));
        });
      });
    });
    if(n===0) console.log('  (none — count must include something the diagnostic flags differently)');
    console.log('\n--- All set-bearing entries summary (Day → ex → has .sets?) ---');
    ['a','b','c','d','e'].forEach(d=>{
      (p['gymlog_'+d]||[]).forEach(sess=>{
        (sess.entries||[]).forEach(e=>{
          if(!e || typeof e.note!=='string' || e.note.indexOf('Set ')!==0) return;
          if(!/Set\s*\d+:[\s\S]*?[\d.]+/.test(e.note)) return;
          console.log('  Day '+d+' · '+e.ex+' · '+(Array.isArray(e.sets)?'✓':'✗')+' ('+e.note.slice(0,40)+'...)');
        });
      });
    });
  });
}).end();
