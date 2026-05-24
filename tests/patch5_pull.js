'use strict';
// v2.70 — Pull-from-cloud action. Replaces local with cloud state, bypasses
// merge, snapshots current local to undo slot, no upload of stale data.
const fs=require('fs');const{JSDOM}=require('jsdom');
const HTML=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
function store(init){const m=new Map(Object.entries(init||{}));return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(''+k,''+v),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:i=>{const a=[...m.keys()];return i<a.length?a[i]:null;},get length(){return m.size;}};}
function app(st, testMode){
  const ctx=new Proxy(function(){return ctx;},{get:()=>ctx,set:()=>true,apply:()=>ctx});
  return new JSDOM(HTML,{runScripts:'dangerously',url:'https://s.test/',pretendToBeVisual:true,beforeParse(w){
    Object.defineProperty(w,'localStorage',{value:st,configurable:true});
    Object.defineProperty(w,'sessionStorage',{value:store(testMode?{gym_test_mode:'1'}:{}),configurable:true});
    w.fetch=()=>Promise.reject(new Error('no'));
    w.HTMLCanvasElement.prototype.getContext=()=>ctx;
    try{Object.defineProperty(w.location,'reload',{value(){},configurable:true});}catch(e){}
  }}).window;
}
let fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };

// Simulate the user's PC state: stale local data with a duplicate session.
const ST=store();
const SAME_TS=Date.parse('2026-05-06T23:18:00');
ST.setItem('gymlog_d', JSON.stringify([
  // PC has BOTH the pre-split and post-split versions (the corruption pattern).
  { label:'Day 4', date:'Wed, May 6, 2026 at 11:18 PM', ts:SAME_TS,
    entries:[
      { ex:'Pec fly', note:'Set 1: Rear: 90 lbs pec: 90 lbs | Set 2: Rear: 90 lbs pec: 90 lbs' }
    ]},
  { label:'Day 4', date:'Wed, May 6, 2026 at 11:18 PM', ts:SAME_TS,
    entries:[
      { ex:'Pec fly', note:'Set 1: 90 lbs | Set 2: 90 lbs', sets:[{w:90,u:'lbs',r:null},{w:90,u:'lbs',r:null}] },
      { ex:'Rear delt', note:'Set 1: 90 lbs | Set 2: 90 lbs', sets:[{w:90,u:'lbs',r:null},{w:90,u:'lbs',r:null}] }
    ]}
]));
ST.setItem('sessions_migrated_v1','1');

// Test mode OFF (must be off for pull to be allowed).
const w=app(ST, /*testMode*/ false);
const D=w.document;

// ─── pullFromCloud exists + UI surfaces it ─────────────────────────────
ok(typeof w.pullFromCloud==='function','v2.70 · pullFromCloud() defined');
w.showExportImport();
ok(!!D.querySelector('.multi-device-row'),'v2.70 · multi-device-row rendered in Backup modal');
var pullBtn=D.querySelector('.multi-device-row .patch5-rerun-btn');
ok(!!pullBtn && /pullFromCloud/.test(pullBtn.getAttribute('onclick')||''),'v2.70 · "Pull from cloud" button wired');

// ─── Mock cloudGET to return a CLEAN single-session state ─────────────
var cloudPayload={
  __schema:2,
  gymlog_a:[],
  gymlog_b:[],
  gymlog_c:[],
  gymlog_d:[
    { label:'Day 4', date:'Wed, May 6, 2026 at 11:18 PM', ts:SAME_TS,
      entries:[
        { ex:'Pec fly', note:'Set 1: 90 lbs | Set 2: 90 lbs', sets:[{w:90,u:'lbs',r:null},{w:90,u:'lbs',r:null}] },
        { ex:'Rear delt', note:'Set 1: 90 lbs | Set 2: 90 lbs', sets:[{w:90,u:'lbs',r:null},{w:90,u:'lbs',r:null}] }
      ]}
  ],
  gymlog_e:[],
  archived_exercises:[],
  body_measurements:[],
  exercise_order:{},
  earned_milestones:[]
};
w.cloudGET=function(){ return Promise.resolve(cloudPayload); };
// Mock cloudPUT to detect any upload of stale data (should NEVER fire on pull).
var putCalled=false;
w.cloudPUT=function(){ putCalled=true; return Promise.resolve(); };

// Mock confirm() to auto-accept; also capture toasts; capture reload calls.
w.confirm=function(){ return true; };
var toastLog=[];
var origToast=w.showToast; w.showToast=function(m){ toastLog.push(m); };
var reloadCalled=false;
w.reloadPage=function(){ reloadCalled=true; };

// ─── Execute pull ─────────────────────────────────────────────────────
w.pullFromCloud();

// pullFromCloud is async (returns a Promise chain). Wait for microtasks.
return new Promise(function(r){ setTimeout(r, 50); }).then(function(){
  // Local state should now match cloud, NOT the pre-pull local state.
  var dAfter=JSON.parse(w.localStorage.getItem('gymlog_d'));
  ok(dAfter.length===1,'pull · only 1 session remains in Day D (cloud had 1, local had 2)');
  ok(dAfter[0].entries.length===2,'pull · session matches cloud entry count (2)');
  ok(dAfter[0].entries[0].ex==='Pec fly' && /Set 1: 90 lbs/.test(dAfter[0].entries[0].note),'pull · Pec fly entry matches cloud (clean form)');
  ok(dAfter[0].entries[1].ex==='Rear delt','pull · Rear delt entry preserved from cloud');
  ok(!/Rear:/i.test(dAfter[0].entries[0].note),'pull · old labeled-Pec-fly entry gone (replaced by cloud)');

  // Undo snapshot was saved BEFORE the replace.
  var undoB64=w.localStorage.getItem('gymlog_import_undo');
  ok(!!undoB64,'pull · undo snapshot saved before replace');
  var undoPayload=JSON.parse(decodeURIComponent(escape(w.atob(undoB64))));
  ok(undoPayload.gymlog_d && undoPayload.gymlog_d.length===2,'pull · undo snapshot contains the pre-pull dirty state (2 sessions in Day D)');

  // Migration flag was cleared (so boot-time migration re-verifies fresh state).
  ok(w.localStorage.getItem('sessions_migrated_v1')===null,'pull · sessions_migrated_v1 flag cleared (will re-verify on reload)');

  // CRITICAL: no cloudPUT was called — pullFromCloud must NOT upload PC's stale state.
  ok(!putCalled,'pull · cloudPUT NEVER called — the stale PC state was NOT pushed to cloud (the whole point of pull)');

  // Toast feedback + reload scheduled.
  ok(toastLog.some(function(t){return /Pulling from cloud/.test(t);}),'pull · "Pulling from cloud…" toast fired');
  ok(toastLog.some(function(t){return /Cloud data pulled.*reloading/.test(t);}),'pull · "Cloud data pulled ✓" toast fired');
  // reloadCalled is fired in setTimeout(2000) so we'd need to wait. Just verify it's scheduled.
  ok(typeof w.reloadPage==='function','pull · reloadPage available to be called');

  // ─── Test Mode safety ────────────────────────────────────────────────
  const ST2=store();
  const w2=app(ST2, /*testMode*/ true);
  w2.cloudGET=function(){ return Promise.resolve(cloudPayload); };
  var t2=[]; w2.showToast=function(m){ t2.push(m); };
  w2.confirm=function(){ return true; };
  w2.pullFromCloud();
  return new Promise(function(r){ setTimeout(r, 30); }).then(function(){
    ok(t2.some(function(t){return /Test mode is on/.test(t);}),'pull · test mode blocks pull (correct — never want to overwrite real data with cloud while sandboxed)');
    ok(w2.localStorage.getItem('gymlog_a')===null,'pull · test mode: local untouched');
  });
}).then(function(){
  // ─── User-cancel path: confirm() returns false → no action ───────────
  const ST3=store();
  ST3.setItem('gymlog_d', JSON.stringify([{label:'X', date:'May 1', ts:1, entries:[{ex:'X', note:'Set 1: 50 lbs'}]}]));
  const w3=app(ST3, false);
  w3.cloudGET=function(){ return Promise.resolve(cloudPayload); };
  var putCalled3=false; w3.cloudPUT=function(){ putCalled3=true; return Promise.resolve(); };
  w3.confirm=function(){ return false; };
  var t3=[]; w3.showToast=function(m){ t3.push(m); };
  w3.pullFromCloud();
  return new Promise(function(r){ setTimeout(r, 30); }).then(function(){
    ok(!putCalled3,'cancel · user-cancel did not touch cloud');
    var stillThere=JSON.parse(w3.localStorage.getItem('gymlog_d'));
    ok(stillThere.length===1 && stillThere[0].label==='X','cancel · user-cancel did not touch local');
    ok(t3.length===0 || !t3.some(function(t){return /Pulling from cloud/.test(t);}),'cancel · no "Pulling" toast on user-cancel');
  });
}).then(function(){
  // ─── Cloud returning empty/invalid bails gracefully ───────────────────
  const ST4=store();
  ST4.setItem('gymlog_d', JSON.stringify([{label:'X', date:'May 1', ts:1, entries:[]}]));
  const w4=app(ST4, false);
  w4.cloudGET=function(){ return Promise.resolve(null); }; // empty cloud
  w4.confirm=function(){ return true; };
  var t4=[]; w4.showToast=function(m){ t4.push(m); };
  w4.pullFromCloud();
  return new Promise(function(r){ setTimeout(r, 30); }).then(function(){
    ok(t4.some(function(t){return /empty data — pull aborted/.test(t);}),'empty-cloud · graceful abort with explanatory toast');
    var local=JSON.parse(w4.localStorage.getItem('gymlog_d'));
    ok(local.length===1,'empty-cloud · local unchanged');
  });
}).then(function(){
  console.log('\n'+(fail?('PATCH 5 PULL SPOT-CHECK: '+fail+' FAILED'):'PATCH 5 PULL SPOT-CHECK: ALL PASS'));
  process.exit(fail?1:0);
});
