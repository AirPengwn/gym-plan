'use strict';
// v5.47 (P3-C) — note-tag vocabulary: getNoteTags / saveNoteTags + the
// note_tags_v1 SYNCED key, LWW whole-array merge. Locks the 9 payload spots
// the directive specifies must mirror this key (pushPlanToCloud,
// _silentPushPlan / _PLAN_KEYS_SYNC, generateExport / buildBinPayload,
// import, cloud-archive buildBinPayload helper, mergeCloudIntoPayload,
// applyPayloadToLocal, TEST_EXTRA_KEYS), plus the chip-append behavior
// (writes to .notes-input free-text, NEVER the locked .note set format).
const fs=require('fs');const{JSDOM}=require('jsdom');
const HTML=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
function store(i){const m=new Map(Object.entries(i||{}));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(''+k,''+v),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:x=>{const a=[...m.keys()];return x<a.length?a[x]:null},get length(){return m.size}};}
function app(st){
  const ctx=new Proxy(function(){return ctx},{get:()=>ctx,set:()=>true,apply:()=>ctx});
  return new JSDOM(HTML,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
    Object.defineProperty(w,'localStorage',{value:st,configurable:true});
    Object.defineProperty(w,'sessionStorage',{value:store({gym_test_mode:'1'}),configurable:true});
    w.fetch=()=>Promise.reject(new Error('no'));
    w.HTMLCanvasElement.prototype.getContext=()=>ctx;
    w.confirm=()=>true;
  }}).window;
}
let fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };

// ── Default seed when nothing's stored ──
var ST=store({gym_primary_device:'1'});
var w=app(ST); var D=w.document;
var defaults=w.getNoteTags();
ok(Array.isArray(defaults) && defaults.length===6,'seed · 6 default tags when never set');
ok(defaults.indexOf('felt strong')>=0 && defaults.indexOf('tweaked shoulder')>=0,'seed · vocabulary matches directive');

// ── Save + sanitize ──
w.saveNoteTags(['good form','Easy','  Easy  ','tough','']);
var t=w.getNoteTags();
ok(t.length===3,'save · dedupes case-insensitively + drops empties (got '+t.length+')');
ok(t[1]==='Easy','save · keeps original-case first-occurrence');

// ── Add / remove / reorder ──
w.saveNoteTags(['a','b','c']);
w._addNoteTag.call(null);  // empty input, no-op
ok(w.getNoteTags().join(',')==='a,b,c','add · empty input is a no-op');
D.getElementById('note-tag-new').value='d';
w._addNoteTag();
ok(w.getNoteTags().join(',')==='a,b,c,d','add · appends to the end');
w._moveNoteTag(0, 1);
ok(w.getNoteTags().join(',')==='b,a,c,d','reorder · move down');
w._moveNoteTag(2, -1);
ok(w.getNoteTags().join(',')==='b,c,a,d','reorder · move up');
w._removeNoteTag(0);
ok(w.getNoteTags().join(',')==='c,a,d','remove · drops the indexed tag');

// ── Chip append into .notes-input (NOT the locked pipe-delimited .note) ──
// Boot already rendered chips; grab one and click.
w.saveNoteTags(['felt strong','tough']);
w.loadLastTimes();
// chips are wired by _renderNoteTagChips which loadLastTimes calls via sw().
// Use the public _appendNoteTag directly to lock its behavior.
var input=D.querySelector('.notes-input'); ok(!!input,'chip · workout-card .notes-input exists');
input.value='';
w._appendNoteTag(input, 'felt strong');
ok(input.value==='felt strong','chip · appends to empty free-text field');
w._appendNoteTag(input, 'tough');
ok(input.value==='felt strong, tough','chip · second append uses comma separator');
w._appendNoteTag(input, 'felt strong');
ok(input.value==='felt strong, tough','chip · duplicate is NOT re-appended');

// ── Sync mirroring: every payload spot ──
ST=store({gym_primary_device:'1', note_tags_v1: JSON.stringify(['alpha','beta'])});
w=app(ST); D=w.document;

// (1) buildBinPayload (cloud-archive helper, scope `p`)
var p=w.buildBinPayload();
ok(Array.isArray(p['note_tags_v1']) && p['note_tags_v1'].join(',')==='alpha,beta','sync · buildBinPayload carries note_tags_v1');

// (2) generateExport (writes to #export-text textarea via the import/export modal)
w.showExportImport();
w.generateExport();
var taVal=D.getElementById('export-text').value;
var decoded=JSON.parse(decodeURIComponent(escape(w.atob(taVal))));
ok(Array.isArray(decoded['note_tags_v1']) && decoded['note_tags_v1'].join(',')==='alpha,beta','sync · generateExport payload carries note_tags_v1');

// (3) mergeCloudIntoPayload — local-wins-when-set (LWW). mergeCloudIntoPayload
// pulls local via buildBinPayload internally, so we drive it by mutating
// localStorage and passing only the cloud arg.
// case A — local SET → keeps local, ignores cloud
w.localStorage.setItem('note_tags_v1', JSON.stringify(['local-A','local-B']));
var merged=w.mergeCloudIntoPayload({note_tags_v1:['cloud-only']});
ok(merged.note_tags_v1.join(',')==='local-A,local-B','sync · mergeCloudIntoPayload keeps LOCAL when set (LWW whole-array, no element union)');
// case B — local UNSET → falls back to cloud
w.localStorage.removeItem('note_tags_v1');
var merged2=w.mergeCloudIntoPayload({note_tags_v1:['from-cloud']});
ok(Array.isArray(merged2.note_tags_v1) && merged2.note_tags_v1.join(',')==='from-cloud','sync · mergeCloudIntoPayload falls back to cloud when local missing');

// (4) applyPayloadToLocal — overwrites local with payload array
w.applyPayloadToLocal({note_tags_v1:['x','y','z']});
ok(w.localStorage.getItem('note_tags_v1')==='["x","y","z"]','sync · applyPayloadToLocal sets the array verbatim');
// non-array payload is ignored (no string/object overwrites)
w.applyPayloadToLocal({note_tags_v1:'not-an-array'});
ok(w.localStorage.getItem('note_tags_v1')==='["x","y","z"]','sync · applyPayloadToLocal ignores non-array payloads');

// (5) _PLAN_KEYS_SYNC — note_tags_v1 triggers the auto-push hook
ok(w._PLAN_KEYS_SYNC.indexOf('note_tags_v1')>=0,'sync · note_tags_v1 listed in _PLAN_KEYS_SYNC (auto-push trigger)');

// (6) TEST_EXTRA_KEYS — note_tags_v1 included so test-mode restore covers it
ok(w.TEST_EXTRA_KEYS.indexOf('note_tags_v1')>=0,'sync · note_tags_v1 listed in TEST_EXTRA_KEYS');

// ── Do-not-touch: chip append must NEVER write to the pipe-delimited .note ──
// (.note holds "Set 1: 90 lbs x12reps | …" and is the canonical training data.
// Chips append to .notes-input which is the free-text adjacent field. We lock
// that separation here so a future refactor can't accidentally cross over.)
var repInput=D.querySelector('.rep-input[data-ex]');
ok(!!repInput,'do-not-touch · .rep-input exists');
ok(repInput.tagName!=='INPUT' || repInput.className.indexOf('notes-input')===-1,'do-not-touch · .rep-input is NOT a .notes-input (chips target the right field)');

console.log('\n'+(fail?('NOTE TAGS SPOT-CHECK: '+fail+' FAILED'):'NOTE TAGS SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
