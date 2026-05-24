'use strict';
// v2.60 — Patch 5 migration health line in Backup modal.
// Verifies the in-app diagnostic line reports each of the 4 states correctly:
// (a) OK   — flag set, every set-bearing entry has .sets
// (b) PARTIAL — flag set but some entries lack .sets (stale-backup restore case)
// (c) BAD  — flag not set (migration didn't run)
// (d) NEUTRAL — no lift sessions yet (fresh device)
const fs=require('fs');const{JSDOM}=require('jsdom');
const HTML=fs.readFileSync('C:\\dev\\gym-plan\\index.html','utf8');
function store(init){const m=new Map(Object.entries(init||{}));return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(''+k,''+v),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:i=>{const a=[...m.keys()];return i<a.length?a[i]:null;},get length(){return m.size;}};}
function app(st){
  const ctx=new Proxy(function(){return ctx;},{get:()=>ctx,set:()=>true,apply:()=>ctx});
  return new JSDOM(HTML,{runScripts:'dangerously',url:'https://s.test/',pretendToBeVisual:true,beforeParse(w){
    Object.defineProperty(w,'localStorage',{value:st,configurable:true});
    Object.defineProperty(w,'sessionStorage',{value:store({gym_test_mode:'1'}),configurable:true});
    w.fetch=()=>Promise.reject(new Error('no'));
    w.HTMLCanvasElement.prototype.getContext=()=>ctx;
  }}).window;
}
let fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };

// (d) Fresh device → neutral state.
let ST=store();
ST.setItem('gym_primary_device','1'); // v2.73+: write-action buttons require primary mode
let w=app(ST); let D=w.document;
ok(typeof w._renderPatch5Status==='function','helper · _renderPatch5Status exposed');
ok(typeof w._patch5DiagStats==='function','helper · _patch5DiagStats exposed');
w.showExportImport();
var el=D.getElementById('patch5-status');
ok(!!el,'markup · #patch5-status element exists in #panel-backup');
ok(/patch5-neutral/.test(el.className),'(d) no sessions → neutral state class');
ok(/No lift sessions logged yet/.test(el.innerHTML),'(d) no sessions → expected copy');

// (a) OK — seed migrated data, reopen modal.
ST.setItem('gymlog_a', JSON.stringify([
  { label:'Day 1', date:'May 17, 2026 at 9:00 AM', ts:Date.now()-86400000,
    entries:[
      { ex:'Chest press', note:'Set 1: 100 lbs x10reps | Set 2: 105 lbs x8reps',
        sets:[{w:100,u:'lbs',r:10},{w:105,u:'lbs',r:8}] },
      { ex:'Chest press-rpe', note:'RPE 8/10' }  // ignored — not a set-bearing entry
    ]}
]));
ST.setItem('sessions_migrated_v1','1');
w.close();
w=app(ST); D=w.document;
w.showExportImport();
el=D.getElementById('patch5-status');
ok(/patch5-ok/.test(el.className),'(a) flag=1 & all entries structured → patch5-ok class');
ok(/Structured sets on 1\/1/.test(el.innerHTML),'(a) reports 1/1 entries');
ok(/migration flag set/.test(el.innerHTML),'(a) message mentions flag set');
ok(el.innerHTML.indexOf('✓')!==-1,'(a) shows ✓ icon');

// (b) PARTIAL — add a restored stale entry that has .note but no .sets.
var d1=JSON.parse(ST.getItem('gymlog_a'));
d1.push({
  label:'Day 1', date:'Jan 1, 2025', ts:Date.now()-365*86400000,
  entries:[{ ex:'Chest press', note:'Set 1: 80 lbs x10reps | Set 2: 85 lbs x8reps' /* no .sets */ }]
});
ST.setItem('gymlog_a', JSON.stringify(d1));
// Modal is still open — close + reopen to re-render the diag.
D.getElementById('modal-overlay').classList.remove('show');
w.showExportImport();
el=D.getElementById('patch5-status');
ok(/patch5-warn/.test(el.className),'(b) some entries lack .sets → patch5-warn class');
ok(/Partial: 1\/2/.test(el.innerHTML),'(b) reports 1/2 entries migrated');
ok(/stale-backup restore/.test(el.innerHTML),'(b) explains stale-backup scenario');
ok(el.innerHTML.indexOf('⚠')!==-1,'(b) shows ⚠ icon');

// (c) BAD — strip the flag, reopen modal.
ST.removeItem('sessions_migrated_v1');
D.getElementById('modal-overlay').classList.remove('show');
w.showExportImport();
el=D.getElementById('patch5-status');
ok(/patch5-bad/.test(el.className),'(c) flag missing → patch5-bad class');
ok(/flag not set/.test(el.innerHTML),'(c) message says flag not set');
ok(/Reload the app/.test(el.innerHTML),'(c) suggests reload to trigger migration');
ok(el.innerHTML.indexOf('✗')!==-1,'(c) shows ✗ icon');

// Read-only — calling the diag does NOT mutate localStorage.
var beforeKeys=[];
for(var i=0;i<ST.length;i++) beforeKeys.push(ST.key(i));
var beforeSnap=beforeKeys.map(function(k){ return k+'='+ST.getItem(k); }).join('|');
w._renderPatch5Status();
w._renderPatch5Status();
w._renderPatch5Status();
var afterKeys=[];
for(var j=0;j<ST.length;j++) afterKeys.push(ST.key(j));
var afterSnap=afterKeys.map(function(k){ return k+'='+ST.getItem(k); }).join('|');
ok(beforeSnap===afterSnap,'read-only · 3 calls to _renderPatch5Status() do not mutate localStorage');

// CSS sanity: status rule + state classes present in stylesheet.
var src=fs.readFileSync('C:\\dev\\gym-plan\\index.html','utf8');
ok(/\.patch5-status\{[^}]*color:var\(--muted\)/.test(src),'CSS · base .patch5-status uses --muted token');
ok(/\.patch5-status\.patch5-ok \.patch5-icon\{color:var\(--good\)\}/.test(src),'CSS · OK icon = --good');
ok(/\.patch5-status\.patch5-warn \.patch5-icon\{color:var\(--warn\)\}/.test(src),'CSS · WARN icon = --warn');
ok(/\.patch5-status\.patch5-bad \.patch5-icon\{color:var\(--bad\)\}/.test(src),'CSS · BAD icon = --bad');
ok(!/patch5-status[^{]*\{[^}]*#[0-9A-Fa-f]{3,6}/.test(src.match(/\.patch5-status[^]*?body\.dark/)?src.match(/\.patch5-status[^]*?body\.dark/)[0]:''),'CSS · no raw hex colors in .patch5-status rules (themed via tokens)');

// ─── v2.62 Stricter "set-bearing" counter ─────────────────────────────
// Unparseable notes that start with "Set " (e.g. "Set up the rack", "Set 1: no weight today")
// must NOT count toward totalSet — they're outside the migration's scope.
ST.clear();
ST.setItem('gym_primary_device','1'); // re-set after clear (v2.73+ reader default)
ST.setItem('gymlog_a', JSON.stringify([
  { label:'Day 1', date:'May 17, 2026 at 9:00 AM', ts:Date.now()-86400000,
    entries:[
      // Real parseable entries — should count + migrate.
      { ex:'Chest press', note:'Set 1: 100 lbs x10reps | Set 2: 105 lbs x8reps',
        sets:[{w:100,u:'lbs',r:10},{w:105,u:'lbs',r:8}] },
      // Unparseable: starts with "Set " but no "Set N: weight" pattern anywhere.
      { ex:'Bench notes', note:'Set up the rack at notch 4' },
      // Unparseable: looks like a set row but has no weight number.
      { ex:'Skipped lift', note:'Set 1: skipped today' },
      // Unparseable: "Set" without digits.
      { ex:'Stretch note', note:'Set complete, felt strong' }
    ]}
]));
ST.setItem('sessions_migrated_v1','1');
w.close();
w=app(ST); D=w.document;
w.showExportImport();
el=D.getElementById('patch5-status');
ok(/patch5-ok/.test(el.className),'v2.62 · unparseable notes excluded → state reads OK (not partial)');
ok(/1\/1 entries/.test(el.innerHTML),'v2.62 · only the real parseable entry counts (1/1)');
// Verify the stats helper directly.
var stats=w._patch5DiagStats();
ok(stats.totalSet===1,'v2.62 · _patch5DiagStats.totalSet=1 (the 3 unparseable notes ignored)');
ok(stats.withSets===1,'v2.62 · _patch5DiagStats.withSets=1');

// Mixed case: 2 parseable (one migrated, one not yet) + 2 unparseable.
// Expect: 2/1 partial, with Re-run available; after Re-run → 2/2 ✓.
ST.setItem('gymlog_a', JSON.stringify([
  { label:'Day 1', date:'May 17, 2026', ts:Date.now()-86400000,
    entries:[
      { ex:'Chest press', note:'Set 1: 100 lbs x10reps',
        sets:[{w:100,u:'lbs',r:10}] },
      { ex:'Lat pulldown', note:'Set 1: 80 lbs x12reps' /* stale, no .sets */ },
      { ex:'Note A', note:'Set up the rack' },
      { ex:'Note B', note:'Set 1: skipped' }
    ]}
]));
ST.setItem('sessions_migrated_v1','1');
w.close();
w=app(ST); D=w.document;
w.showExportImport();
el=D.getElementById('patch5-status');
ok(/patch5-warn/.test(el.className),'v2.62 · 1 stale + 2 unparseable + 1 fresh → partial state');
ok(/1\/2 entries/.test(el.innerHTML),'v2.62 · partial reports 1/2 (unparseable not counted)');
// Re-run should migrate the 1 stale entry → 2/2.
// v2.65: capture the full toast log since multiple toasts now fire per Repair (initial + cloud-sync result).
var origToast2=w.showToast; var lastToast=''; var toastLogV62=[];
w.showToast=function(m){ lastToast=m; toastLogV62.push(m); };
w.reRunMigration();
// v2.63: toast text changed to "Repaired: migrated N…". v2.65: a follow-up
// "Cloud sync ✓" toast lands AFTER the "Repaired" one, so lastToast may be
// the cloud toast. Switch to searching the toast log.
ok(toastLogV62.some(function(t){return /Repaired:.*migrated 1 more entry/.test(t);}),'v2.62 · Re-run reports 1 newly migrated (v2.63 toast format)');
el=D.getElementById('patch5-status');
ok(/patch5-ok/.test(el.className) && /2\/2 entries/.test(el.innerHTML),'v2.62 · after Re-run → OK 2/2 (unparseable still ignored)');
w.showToast=origToast2;

// ─── v2.61 Re-run migration button ───────────────────────────────────
// (b) partial state should expose a Re-run button.
ST.removeItem('sessions_migrated_v1');
ST.setItem('gymlog_a', JSON.stringify([
  // 2 entries that DO have .sets, 1 stale (no .sets) — partial state.
  { label:'Day 1', date:'May 17, 2026 at 9:00 AM', ts:Date.now()-86400000,
    entries:[
      { ex:'Chest press', note:'Set 1: 100 lbs x10reps | Set 2: 105 lbs x8reps',
        sets:[{w:100,u:'lbs',r:10},{w:105,u:'lbs',r:8}] },
      { ex:'Lat pulldown', note:'Set 1: 80 lbs x12reps',
        sets:[{w:80,u:'lbs',r:12}] }
    ]},
  { label:'Day 1 stale', date:'Jan 1, 2025', ts:Date.now()-365*86400000,
    entries:[
      { ex:'Bench press', note:'Set 1: 70 lbs x10reps | Set 2: 75 lbs x8reps' /* no .sets */ }
    ]}
]));
ST.setItem('sessions_migrated_v1','1');
w.close();
w=app(ST); D=w.document;
w.showExportImport();
el=D.getElementById('patch5-status');
ok(/patch5-warn/.test(el.className),'v2.61 · partial state ready for Re-run check');
ok(/Re-run migration/.test(el.innerHTML),'v2.61 · partial state surfaces Re-run button');
ok(typeof w.reRunMigration==='function','v2.61 · reRunMigration() exposed');
var rerunBtn=D.querySelector('.patch5-rerun-btn');
ok(!!rerunBtn,'v2.61 · .patch5-rerun-btn rendered in partial state');
ok(/reRunMigration\(\)/.test(rerunBtn.getAttribute('onclick')||''),'v2.61 · button wired to reRunMigration()');

// Capture toasts during re-run.
var toastLog=[];
var origToast=w.showToast; w.showToast=function(m){ toastLog.push(m); };
// Click the button.
rerunBtn.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));
// Verify the stale entry got migrated.
var afterRerun=JSON.parse(ST.getItem('gymlog_a'));
ok(Array.isArray(afterRerun[1].entries[0].sets),'v2.61 · stale entry now has .sets after Re-run');
ok(afterRerun[1].entries[0].sets.length===2,'v2.61 · re-migrated entry has 2 sets parsed');
ok(afterRerun[1].entries[0].sets[0].w===70 && afterRerun[1].entries[0].sets[0].r===10,'v2.61 · re-migrated set 0 = {w:70, r:10}');
ok(afterRerun[1].entries[0].note==='Set 1: 70 lbs x10reps | Set 2: 75 lbs x8reps','v2.61 · .note preserved on re-migrated entry (rollback safety net)');
// Already-migrated entries untouched (identity preserved).
ok(afterRerun[0].entries[0].sets[0].w===100,'v2.61 · already-migrated entry NOT re-written (sets[0].w still 100)');
ok(toastLog.length>=1 && /Repaired:.*migrated 1 more entry/.test(toastLog[0]),'v2.61 · toast reports "Migrated 1 more entry" (v2.63 "Repaired:" prefix)');
ok(ST.getItem('sessions_migrated_v1')==='1','v2.61 · flag re-set after Re-run completes');

// Diagnostic now reads OK (3/3).
el=D.getElementById('patch5-status');
ok(/patch5-ok/.test(el.className),'v2.61 · diagnostic flips to OK after Re-run resolves the partial');
ok(/3\/3 entries/.test(el.innerHTML),'v2.61 · diagnostic reports 3/3');

// Idempotency: a second Re-run with nothing left to migrate emits the no-op toast.
toastLog.length=0;
rerunBtn = D.querySelector('.patch5-rerun-btn'); // may be gone now since state is OK
// v2.70: scope to diagnostic-line button (the multi-device Pull button is always visible).
rerunBtn = D.querySelector('#patch5-status .patch5-rerun-btn');
ok(!rerunBtn,'v2.61 · Re-run button hidden once state is OK (scoped to diagnostic line)');
// Force-call reRunMigration directly to test the no-op path.
w.reRunMigration();
// v2.63: no-op toast text changed to "Data already clean".
ok(toastLog.length>=1 && /already clean/.test(toastLog[toastLog.length-1]),'v2.61 · no-op Re-run emits "Data already clean" toast (v2.63 wording)');

// (c) BAD state also exposes Re-run.
ST.removeItem('sessions_migrated_v1');
D.getElementById('modal-overlay').classList.remove('show');
w.showExportImport();
el=D.getElementById('patch5-status');
// Wait — calling showExportImport might trigger migration internally? No, that's only at boot.
// Actually, _renderPatch5Status runs but doesn't migrate. So state should be BAD now.
ok(/patch5-bad/.test(el.className) || /patch5-warn/.test(el.className),'v2.61 · cleared flag → bad-or-warn state');
ok(/Re-run migration/.test(el.innerHTML),'v2.61 · bad state also surfaces Re-run button');

w.showToast=origToast;

console.log('\n'+(fail?('PATCH 5 HEALTH SPOT-CHECK: '+fail+' FAILED'):'PATCH 5 HEALTH SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
