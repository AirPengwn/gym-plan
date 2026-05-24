'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const IDX = path.join(ROOT, 'index.html');
const BAK = path.join(ROOT, 'index.html.bak');
const days = ['a','b','c','d','e'];
const counts = { a:10, b:9, c:6, d:8, e:9 }; // Phase 2b: counts = actual item count per day

// --- Pull EXERCISE_DATA out of the LIVE index.html (not the gen file) ---
const idx = fs.readFileSync(IDX, 'utf8');
const m = idx.match(/^var EXERCISE_DATA = (\{.*\});$/m);
if (!m) { console.error('EXERCISE_DATA not found in index.html'); process.exit(1); }
const EXERCISE_DATA = JSON.parse(m[1]);

// Renderer replica (must match the embedded one exactly)
function render(d){
  let html = EXERCISE_DATA[d].map(x => x.html).join('');
  html = html.replace(/(onclick="tog\('[^']+','[^']+',)\d+(\))/g, (mm,p1,p2)=>p1+counts[d]+p2);
  return html;
}

// --- Expected from pristine backup region, same count normalisation ---
const bak = fs.readFileSync(BAK, 'utf8').split('\n');
function regionText(day){
  const panelRe = new RegExp('^<div class="day-panel[^"]*" id="p-'+day+'">');
  let pi = bak.findIndex(l => panelRe.test(l));
  let start=-1,end=-1;
  for (let i=pi+1;i<bak.length;i++){
    if (start<0 && /^  <div class="item" id="[^"]+">/.test(bak[i])) start=i;
    if (bak[i].indexOf('<div class="day-summary" id="summary-'+day+'"')>=0){ end=i; break; }
  }
  return bak.slice(start,end).join('\n')+'\n';
}
function expected(d){
  return regionText(d).replace(/(onclick="tog\('[^']+','[^']+',)\d+(\))/g,(mm,p1,p2)=>p1+counts[d]+p2);
}

let pass = true;
let allRenderDex = [], allBakDex = [];
for (const d of days){
  const got = render(d), exp = expected(d);
  const ok = got === exp;
  if (!ok){
    pass = false;
    for (let i=0;i<Math.max(got.length,exp.length);i++){
      if (got[i]!==exp[i]){
        console.log(`Day ${d} DIFF @${i}:\n  got ${JSON.stringify(got.slice(i-40,i+60))}\n  exp ${JSON.stringify(exp.slice(i-40,i+60))}`);
        break;
      }
    }
  }
  allRenderDex = allRenderDex.concat(got.match(/data-ex="[^"]*"/g)||[]);
  allBakDex = allBakDex.concat(regionText(d).match(/data-ex="[^"]*"/g)||[]);
  console.log(`Day ${d}: byte-identical:${ok}  items:${EXERCISE_DATA[d].length}`);
}
// Global data-safety invariant: identical multiset of data-ex across all days
const sortJoin = a => a.slice().sort().join('\n');
const dexOk = sortJoin(allRenderDex) === sortJoin(allBakDex);
console.log('data-ex multiset preserved (all days): ' + dexOk + ' ('+allRenderDex.length+' attrs)');
if (!dexOk){
  pass = false;
  const A=sortJoin(allRenderDex).split('\n'), B=sortJoin(allBakDex).split('\n');
  for (let i=0;i<Math.max(A.length,B.length);i++) if(A[i]!==B[i]){ console.log('  diff: got='+A[i]+' exp='+B[i]); break; }
}
// Confirm placeholders present and no static items remain in index.html
const ph = days.every(d => idx.indexOf('<div id="items-'+d+'"></div>')>=0);
// Only the panel HTML (before <script>) must contain no static item cards;
// buildCardHTML inside the script legitimately has an item template literal.
const panelHtml = idx.slice(0, idx.indexOf('<script>'));
const noStatic = (panelHtml.match(/<div class="item" id="/g)||[]).length === 0;
console.log('placeholders present: '+ph+'   no residual static items: '+noStatic);
if (!ph || !noStatic) pass = false;

console.log('\n' + (pass ? 'VERIFY PASS — DOM byte-identical, data-ex preserved' : 'VERIFY FAIL'));
process.exit(pass ? 0 : 1);
