'use strict';
// v2.69 — duplicate-session detector + dedupe action, replicating the user's
// real-data corruption pattern (post-Split merge created a duplicate May 6 session).
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
  }}).window;
}
let fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };

// Replicate the user's state: TWO May 6 Day D sessions, same ts + label,
// different entry shapes (one cleaned/split, one original-labeled).
const SAME_TS=Date.parse('2026-05-06T23:18:00');
const ST=store();
ST.setItem('gym_primary_device','1'); // v2.73+: write-action buttons require primary mode
ST.setItem('gymlog_d', JSON.stringify([
  // Canonical post-split session (richer: 4 entries with .sets)
  { label:'Day 4 — Upper B', date:'Wed, May 6, 2026 at 11:18 PM', ts:SAME_TS,
    entries:[
      { ex:'Lat pulldown wide', note:'Set 1: 100 lbs', sets:[{w:100,u:'lbs',r:null}] },
      { ex:'Pec fly', note:'Set 1: 90 lbs | Set 2: 90 lbs | Set 3: 90 lbs',
        sets:[{w:90,u:'lbs',r:null},{w:90,u:'lbs',r:null},{w:90,u:'lbs',r:null}] },
      { ex:'Rear delt', note:'Set 1: 90 lbs | Set 2: 90 lbs | Set 3: 90 lbs',
        sets:[{w:90,u:'lbs',r:null},{w:90,u:'lbs',r:null},{w:90,u:'lbs',r:null}] },
      { ex:'Tricep rope', note:'Set 1: 100 lbs', sets:[{w:100,u:'lbs',r:null}] }
    ]},
  // Pre-split duplicate (stale: 3 entries with the labeled Pec fly)
  { label:'Day 4 — Upper B', date:'Wed, May 6, 2026 at 11:18 PM', ts:SAME_TS,
    entries:[
      { ex:'Lat pulldown wide', note:'Set 1: 100 lbs' },
      { ex:'Pec fly', note:'Set 1: Rear: 90 lbs pec: 90 lbs | Set 2: Rear: 90 lbs pec: 90 lbs | Set 3: Rear: 90 lbs pec: 90 lbs' },
      { ex:'Tricep rope', note:'Set 1: 100 lbs' }
    ]}
]));
ST.setItem('sessions_migrated_v1','1');

const w=app(ST); const D=w.document;

// ─── Detection ─────────────────────────────────────────────────────────
var groups=w._findDuplicateSessions();
ok(groups.length===1,'detect · finds 1 duplicate group');
ok(groups[0].length===2,'detect · group has 2 sessions');
var stats=w._patch5DiagStats();
ok(stats.duplicateSessions===1,'detect · diagnostic counts 1 redundant copy (group of 2 → 1 excess)');

// ─── Diagnostic UI surfaces dedup button ──────────────────────────────
w.showExportImport();
var el=D.getElementById('patch5-status');
ok(/duplicate session/.test(el.innerHTML),'modal · diagnostic mentions duplicate sessions');
ok(/Deduplicate sessions/.test(el.innerHTML),'modal · "Deduplicate sessions" button rendered');

// ─── Capture toasts + sync, tap Dedupe ────────────────────────────────
var toastLog=[];
var origToast=w.showToast; w.showToast=function(m){ toastLog.push(m); };
var syncCalled=false, syncOpts=null;
var origSync=w.syncToJbin; w.syncToJbin=function(cb,opts){ syncCalled=true; syncOpts=opts; if(cb) cb(true); };

w.dedupeDuplicateSessions();

// ─── Post-dedup verification ──────────────────────────────────────────
var dAfter=JSON.parse(w.localStorage.getItem('gymlog_d'));
ok(dAfter.length===1,'dedupe · only 1 session remains in Day D (was 2)');
ok(dAfter[0].entries.length===4,'dedupe · kept the canonical (richer) session — 4 entries');
// Pec fly entry kept is the clean (split) version, not the labeled one.
var pec=dAfter[0].entries.find(function(e){ return e.ex==='Pec fly'; });
ok(pec && pec.note==='Set 1: 90 lbs | Set 2: 90 lbs | Set 3: 90 lbs','dedupe · kept Pec fly entry has clean note (not labeled)');
ok(!/Rear:/i.test(pec.note),'dedupe · kept Pec fly entry has no "Rear:" labels');
// Rear delt entry from the split survives.
var rear=dAfter[0].entries.find(function(e){ return e.ex==='Rear delt'; });
ok(!!rear,'dedupe · split-created Rear delt entry preserved');

// Toast + authoritative sync.
var initialToast=toastLog.find(function(t){return /Removed 1 duplicate session.*syncing/.test(t);});
ok(!!initialToast,'dedupe · initial toast reports removed count + syncing…');
ok(syncCalled,'dedupe · syncToJbin called');
ok(syncOpts && syncOpts.authoritative===true,'dedupe · cloud push uses authoritative:true (no merge → no re-duplication)');
var syncToast=toastLog.find(function(t){return /Cloud sync ✓/.test(t);});
ok(!!syncToast,'dedupe · success-path Cloud sync ✓ follow-up toast fired');

// ─── Idempotency ──────────────────────────────────────────────────────
toastLog.length=0; syncCalled=false;
w.dedupeDuplicateSessions();
ok(toastLog.length>=1 && /No duplicate sessions/.test(toastLog[0]),'idempotent · second tap reports no duplicates');
ok(!syncCalled,'idempotent · no cloud sync on no-op');

// Diagnostic flips to OK.
w.showToast=origToast;
w._renderPatch5Status();
el=D.getElementById('patch5-status');
ok(/patch5-ok/.test(el.className),'post-dedup · diagnostic flips to OK');
// v2.70: the multi-device-row's Pull button is always visible — scope to diagnostic line buttons.
ok(!D.querySelector('#patch5-status .patch5-rerun-btn'),'post-dedup · diagnostic-line action buttons hidden');

// ─── Split now uses authoritative push too ────────────────────────────
// Re-seed a combined Pec fly so we can test Split's sync call.
ST.setItem('gymlog_d', JSON.stringify([
  { label:'Day 4', date:'Wed, May 6, 2026 at 11:18 PM', ts:SAME_TS,
    entries:[
      { ex:'Pec fly', note:'Set 1: Rear: 90 lbs pec: 90 lbs | Set 2: Rear: 90 lbs pec: 90 lbs' }
    ]}
]));
const w2=app(ST);
var splitSyncOpts=null;
w2.syncToJbin=function(cb,opts){ splitSyncOpts=opts; if(cb) cb(true); };
w2.splitRearPecCombined();
ok(splitSyncOpts && splitSyncOpts.authoritative===true,'v2.69 · Split now pushes authoritatively (prevents merge from re-creating the duplicate)');

console.log('\n'+(fail?('PATCH 5 DEDUPE SPOT-CHECK: '+fail+' FAILED'):'PATCH 5 DEDUPE SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
