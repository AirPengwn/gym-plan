'use strict';
// v3.2 — per-day Remove (replaces global Archive). Removing an exercise from one
// day must NOT touch its copy on other days, must keep all history, and must not
// resurrect default exercises (presence-based getEffectivePlan order).
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
    w.confirm=()=>true; w.prompt=()=>'';
  }}).window;
}
let fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };
const ST=store(); ST.setItem('gym_primary_device','1');
const w=app(ST);

function idsOf(day){ return (w.getEffectivePlan().order[day]||[]); }
function hasName(day,re){ var p=w.getEffectivePlan(); return idsOf(day).some(function(id){ return re.test((p.ex[id]||{}).name||''); }); }

// ── add a linked exercise on days a + b ──
w.planAddExercise(['a','b'], {name:'Cable Fly XYZ', type:'strength', sets:3});
ok(hasName('a',/Cable Fly XYZ/) && hasName('b',/Cable Fly XYZ/),'added on day a + b');

// give it logged history on day a so it persists in the library after removal
ST.setItem('gymlog_a', JSON.stringify([{label:'Day 1',date:'x',ts:9,entries:[{ex:'Cable Fly XYZ',note:'Set 1: 40 lbs x12reps'}]}]));

// ── remove from day a only ──
var planA=w.getEffectivePlan();
var domA=idsOf('a').filter(function(id){ return /Cable Fly XYZ/.test((planA.ex[id]||{}).name||''); })[0];
w.planRemoveFromDay(domA,'a');
ok(!hasName('a',/Cable Fly XYZ/),'removed from day a');
ok(hasName('b',/Cable Fly XYZ/),'STILL on day b (other day untouched)');
ok(JSON.parse(ST.getItem('gymlog_a')).length===1,'day a history preserved');

// ── remove a DEFAULT exercise from its day — must not resurrect on reload-equivalent ──
var firstDefault=idsOf('a')[0];
var defName=(w.getEffectivePlan().ex[firstDefault]||{}).name;
w.planRemoveFromDay(firstDefault,'a');
ok(idsOf('a').indexOf(firstDefault)===-1,'default exercise removed from day a order');
// re-read effective plan: empty/edited overlay order must NOT fall back to base
ok(idsOf('a').indexOf(firstDefault)===-1,'default does not resurrect (presence-based order)');

// ── remove from the LAST day → leaves the cycle but stays in library (has history) ──
var planB=w.getEffectivePlan();
var domB=idsOf('b').filter(function(id){ return /Cable Fly XYZ/.test((planB.ex[id]||{}).name||''); })[0];
w.planRemoveFromDay(domB,'b');
ok(!hasName('b',/Cable Fly XYZ/),'removed from last day too');
ok(w.getExerciseLibrary().some(function(e){ return /Cable Fly XYZ/i.test(e.name); }),'still in library (re-addable) via its history');

console.log('\n'+(fail?('PER-DAY REMOVE SPOT-CHECK: '+fail+' FAILED'):'PER-DAY REMOVE SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
