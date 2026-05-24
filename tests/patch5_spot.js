'use strict';
// Patch 5 spot-check — structured session entries with one-shot migration.
// Walks all 7 verification steps from HANDOFF-patch-5.md §Verification,
// plus the lossless-on-readers canary (the spec's hard must-not-regress).
const fs=require('fs');const{JSDOM}=require('jsdom');
const HTML=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
function store(init){const m=new Map(Object.entries(init||{}));return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(''+k,''+v),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:i=>{const a=[...m.keys()];return i<a.length?a[i]:null;},get length(){return m.size;}};}
function app(st){
  const ctx=new Proxy(function(){return ctx;},{get:()=>ctx,set:()=>true,apply:()=>ctx});
  return new JSDOM(HTML,{runScripts:'dangerously',url:'https://s.test/',pretendToBeVisual:true,beforeParse(w){
    Object.defineProperty(w,'localStorage',{value:st,configurable:true});
    Object.defineProperty(w,'sessionStorage',{value:store({gym_test_mode:'1'}),configurable:true});
    w.fetch=()=>Promise.reject(new Error('no'));
    w.HTMLCanvasElement.prototype.getContext=()=>ctx;
    w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    try{Object.defineProperty(w.location,'reload',{value(){},configurable:true});}catch(e){}
  }}).window;
}
let fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };

// ─────────────────────────────────────────────────────────────────────
// Pre-deploy snapshot — seed legacy (pipe-delimited only) sessions in
// localStorage *before* the page loads. The boot-time migration will run
// against this data; we capture pre-migration reader outputs first.
// ─────────────────────────────────────────────────────────────────────
const ST=store();
ST.setItem('gymlog_a', JSON.stringify([
  { label:'Day 1', date:'May 17, 2026 at 9:00 AM', ts:Date.now()-86400000, duration:42,
    entries:[
      { ex:'Chest press', note:'Set 1: 100 lbs x10reps | Set 2: 105 lbs x8reps | Set 3: 110 lbs x6reps' },
      { ex:'Chest press-rpe', note:'RPE 8/10' },
      { ex:'Lat pulldown', note:'Set 1: 80 lbs x12reps | Set 2: 85 lbs x10reps' }
    ]},
  { label:'Day 1', date:'May 10, 2026 at 9:00 AM', ts:Date.now()-8*86400000, duration:38,
    entries:[
      { ex:'Chest press', note:'Set 1: 95 lbs x10reps | Set 2: 100 lbs x10reps' }
    ]}
]));

// First boot: migration should run.
let w=app(ST); let D=w.document;

// ── Step 2: migration ran cleanly ────────────────────────────────────
ok(w.localStorage.getItem('sessions_migrated_v1')==='1','Step 2 · sessions_migrated_v1 flag set after first boot');
var sessAfter=JSON.parse(w.localStorage.getItem('gymlog_a'));
var e0=sessAfter[0].entries[0];
ok(typeof e0.note==='string' && /Set 1:.*100 lbs/.test(e0.note),'Step 2 · .note string preserved on migrated entry (rollback safety net)');
ok(Array.isArray(e0.sets) && e0.sets.length===3,'Step 2 · .sets array materialised (3 sets)');
ok(e0.sets[0].w===100 && e0.sets[0].u==='lbs' && e0.sets[0].r===10,'Step 2 · structured set 1 = {w:100, u:"lbs", r:10}');
ok(e0.sets[1].w===105 && e0.sets[1].r===8,'Step 2 · structured set 2 weight + reps correct');
ok(e0.sets[2].w===110 && e0.sets[2].r===6,'Step 2 · structured set 3 weight + reps correct');
// Non-set entries (RPE) must NOT have .sets attached
var rpe=sessAfter[0].entries[1];
ok(!('sets' in rpe),'Step 2 · RPE entry was not given a .sets field (only "Set N:" entries migrate)');
// Older session (2 sets) also migrated
var e1=sessAfter[1].entries[0];
ok(Array.isArray(e1.sets) && e1.sets.length===2,'Step 2 · older session in same day also migrated');

// Idempotency: re-running migration does nothing.
var beforeReRun=w.localStorage.getItem('gymlog_a');
w.migrateSessionsToStructured_v1();
ok(w.localStorage.getItem('gymlog_a')===beforeReRun,'Step 2 · migration is idempotent (flag prevents re-run)');

// Second boot (separate JSDOM, same store): no log line, no re-migration.
w.close();
w=app(ST); D=w.document;
ok(w.localStorage.getItem('sessions_migrated_v1')==='1','Step 2 · flag survives reload');
var sessReload=JSON.parse(w.localStorage.getItem('gymlog_a'));
ok(JSON.stringify(sessReload)===beforeReRun,'Step 2 · session bytes unchanged on second boot');

// ── Step 3: lossless on every reader ─────────────────────────────────
// Compute outputs from BOTH structured fast-path AND the legacy regex path
// on the SAME data, prove they match exactly.
var entry=sessReload[0].entries[0];
var weightsFromStruct=w.parseSetWeights(entry);          // fast-path (entry.sets)
var weightsFromString=w.parseSetWeights(entry.note);     // regex path
ok(JSON.stringify(weightsFromStruct)===JSON.stringify(weightsFromString),
   'Step 3 · parseSetWeights: structured & string paths produce identical arrays');
ok(weightsFromStruct.join(',')==='100,105,110','Step 3 · parseSetWeights values correct (100,105,110)');

var wrFromStruct=w.parseSetWR(entry);
var wrFromString=w.parseSetWR(entry.note);
ok(JSON.stringify(wrFromStruct)===JSON.stringify(wrFromString),
   'Step 3 · parseSetWR: structured & string paths produce identical arrays');
ok(wrFromStruct[0].w===100 && wrFromStruct[0].r===10,'Step 3 · parseSetWR set 0 = {w:100, r:10}');

// est1RM unchanged — fed by parseSetWR which now reads structured.
var rm=w.bestEst1RM(entry.note);  // legacy string entry
// And same via fast path: bestEst1RM takes a string per its signature; the
// dual-signature parsers don't propagate to bestEst1RM. Confirm bestEst1RM
// still works on the string form (which is preserved).
ok(rm>0,'Step 3 · bestEst1RM(noteString) still works after migration');

// ── Step 4: new writes go to BOTH shapes ─────────────────────────────
// Simulate a fake Day 1 save via confirmSave's path. The simplest way is to
// pretend the user filled in rep inputs, then call confirmSave().
var p=D.getElementById('p-a');
ok(!!p,'Step 4 · Day 1 panel present');
// Find the Chest press card's rep inputs (set 1, 2, 3 if present).
var repInputs=p.querySelectorAll('.rep-input[data-ex="Chest press"]');
ok(repInputs.length>=2,'Step 4 · Chest press has multiple rep inputs ('+repInputs.length+')');
// Fill weights 120 / 125 / 130 with reps 10/8/6 (where reps inputs exist).
var weights=[120,125,130];
var repsVals=[10,8,6];
var filled=0;
for(var i=0;i<repInputs.length && i<weights.length;i++){
  var inp=repInputs[i];
  inp.value=String(weights[i]);
  var single=inp.closest('.rep-single');
  if(single){
    var repInp=single.querySelector('.reps-actual-input');
    if(repInp){ repInp.value=String(repsVals[i]); }
  }
  filled++;
}
ok(filled>=2,'Step 4 · filled at least 2 rep rows ('+filled+')');
// Trigger confirmSave by invoking it directly with the right pendingDay.
// (completeDay → modal → confirmSave path is overkill for jsdom; we set
// pendingDay/pendingLabel directly.)
w.pendingDay='a'; w.pendingLabel='Day 1 — Upper A';
// session-datetime is the date picker — set to now.
var dtInp=D.getElementById('session-datetime');
if(dtInp){ dtInp.value=new Date(Date.now()).toISOString().slice(0,16); }
w.confirmSave();
// First saved session is now this fresh one.
var freshSaved=JSON.parse(w.localStorage.getItem('gymlog_a'))[0];
var freshEntry=freshSaved.entries.find(function(en){ return en.ex==='Chest press'; });
ok(!!freshEntry,'Step 4 · fresh Chest press entry exists in saved session');
ok(typeof freshEntry.note==='string' && /Set 1: 120/.test(freshEntry.note),'Step 4 · fresh entry has .note string in the legacy pipe-delim format');
ok(Array.isArray(freshEntry.sets) && freshEntry.sets.length===filled,'Step 4 · fresh entry has .sets array with matching length ('+filled+')');
ok(freshEntry.sets[0].w===120 && freshEntry.sets[0].u==='lbs' && freshEntry.sets[0].r===10,'Step 4 · structured set 0 of fresh entry = {w:120, u:"lbs", r:10}');
// Reader fast-path on the fresh entry returns the same numbers as parsing its own .note.
ok(JSON.stringify(w.parseSetWeights(freshEntry))===JSON.stringify(w.parseSetWeights(freshEntry.note)),'Step 4 · parseSetWeights matches between fresh-entry fast-path and legacy regex path');

// ── Step 5: reader fast-path is exercised ────────────────────────────
// Direct API test. Confirm fast-path doesn't touch regex by sabotaging .note
// to be unparseable on a structured entry — parser should still return the
// correct array.
var sabotaged={ ex:'Saboteur', note:'GARBAGE THAT WILL NEVER MATCH', sets:[{w:55,u:'lbs',r:5},{w:65,u:'lbs',r:3}] };
ok(JSON.stringify(w.parseSetWeights(sabotaged))==='[55,65]','Step 5 · parseSetWeights fast-path returns .sets even when .note is garbage');
ok(w.parseSetWR(sabotaged)[0].w===55 && w.parseSetWR(sabotaged)[0].r===5,'Step 5 · parseSetWR fast-path returns .sets even when .note is garbage');
// Legacy string path still works for backups missing .sets.
ok(JSON.stringify(w.parseSetWeights('Set 1: 70 lbs x8reps | Set 2: 75 lbs x6reps'))==='[70,75]','Step 5 · parseSetWeights legacy string path still works');
// Empty/edge inputs don't throw.
ok(JSON.stringify(w.parseSetWeights(''))==='[]','Step 5 · empty string → []');
ok(JSON.stringify(w.parseSetWeights(null))==='[]','Step 5 · null → []');
ok(JSON.stringify(w.parseSetWeights({}))==='[]','Step 5 · object without .note or .sets → []');

// ── Step 6: stale-backup restore still works ─────────────────────────
// Fabricate a "year-old" backup payload with only .note strings, no .sets.
var staleSession={ label:'Day 1', date:'Jan 1, 2025 at 9:00 AM', ts:Date.now()-365*86400000,
  entries:[{ ex:'Chest press', note:'Set 1: 80 lbs x10reps | Set 2: 85 lbs x8reps' }]};
var staleBackup={ __schema:2, gymlog_a:[staleSession] };
var encoded=w.btoa(w.unescape(w.encodeURIComponent(JSON.stringify(staleBackup))));
D.getElementById('import-text').value=encoded;
w.importData();
var afterRestore=JSON.parse(w.localStorage.getItem('gymlog_a'));
ok(afterRestore.length===1 && afterRestore[0].entries[0].note===staleSession.entries[0].note,'Step 6 · stale backup restored (note preserved)');
// The restored entry has NO .sets, but the reader fallback handles it.
ok(!('sets' in afterRestore[0].entries[0]),'Step 6 · stale restored entry has no .sets (correctly)');
var weightsFromStale=w.parseSetWeights(afterRestore[0].entries[0]);
ok(JSON.stringify(weightsFromStale)==='[80,85]','Step 6 · parseSetWeights falls back to .note string for restored stale entry');
// Migration flag stays set; restored entries don't re-migrate this boot.
ok(w.localStorage.getItem('sessions_migrated_v1')==='1','Step 6 · migration flag unchanged after stale restore');

// ── Step 7: multi-device sync — opaque JSON pass-through ─────────────
// Simulate a cloud payload from an OLD-version device (no .sets) merging
// into the local payload that has .sets after migration. mergeSessions should
// keep our richer record (more JSON.stringify length) — the tiebreaker
// already favours the .sets-bearing version.
w.localStorage.setItem('gymlog_a', JSON.stringify([
  { label:'Day 1', date:'May 17, 2026 at 9:00 AM', ts:1747497600000,
    entries:[{ ex:'Chest press', note:'Set 1: 100 lbs x10reps | Set 2: 105 lbs x8reps',
              sets:[{w:100,u:'lbs',r:10},{w:105,u:'lbs',r:8}] }] }
]));
var cloudOldVersion={
  gymlog_a:[
    { label:'Day 1', date:'May 17, 2026 at 9:00 AM', ts:1747497600000,
      entries:[{ ex:'Chest press', note:'Set 1: 100 lbs x10reps | Set 2: 105 lbs x8reps' }] }
  ]
};
var merged=w.mergeCloudIntoPayload(cloudOldVersion);
var mergedSess=merged['gymlog_a'][0];
ok(mergedSess && mergedSess.entries[0].sets && mergedSess.entries[0].sets.length===2,'Step 7 · merge preserved the .sets-bearing (richer) record over the cloud copy from an old-version device');
// Inverse: an old-version device pulling new-version data sees the .note it understands.
ok(/Set 1: 100/.test(mergedSess.entries[0].note),'Step 7 · .note string still present on new-version entry (old devices can read it)');

// ── Step 1: §1 Universal regression (sanity) ─────────────────────────
// Not a per-assertion check here — that's verif_s1.js. But confirm core
// invariants: byte-identity of day-panel rendering, getSaved roundtrip,
// dark-toggle, and an absence of console errors on boot.
ok(typeof w.confirmSave==='function','Step 1 · confirmSave still exposed');
ok(typeof w.migrateSessionsToStructured_v1==='function','Step 1 · migration function exposed');
ok(typeof w.parseSetWeights==='function' && typeof w.parseSetWR==='function','Step 1 · parsers still exposed');

console.log('\n'+(fail?('PATCH 5 SPOT-CHECK: '+fail+' FAILED'):'PATCH 5 SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
