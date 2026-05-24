'use strict';
// v3.9 — finalization hardening: confirm-on-Reset (manual only), installable-PWA
// meta, and memoized history scans (self-invalidating).
const fs=require('fs');const{JSDOM}=require('jsdom');
const ROOT='C:\\dev\\gym-plan\\';
const HTML=fs.readFileSync(ROOT+'index.html','utf8');
function store(i){const m=new Map(Object.entries(i||{}));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(''+k,''+v),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:x=>{const a=[...m.keys()];return x<a.length?a[x]:null},get length(){return m.size}};}
function app(st){
  const ctx=new Proxy(function(){return ctx},{get:()=>ctx,set:()=>true,apply:()=>ctx});
  return new JSDOM(HTML,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
    Object.defineProperty(w,'localStorage',{value:st,configurable:true});
    Object.defineProperty(w,'sessionStorage',{value:store({gym_test_mode:'1'}),configurable:true});
    w.fetch=()=>Promise.reject(new Error('no'));
    w.HTMLCanvasElement.prototype.getContext=()=>ctx;
    w.confirm=()=>true; w.prompt=()=>'';
  }}).window;
}
let fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };

// ── installable PWA meta present ──
ok(/name="apple-mobile-web-app-capable"\s+content="yes"/.test(HTML),'apple-mobile-web-app-capable = yes');
ok(/name="theme-color"\s+content="#5B4EA8"/.test(HTML),'theme-color meta present');
ok(/rel="manifest"/.test(HTML),'web app manifest linked');
ok(/status-bar-style"\s+content="default"/.test(HTML),'status bar style = default (no notch overlap)');

// ── Test Mode sandboxes the day cycle + library so phone testing can't leak ──
ok(/TEST_EXTRA_KEYS=\[[^\]]*'days_config_v1'[^\]]*\]/.test(HTML),'Test Mode snapshots days_config_v1 (day add/remove/rename is sandboxed)');
ok(/TEST_EXTRA_KEYS=\[[^\]]*'exercise_library_v1'[^\]]*\]/.test(HTML),'Test Mode snapshots exercise_library_v1');
ok(/TEST_EXTRA_KEYS=\[[^\]]*'plan_v2'[^\]]*\]/.test(HTML),'Test Mode snapshots plan_v2');

// ── confirm-on-Reset: only nags when there is real in-progress work ──
const ST=store(); ST.setItem('gym_primary_device','1');
const w=app(ST); const D=w.document;
var ov=D.getElementById('reset-overlay');
ok(!!ov && !!D.getElementById('reset-msg'),'reset confirm modal exists');
// nothing entered → resets silently (no modal)
w.confirmReset('a',10);
ok(!ov.classList.contains('show'),'empty day → Reset is silent (no confirm)');
// check an item → Reset asks first
var firstItem=D.querySelector('#p-a .item');
if(firstItem) firstItem.classList.add('done');
w.confirmReset('a',10);
ok(ov.classList.contains('show'),'in-progress work → Reset asks for confirmation');
w.executeReset();
ok(!ov.classList.contains('show'),'executeReset closes the modal');
ok(D.querySelectorAll('#p-a .item.done').length===0,'executeReset cleared the checked items');

// ── memoized history scans, self-invalidating ──
ST.setItem('gymlog_a', JSON.stringify([{label:'Day 1',date:'x',ts:1,entries:[{ex:'Bench',note:'Set 1: 100 lbs x5reps'}]}]));
var m1=w.getAllExercises();
var m2=w.getAllExercises();
ok(m1===m2,'getAllExercises returns the cached object when data is unchanged');
ok(!!m1['Bench'],'cache has the logged exercise');
// change the data → cache must refresh
ST.setItem('gymlog_a', JSON.stringify([
  {label:'Day 1',date:'x',ts:1,entries:[{ex:'Bench',note:'Set 1: 100 lbs x5reps'}]},
  {label:'Day 1',date:'y',ts:2,entries:[{ex:'Squat',note:'Set 1: 200 lbs x5reps'}]}
]));
var m3=w.getAllExercises();
ok(m3!==m1 && !!m3['Squat'],'cache self-invalidates after a data change (Squat now present)');

console.log('\n'+(fail?('FINALIZE SPOT-CHECK: '+fail+' FAILED'):'FINALIZE SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
