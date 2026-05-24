'use strict';
// v2.68 — split Rear+Pec combined entries into two separate exercise entries.
// Uses the user's exact Day D Pec fly pattern as the canonical fixture.
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

// Seed the user's actual Day D Pec fly entry alongside other clean entries.
const ST=store();
ST.setItem('gym_primary_device','1'); // v2.73+: write-action buttons require primary mode
ST.setItem('gymlog_d', JSON.stringify([
  { label:'Day 4', date:'Wed, May 6, 2026 at 11:18 PM', ts:Date.parse('2026-05-06T23:18:00'),
    entries:[
      { ex:'Lat pulldown wide', note:'Set 1: 100 lbs | Set 2: 100 lbs | Set 3: 100 lbs',
        sets:[{w:100,u:'lbs',r:null},{w:100,u:'lbs',r:null},{w:100,u:'lbs',r:null}] },
      { ex:'Pec fly', note:'Set 1: Rear: 90 lbs pec: 90 lbs | Set 2: Rear: 90 lbs pec: 90 lbs | Set 3: Rear: 90 lbs pec: 90 lbs',
        sets:[{w:90,u:'lbs',r:null},{w:90,u:'lbs',r:null},{w:90,u:'lbs',r:null}] },
      { ex:'Pec fly-notes', note:'Rear was tough.' }
    ]}
]));
ST.setItem('sessions_migrated_v1','1');

const w=app(ST); const D=w.document;

// ─── Detection ─────────────────────────────────────────────────────────
var hits=w._findRearPecCombined();
ok(hits.length===1,'detect · finds exactly 1 Rear+Pec combined entry');
ok(hits[0].day==='d' && hits[0].ex==='Pec fly','detect · correct day=d, ex="Pec fly"');
var stats=w._patch5DiagStats();
ok(stats.combinedRearPec===1,'detect · diagnostic counts 1 combined entry');

// ─── Diagnostic UI surfaces split button ───────────────────────────────
w.showExportImport();
var el=D.getElementById('patch5-status');
ok(/patch5-warn/.test(el.className),'modal · diagnostic in warn state due to combined entry');
ok(/Rear \+ Pec in one note/.test(el.innerHTML),'modal · message mentions Rear+Pec combined');
ok(/Split into Rear delt \+ Pec fly/.test(el.innerHTML),'modal · "Split" button rendered');

// ─── Capture toasts + sync, tap Split ─────────────────────────────────
var toastLog=[];
var origToast=w.showToast; w.showToast=function(m){ toastLog.push(m); };
var syncCalled=false;
var origSync=w.syncToJbin; w.syncToJbin=function(cb){ syncCalled=true; if(cb) cb(true); };

w.splitRearPecCombined();

// ─── Post-split verification ──────────────────────────────────────────
var dAfter=JSON.parse(w.localStorage.getItem('gymlog_d'));
ok(dAfter[0].entries.length===4,'split · Day D session now has 4 entries (was 3 — added 1 Rear delt)');

// Pec fly entry was rewritten in place.
var pecAfter=dAfter[0].entries[1]; // same index — splice inserted AFTER
ok(pecAfter.ex==='Pec fly','split · original entry index 1 still "Pec fly"');
ok(pecAfter.note==='Set 1: 90 lbs | Set 2: 90 lbs | Set 3: 90 lbs','split · Pec fly note rewritten to canonical clean format');
ok(!/Rear|pec:/i.test(pecAfter.note),'split · Pec fly note has no leftover Rear/pec labels');
ok(Array.isArray(pecAfter.sets) && pecAfter.sets.length===3,'split · Pec fly .sets has 3 entries');
ok(pecAfter.sets[0].w===90 && pecAfter.sets[0].u==='lbs','split · Pec fly .sets[0] = {w:90, u:"lbs"}');

// New Rear delt entry was inserted right after Pec fly.
var rearAfter=dAfter[0].entries[2];
ok(rearAfter.ex==='Rear delt','split · new entry at index 2 is "Rear delt"');
ok(rearAfter.note==='Set 1: 90 lbs | Set 2: 90 lbs | Set 3: 90 lbs','split · Rear delt note in canonical format');
ok(Array.isArray(rearAfter.sets) && rearAfter.sets.length===3,'split · Rear delt .sets has 3 entries');
ok(rearAfter.sets[0].w===90,'split · Rear delt .sets[0].w = 90');

// Surrounding entries untouched.
ok(dAfter[0].entries[0].ex==='Lat pulldown wide','split · entry 0 (Lat pulldown wide) unchanged');
ok(dAfter[0].entries[3].ex==='Pec fly-notes','split · trailing Pec fly-notes pushed to index 3 (still in session)');

// Toast + sync.
var initialToast=toastLog.find(function(t){return /Split 1 Rear\+Pec entry.*syncing/.test(t);});
ok(!!initialToast,'split · initial toast reports "Split 1 Rear+Pec entry · syncing…"');
ok(/entry/.test(initialToast) && !/entries/.test(initialToast),'split · singular grammar correct ("entry" not "entries")');
ok(syncCalled,'split · syncToJbin called → split persists to cloud');
var syncToast=toastLog.find(function(t){return /Cloud sync ✓/.test(t);});
ok(!!syncToast,'split · success-path "Cloud sync ✓" follow-up toast fired');

// ─── Idempotency: re-tap does nothing ──────────────────────────────────
toastLog.length=0; syncCalled=false;
w.splitRearPecCombined();
ok(toastLog.length>=1 && /No combined Rear\+Pec/.test(toastLog[0]),'idempotent · second tap reports "No combined Rear+Pec entries"');
ok(!syncCalled,'idempotent · no cloud sync triggered on no-op');

// Diagnostic flips to OK.
w.showToast=origToast;
w._renderPatch5Status();
el=D.getElementById('patch5-status');
ok(/patch5-ok/.test(el.className),'post-split · diagnostic flips to OK');
// v2.70: scope to diagnostic-line buttons (the multi-device Pull button is always visible).
ok(!D.querySelector('#patch5-status .patch5-rerun-btn'),'post-split · diagnostic-line action buttons hidden once clean');

// Pec fly chart sanity: getExerciseProgress for "Pec fly" should now only
// see the 1 entry from Day D + any other Pec fly history. The Rear delt
// entry should NOT count toward Pec fly's history anymore.
var pecHistory=w.getExerciseProgress('pec fly');
ok(pecHistory.length===1,'chart · getExerciseProgress("pec fly") has 1 entry (just the cleaned Day D)');
ok(pecHistory[0].top===90,'chart · Pec fly Day D top weight = 90 (unchanged numerically)');
// Rear delt history should pick up the new May 6 entry.
var rearHistory=w.getExerciseProgress('rear delt');
ok(rearHistory.length===1 && rearHistory[0].top===90,'chart · Rear delt now has Day D 90 lbs in history');

// ─── Mixed-shape entry is correctly skipped (safety) ──────────────────
ST.setItem('gymlog_d', JSON.stringify([
  { label:'Day 4 mixed', date:'Sun, May 1, 2026', ts:Date.parse('2026-05-01T12:00:00'),
    entries:[
      // Mixed shape: set 1 has both labels, set 2 is clean — too ambiguous to auto-split.
      { ex:'Pec fly', note:'Set 1: Rear: 90 lbs pec: 90 lbs | Set 2: 90 lbs' }
    ]}
]));
const w2=app(ST);
var mixedHits=w2._findRearPecCombined();
ok(mixedHits.length===0,'safety · mixed-shape entry (some segments labeled, some clean) is correctly NOT detected');

// ─── Different rear vs pec values are handled correctly ──────────────
ST.setItem('gymlog_d', JSON.stringify([
  { label:'Day 4 diff', date:'Sun, May 1, 2026', ts:Date.parse('2026-05-01T12:00:00'),
    entries:[
      { ex:'Pec fly', note:'Set 1: Rear: 80 lbs pec: 100 lbs | Set 2: Rear: 85 lbs pec: 95 lbs' }
    ]}
]));
const w3=app(ST);
w3.splitRearPecCombined();
var diffAfter=JSON.parse(w3.localStorage.getItem('gymlog_d'));
ok(diffAfter[0].entries[0].note==='Set 1: 100 lbs | Set 2: 95 lbs','differing values · Pec fly captures pec values (100, 95)');
ok(diffAfter[0].entries[1].note==='Set 1: 80 lbs | Set 2: 85 lbs','differing values · Rear delt captures rear values (80, 85)');
ok(diffAfter[0].entries[1].sets[0].w===80 && diffAfter[0].entries[1].sets[1].w===85,'differing values · Rear delt .sets preserves the per-set weights');

console.log('\n'+(fail?('PATCH 5 SPLIT SPOT-CHECK: '+fail+' FAILED'):'PATCH 5 SPLIT SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
