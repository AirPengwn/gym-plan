'use strict';
// v3.14 (Phase B) — richer exercise metadata: catalog entries carry
// equipment/pattern/difficulty/alternatives; the fields persist onto plan
// records and the user library; exerciseMeta() resolves them.
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

// ── every catalog entry carries the new metadata ──
var cat=w.EXERCISE_CATALOG;
var PATTERNS={push:1,pull:1,squat:1,hinge:1,lunge:1,carry:1,core:1,cardio:1,isolation:1};
ok(cat.every(function(e){ return PATTERNS[e.pattern]; }),'every catalog entry has a valid pattern');
ok(cat.every(function(e){ return e.equipment && e.difficulty; }),'every catalog entry has equipment + difficulty');
ok(cat.every(function(e){ return Array.isArray(e.alternatives) && e.alternatives.length; }),'every catalog entry has alternatives');

// ── resolver reads catalog by name ──
var m=w.exerciseMeta('Dumbbell goblet squat');
ok(m.pattern==='squat' && m.equipment==='Dumbbell','exerciseMeta(name) resolves pattern + equipment from catalog');
ok(m.alternatives.indexOf('Leg press')!==-1,'exerciseMeta(name) returns alternatives');
ok(w.exerciseMeta('Dumbbell single arm bent-over row').unilateral===true,'unilateral flag resolved');

// ── metadata persists onto a plan record when added from the library ──
w.planAddExisting('Dumbbell goblet squat', ['a']);
var plan=w.getEffectivePlan();
var rid=(plan.order['a']||[]).filter(function(id){ return /goblet squat/i.test((plan.ex[id]||{}).name||''); })[0];
var rec=plan.ex[rid];
ok(rec && rec.pattern==='squat' && rec.equipment==='Dumbbell','added record carries pattern + equipment');
ok((rec.alternatives||[]).indexOf('Leg press')!==-1,'added record carries alternatives');
ok(w.exerciseMeta(rec).pattern==='squat','exerciseMeta(record) reads explicit fields');

// ── user library stores + resolves metadata ──
w.addToUserLibrary({name:'My Hinge XYZ', type:'strength', pattern:'hinge', equipment:'Barbell', difficulty:'Intermediate', muscles:['hamstring'], alternatives:['Good morning']});
ok(w.exerciseMeta('My Hinge XYZ').pattern==='hinge','user-library exercise resolves its pattern');

console.log('\n'+(fail?('METADATA SPOT-CHECK: '+fail+' FAILED'):'METADATA SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
