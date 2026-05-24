'use strict';
// v3.25 (Phase D) — built-in metadata defaults + plan-balance analysis.
// DEFAULT_META gives the built-in plan exercises a pattern/equipment so the WHOLE
// plan feeds analyzePlanBalance(); _balanceGroup buckets push/pull/lower/core;
// analyzePlanBalance() is read-only and renderPlanBalance() paints the Manage card.
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
const w=app(ST); const D=w.document;

// ── DEFAULT_META gives built-ins a pattern + equipment ──
ok(!!w.DEFAULT_META && typeof w.DEFAULT_META==='object','DEFAULT_META map is exposed');
ok(w.DEFAULT_META['chest press'].pattern==='push','DEFAULT_META: chest press → push');
ok(w.DEFAULT_META['leg press'].pattern==='squat','DEFAULT_META: leg press → squat');

// resolve through a real built-in plan record (histEx-keyed)
var plan=w.getEffectivePlan();
function recByHist(h){ var p=w.getEffectivePlan(); var id=Object.keys(p.ex).filter(function(k){ return p.ex[k].histEx===h; })[0]; return id?p.ex[id]:null; }
var cp=recByHist('Chest press');
ok(cp && w.exerciseMeta(cp).pattern==='push' && w.exerciseMeta(cp).equipment==='Machine','exerciseMeta(built-in record) resolves pattern+equipment from DEFAULT_META');
ok(w.exerciseMeta('Cable row').pattern==='pull','exerciseMeta(built-in name) resolves pull');
ok(w.exerciseMeta('Leg press').pattern==='squat','exerciseMeta(built-in name) resolves squat');
// catalog still wins over DEFAULT_META where both exist (Leg extension is an alias)
ok(w.exerciseMeta('Leg extension').pattern==='isolation','catalog metadata wins over DEFAULT_META when both exist');
// a record's explicit field still wins over everything
ok(w.exerciseMeta({histEx:'Chest press',pattern:'pull'}).pattern==='pull','explicit record field beats DEFAULT_META');

// ── _balanceGroup buckets ──
ok(w._balanceGroup('squat',[])==='lower','_balanceGroup: squat → lower');
ok(w._balanceGroup('hinge',[])==='lower','_balanceGroup: hinge → lower');
ok(w._balanceGroup('push',[])==='push','_balanceGroup: push → push');
ok(w._balanceGroup('pull',[])==='pull','_balanceGroup: pull → pull');
ok(w._balanceGroup('core',[])==='core','_balanceGroup: core → core');
ok(w._balanceGroup('cardio',['quad'])===null,'_balanceGroup: cardio → null (no resistance stimulus)');
ok(w._balanceGroup('mobility',['hamstring'])===null,'_balanceGroup: mobility → null');
ok(w._balanceGroup('isolation',['bicep'])==='pull','_balanceGroup: isolation infers pull from bicep');
ok(w._balanceGroup('isolation',['tricep'])==='push','_balanceGroup: isolation infers push from tricep');
ok(w._balanceGroup('isolation',['quad'])==='lower','_balanceGroup: isolation infers lower from quad');
ok(w._balanceGroup('',[])===null,'_balanceGroup: no pattern + no muscles → null');

// ── analyzePlanBalance over the default plan ──
var a=w.analyzePlanBalance();
ok(a && a.total>0,'analyzePlanBalance returns a non-empty analysis');
ok(a.push>0 && a.pull>0 && a.lower>0,'default plan has push, pull AND lower volume');
ok(a.byMuscle && a.byMuscle.quad>0 && a.byMuscle.chest>0,'per-muscle coverage tallied (quad + chest > 0)');
ok(Array.isArray(a.untrained),'untrained is an array');
ok(Array.isArray(a.flags),'flags is an array');

// cardio-only / stretch placements add no resistance volume: a plan of just a
// warm-up should yield total 0. (We approximate by checking cardio is excluded:
// the warm-up day exists but cardio type is skipped.)
// imbalance flag fires when push hugely outweighs pull (synthetic check via group fn)

// ── renderPlanBalance paints a card ──
w.renderPlanBalance();
var card=D.querySelector('#mgr-balance-wrap .bal-card');
ok(!!card,'renderPlanBalance injects a .bal-card into Manage');
ok(/Plan balance/.test((card&&card.textContent)||''),'card shows the "Plan balance" title');
ok(D.querySelectorAll('#mgr-balance-wrap .bal-track').length>=2,'card shows push:pull AND upper:lower bars');

// ── read-only: analysis must not mutate plan_v2 ──
var before=ST.getItem('plan_v2');
w.analyzePlanBalance(); w.renderPlanBalance();
ok(ST.getItem('plan_v2')===before,'analysis + render never write plan_v2 (read-only)');

console.log('\n'+(fail?('BALANCE SPOT-CHECK: '+fail+' FAILED'):'BALANCE SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
