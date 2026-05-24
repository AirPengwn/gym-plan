'use strict';
// v3.0 regression — adding an exercise to a BRAND-NEW day (one never present in the
// static base model and never archived/restored) must not crash. Guards the
// _orderArr() fallback: buildExerciseModel().order[<newKey>] is undefined, so the
// pre-v3.0 code threw "Cannot read properties of undefined (reading 'slice')" and the
// save silently aborted — leaving no way to populate a new day.
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
    w.confirm=()=>true; w.prompt=()=>'Day 6 — Arms';
  }}).window;
}
let fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };
const ST=store(); ST.setItem('gym_primary_device','1');
const w=app(ST); const D=w.document;

// Add a brand-new 6th day via the day-edit modal path (v3.34).
w.renderManager();
w.openDayEdit(null);
w.document.getElementById('day-edit-name').value='Day 6 — Arms';
w.saveDayEdit();
var newKey=w.getDays()[w.getDays().length-1];
ok(w.getDays().length===6 && newKey==='f','add · brand-new day "f" created');

// The new day must NOT exist in the static base model (this is what made it crash).
ok(w.buildExerciseModel().order[newKey]===undefined,'precondition · new day absent from base model');

// Open the Add builder and confirm the new day is selectable.
w.openBuilder(null);
var chip=D.querySelector('#b-days button[data-dk="'+newKey+'"]');
ok(!!chip,'builder · new-day chip present');

// Select it, name the exercise, save — this is the path that used to throw.
D.getElementById('b-name').value='Bicep Curl';
w.toggleMuscleChip(chip);
ok(w._readDayChips().indexOf(newKey)!==-1,'builder · new-day chip selected');
var threw=false;
try{ w.saveBuilder(false); }catch(e){ threw=true; console.log('   threw:',e.message); }
ok(!threw,'save · no exception adding to a brand-new day');

// It must actually land on the new day and render in its panel.
var plan=w.getEffectivePlan();
ok((plan.order[newKey]||[]).some(id=>/bicep/i.test((plan.ex[id]||{}).name||'')),'result · exercise in plan.order[newKey]');
w.renderDayItems();
var host=D.getElementById('items-'+newKey);
ok(host && /Bicep Curl/i.test(host.innerHTML),'result · exercise rendered in the new day panel');

// Adding a SECOND exercise (order array now exists) must also work.
w.openBuilder(null);
D.getElementById('b-name').value='Hammer Curl';
w.toggleMuscleChip(D.querySelector('#b-days button[data-dk="'+newKey+'"]'));
w.saveBuilder(false);
ok((w.getEffectivePlan().order[newKey]||[]).length===2,'result · second exercise also added');

console.log('\n'+(fail?('NEW-DAY ADD SPOT-CHECK: '+fail+' FAILED'):'NEW-DAY ADD SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
