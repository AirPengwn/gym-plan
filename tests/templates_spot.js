'use strict';
// v3.28 — plan templates: built-in programs + user-saved custom templates that
// build out a whole day cycle. Apply is non-destructive (snapshot first; Replace
// ARCHIVES current days, history kept). Every template exercise resolves to a
// real catalog/built-in entry so it lands with metadata + muscles. plan_templates_v1
// is synced like the user library.
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
// a logged session on day a — must survive a "replace" template apply
ST.setItem('gymlog_a', JSON.stringify([{label:'Day 1',date:'x',ts:11,entries:[{ex:'Leg press',note:'Set 1: 100 lbs x10reps'}]}]));
const w=app(ST);

// ── built-in templates are well-formed + every exercise resolves to metadata ──
ok(Array.isArray(w.PLAN_TEMPLATES) && w.PLAN_TEMPLATES.length>=4,'PLAN_TEMPLATES has the built-in programs');
var allEx=[], badRes=[];
w.PLAN_TEMPLATES.forEach(function(t){
  ok(t.id && t.name && Array.isArray(t.days) && t.days.length,'template "'+(t.name||'?')+'" has id/name/days');
  t.days.forEach(function(d){ (d.ex||[]).forEach(function(x){
    allEx.push(x);
    // must resolve to full instance fields: a pattern AND at least one muscle
    // (catalog entries, or built-ins via DEFAULT_META + DEFAULT_MUSCLES).
    var f=w._templateExFields(x);
    if(!(f && f.pattern && Array.isArray(f.muscles) && f.muscles.length)) badRes.push(t.name+' → '+x);
  }); });
});
ok(badRes.length===0,'every built-in template exercise resolves to a pattern + muscles'+(badRes.length?(' — UNRESOLVED: '+badRes.join(', ')):''));
ok(w.exerciseMeta('Barbell bench press').pattern==='push','sanity: a template exercise resolves metadata (push)');

// ── getAllTemplates surfaces built-ins ──
var all0=w.getAllTemplates();
ok(all0.length>=4 && all0.every(function(t){ return !t.custom; }),'getAllTemplates lists built-ins (none custom yet)');

// ── append: adds the template days alongside, exercises carry metadata+muscles ──
var before=w.getDays().length;
var ppl=w._templateById('ppl3');
ok(w.applyTemplate('ppl3','append')===true,'applyTemplate(append) succeeds');
var afterDays=w.getDays();
ok(afterDays.length===before+ppl.days.length,'append added all '+ppl.days.length+' template days alongside the current ones');
var plan=w.getEffectivePlan();
var benchId=Object.keys(plan.ex).filter(function(k){ return /barbell bench press/i.test(plan.ex[k].name||''); })[0];
ok(!!benchId,'a template exercise landed on a day');
ok(plan.ex[benchId].pattern==='push' && (plan.ex[benchId].muscles||[]).indexOf('chest')!==-1,'applied exercise carries pattern + muscles (full metadata)');

// ── replace: archives current days (history kept), installs the template ──
const ST2=store(); ST2.setItem('gym_primary_device','1');
ST2.setItem('gymlog_a', JSON.stringify([{label:'Day 1',date:'x',ts:9,entries:[{ex:'Leg press',note:'Set 1: 120 lbs x8reps'}]}]));
const w2=app(ST2);
var ul=w2._templateById('ul4');
ok(w2.applyTemplate('ul4','replace')===true,'applyTemplate(replace) succeeds');
ok(w2.getDays().length===ul.days.length,'replace leaves exactly the template days active');
ok(Array.isArray(JSON.parse(ST2.getItem('gymlog_a'))) && JSON.parse(ST2.getItem('gymlog_a')).length===1,'replace PRESERVES logged history (gymlog_a intact)');
var arch=w2.getArchivedDaysConfig();
ok(arch.length>=5,'replace archived the original days (restorable, not deleted)');

// ── save current plan as a custom template, then it appears + is applyable ──
const ST3=store(); ST3.setItem('gym_primary_device','1');
const w3=app(ST3);
ok(w3.saveCurrentPlanAsTemplate('My Split')===true,'saveCurrentPlanAsTemplate snapshots the current plan');
var cust=w3.getActiveCustomTemplates();
ok(cust.length===1 && cust[0].name==='My Split' && cust[0].days.length>=1,'custom template saved with the current days');
ok(w3.getAllTemplates().some(function(t){ return t.custom && t.name==='My Split'; }),'custom template shows in getAllTemplates flagged custom');
ok(Array.isArray(w3.buildBinPayload()['plan_templates_v1']),'plan_templates_v1 rides the sync/backup payload');

// ── delete is a soft tombstone (so it syncs) ──
ok(w3.removeCustomTemplate('My Split')===true,'removeCustomTemplate returns true');
ok(!w3.getActiveCustomTemplates().some(function(t){ return t.name==='My Split'; }),'deleted custom template gone from active list');
ok(w3.getCustomTemplates().some(function(t){ return t.name==='My Split' && t.deleted; }),'delete kept as a tombstone');

// ── LWW merge converges custom templates across devices ──
var A=[{name:'P1',updatedAt:100},{name:'P2',updatedAt:50}];
var B=[{name:'P1',updatedAt:200,deleted:true},{name:'P3',updatedAt:10}];
var M=w3._mergeLibraries(A,B);
ok(M.length===3,'merge unions custom templates by name (P1/P2/P3)');
ok(M.filter(function(e){return e.name==='P1';})[0].deleted===true,'newer delete wins for a custom template');

// ── render the modal list ──
const w4=app(store()); var D4=w4.document;
w4.openTemplates();
ok(D4.getElementById('tpl-overlay').classList.contains('show'),'openTemplates shows the modal');
ok(D4.querySelectorAll('#tpl-list .tpl-item').length>=4,'modal lists the built-in templates');

console.log('\n'+(fail?('TEMPLATES SPOT-CHECK: '+fail+' FAILED'):'TEMPLATES SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
