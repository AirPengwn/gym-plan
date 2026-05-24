'use strict';
// Phase-1 refactor harness: generate EXERCISE_DATA from the pristine backup
// and prove the data-driven renderer reproduces the original markup byte-for-byte
// (modulo the single approved change: tog() 3rd arg normalised to counts[day]).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BAK = path.join(ROOT, 'index.html.bak');
const OUT_DATA = path.join('C:\\Users\\airpe\\AppData\\Local\\Temp\\gymbuild', 'exdata.gen.js');

const counts = { a:10, b:10, c:6, d:9, e:10 }; // unchanged constant (matches index.html)
const days = ['a','b','c','d','e'];

const src = fs.readFileSync(BAK, 'utf8');
const lines = src.split('\n'); // keep '\n' join semantics; last element after final \n

// Find, per day, the [start,end) line indices of the ITEM region:
// start = first line `  <div class="item" id="..">` inside that panel
// end   = line `  <div class="day-summary" id="summary-X">`
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

// Split a region's lines into per-item blocks. A block runs from one
// `  <div class="item" id="X">` line up to (excluding) the next item line
// or the region end. Reassembly must equal the original region text exactly.
function splitItems(regionLines){
  const blocks = [];
  let cur = null;
  for (const ln of regionLines){
    const m = ln.match(/^  <div class="item" id="([^"]+)">/);
    if (m){ if (cur) blocks.push(cur); cur = { domId: m[1], lines: [ln] }; }
    else { if (!cur) throw new Error('stray line before first item: '+ln); cur.lines.push(ln); }
  }
  if (cur) blocks.push(cur);
  return blocks;
}

const EXERCISE_DATA = {};
const regions = {};
for (const d of days){
  const { start, end } = regionFor(d);
  regions[d] = lines.slice(start, end); // array of lines (no trailing newline element)
  const regionText = regions[d].join('\n') + '\n'; // exact original region text
  const blocks = splitItems(regions[d]);
  // Each item's html = its lines joined with '\n' + trailing '\n'
  EXERCISE_DATA[d] = blocks.map(b => ({ domId: b.domId, html: b.lines.join('\n') + '\n' }));
  // Fidelity check: concatenated blocks must equal the original region text
  const rebuilt = EXERCISE_DATA[d].map(x => x.html).join('');
  if (rebuilt !== regionText){
    console.error('FIDELITY FAIL '+d+': rebuilt != original region');
    process.exit(1);
  }
}

// The renderer (mirrors what will live in index.html): join item html, then
// normalise every tog() 3rd arg to counts[day]. NOTHING else changes.
function renderDayItems(d){
  let html = EXERCISE_DATA[d].map(x => x.html).join('');
  html = html.replace(/(onclick="tog\('[^']+','[^']+',)\d+(\))/g, (mm,p1,p2) => p1 + counts[d] + p2);
  return html;
}

// Expected = original region with the same count normalisation applied.
function expectedFor(d){
  const regionText = regions[d].join('\n') + '\n';
  return regionText.replace(/(onclick="tog\('[^']+','[^']+',)\d+(\))/g, (mm,p1,p2) => p1 + counts[d] + p2);
}

let allPass = true;
for (const d of days){
  const got = renderDayItems(d);
  const exp = expectedFor(d);
  const ok = got === exp;
  // Data-safety invariant: identical multiset of data-ex values and item ids
  const dex = s => (s.match(/data-ex="[^"]*"/g) || []).sort().join('|');
  const ids = s => (s.match(/<div class="item" id="[^"]+">/g) || []).sort().join('|');
  const origRegion = regions[d].join('\n') + '\n';
  const dexOk = dex(got) === dex(origRegion);
  const idOk  = ids(got) === ids(origRegion);
  const itemCount = EXERCISE_DATA[d].length;
  console.log(`Day ${d}: render==expected:${ok}  data-ex preserved:${dexOk}  ids preserved:${idOk}  items:${itemCount}`);
  if (!ok){
    allPass = false;
    for (let i=0;i<Math.max(got.length,exp.length);i++){
      if (got[i]!==exp[i]){
        console.log(`  first diff @${i}: got ${JSON.stringify(got.slice(i,i+80))}`);
        console.log(`              exp ${JSON.stringify(exp.slice(i,i+80))}`);
        break;
      }
    }
  }
  if (!dexOk || !idOk) allPass = false;
}

// Emit EXERCISE_DATA as a JS literal (JSON string encoding is valid JS and
// preserves every unicode/entity char exactly).
const literal = 'var EXERCISE_DATA = ' + JSON.stringify(EXERCISE_DATA) + ';\n';
fs.writeFileSync(OUT_DATA, literal);
console.log('\nEXERCISE_DATA written: ' + OUT_DATA + ' (' + literal.length + ' bytes)');
console.log(allPass ? 'ALL PASS' : 'FAIL');
process.exit(allPass ? 0 : 1);
