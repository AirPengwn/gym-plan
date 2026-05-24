'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = 'C:\\dev\\gym-plan';
const IDX = path.join(ROOT, 'index.html');
const GEN = 'C:\\Users\\airpe\\AppData\\Local\\Temp\\gymbuild\\exdata.gen.js';
const days = ['a','b','c','d','e'];
const counts = { a:10, b:10, c:6, d:9, e:10 };

let src = fs.readFileSync(IDX, 'utf8');
const lines = src.split('\n');

// 1. Replace each day's item region with a placeholder, bottom-up so indices hold.
function regionFor(day){
  const panelRe = new RegExp('^<div class="day-panel[^"]*" id="p-'+day+'">');
  let pi = lines.findIndex(l => panelRe.test(l));
  if (pi < 0) throw new Error('panel not found: '+day);
  let start = -1, end = -1;
  for (let i = pi+1; i < lines.length; i++){
    if (start < 0 && /^  <div class="item" id="[^"]+">/.test(lines[i])) start = i;
    if (lines[i].indexOf('<div class="day-summary" id="summary-'+day+'"') >= 0){ end = i; break; }
  }
  if (start < 0 || end < 0) throw new Error('region not found: '+day);
  return { start, end };
}
const regs = days.map(d => ({ d, ...regionFor(d) }));
regs.sort((a,b)=>b.start-a.start); // bottom-up
for (const r of regs){
  lines.splice(r.start, r.end - r.start, '  <div id="items-'+r.d+'"></div>');
}
src = lines.join('\n');

// 2. Inject EXERCISE_DATA + renderer right after the counts constant line.
const exdata = fs.readFileSync(GEN, 'utf8').trim(); // `var EXERCISE_DATA = {...};`
const COUNTS_LINE = 'var counts={a:10,b:10,c:6,d:9,e:10};';
if (src.indexOf(COUNTS_LINE) < 0) throw new Error('counts anchor not found');
const renderer = [
  '',
  '// ── Phase 1: data-driven exercise rendering ─────────────────────────',
  '// EXERCISE_DATA mirrors the former static markup exactly (generated from it).',
  '// renderDayItems() is the ONLY producer of exercise cards; the single change',
  '// vs the old static HTML is that every tog() count is normalised to',
  '// counts[day] (consistent with the progress label and Complete Day).',
  exdata,
  'function renderDayItems(){',
  "  ['a','b','c','d','e'].forEach(function(d){",
  "    var host=document.getElementById('items-'+d);",
  '    if(!host||!EXERCISE_DATA[d]) return;',
  "    var html=EXERCISE_DATA[d].map(function(x){return x.html;}).join('');",
  "    html=html.replace(/(onclick=\"tog\\('[^']+','[^']+',)\\d+(\\))/g,function(m,p1,p2){return p1+counts[d]+p2;});",
  '    host.innerHTML=html;',
  '  });',
  '}',
  'renderDayItems();'
].join('\n');
src = src.replace(COUNTS_LINE, COUNTS_LINE + '\n' + renderer);

// 3. Single-source the duplicate totals table.
const TOTALS_LINE = '  var totals={a:10,b:10,c:6,d:9,e:10};';
if (src.indexOf(TOTALS_LINE) < 0) throw new Error('totals anchor not found');
src = src.replace(TOTALS_LINE, '  var totals=counts;');

// 4. Normalise reset-btn rst() args to counts[day] (same value the label uses).
days.forEach(function(d){
  const re = new RegExp("onclick=\"rst\\('"+d+"',\\d+\\)\"");
  if (!re.test(src)) throw new Error('reset anchor not found: '+d);
  src = src.replace(re, "onclick=\"rst('"+d+"',"+counts[d]+")\"");
});

// 5. Bump version badge v2.0 -> v2.1
src = src.replace('>v2.0<', '>v2.1<');

fs.writeFileSync(IDX, src);
console.log('integrated. new size '+src.length+' bytes, lines '+src.split('\n').length);
