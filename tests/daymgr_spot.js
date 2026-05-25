'use strict';
// Phase B.3 — full day-cycle lifecycle: add / rename / reorder / remove (archive) / restore,
// proving history persistence across the shrink→expand scenario.
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
const ST=store();
ST.setItem('gym_primary_device','1');
const w=app(ST); const D=w.document;

// ── default 5 days ──
ok(w.getDays().length===5,'init · 5 active days by default');

// ── v4.6: Plan header ⋯ overflow holds the secondary actions; day list leads ──
w.renderManager();
var ovf=D.getElementById('mgr-ovf-menu');
ok(!!ovf && !!D.querySelector('.mgr-ovf-btn'),'v4.6 · Plan header has a ⋯ overflow trigger + menu');
['templates','library','addday','sync'].forEach(function(act){
  ok(!!ovf.querySelector('[onclick="mgrOvf(\''+act+'\')"]'),'v4.6 · overflow has the "'+act+'" action');
});
ok(typeof w.openTemplates==='function' && typeof w.openLibrary==='function' && typeof w.openSync==='function','v4.6 · overflow targets resolve');
// the moved buttons are no longer inline
var aw=(D.getElementById('mgr-active-wrap')||{}).innerHTML||'';
ok(/openBuilder\(null\)/.test(aw),'v4.6 · ➕ Add exercise stays inline (primary action)');
ok(!/openLibrary\(\)/.test(aw) && !/openTemplates\(\)/.test(aw),'v4.6 · From-library + Templates moved out of the inline row');
ok(!/onclick="openSync\(\)"/.test((D.getElementById('mgr-days-wrap')||{}).innerHTML||''),'v4.6 · the cloud-sync jump button removed from the day manager');
// balance leads with a pill (collapsed card)
ok(!!D.querySelector('#mgr-balance-wrap .bal-pill'),'v4.6 · balance renders as a status pill');

// ── ADD a 6th day ──
var k=w.addDay('Day 6 — Arms');
ok(k==='f','add · minted next key "f"');
ok(w.getDays().length===6,'add · now 6 active days');
ok(!!D.getElementById('p-f'),'add · panel #p-f injected');
ok(D.querySelectorAll('#day-selector .day-btn').length===6,'add · selector shows 6');
ok(D.querySelectorAll('#mgr-days-wrap .mgr-day-row').length>=6,'add · day-manager lists 6 rows');

// Log history on the new day.
ST.setItem('gymlog_f', JSON.stringify([{label:'Day 6 — Arms',date:'x',ts:5,entries:[{ex:'Bicep curl',note:'Set 1: 30 lbs x10reps'}]}]));

// ── RENAME ──
w.renameDay('f','Arm Day');
ok(w.getDayName('f')==='Arm Day','rename · name updated');

// ── REORDER (move f up one) ──
w.moveDay('f',-1);
ok(w.getDays()[4]==='f','reorder · f moved to position 5 (index 4)');
w.moveDay('f',1);
ok(w.getDays()[5]==='f','reorder · f back to last');

// ── REMOVE (archive) ──
w.removeDay('f');
ok(w.getDays().length===5,'remove · back to 5 active days');
ok(w.getDays().indexOf('f')===-1,'remove · f no longer active');
ok(w.getArchivedDaysConfig().some(function(d){return d.key==='f';}),'remove · f is archived');
ok(JSON.parse(ST.getItem('gymlog_f')).length===1,'remove · gymlog_f history PRESERVED (not deleted)');
ok(w.getAllDayKeys().indexOf('f')!==-1,'remove · f still in getAllDayKeys (syncs + metrics see it)');
// Metrics still see the removed day's exercise.
ok(!!w.getAllExercises()['Bicep curl'],'remove · Bicep curl still in Lifts pool (history persists)');
ok(w.getExerciseProgress('bicep curl').length===1,'remove · Bicep curl chart history still readable');

// ── RESTORE ──
w.restoreDay('f');
ok(w.getDays().length===6,'restore · 6 active days again');
ok(w.getDays().indexOf('f')!==-1,'restore · f active again');
ok(!!D.getElementById('p-f'),'restore · panel present');
ok(JSON.parse(ST.getItem('gymlog_f')).length===1,'restore · history intact through the whole cycle');
ok(w.getDayName('f')==='Arm Day','restore · custom name retained');

// ── min-day guard ──
['b','c','d','e','f'].forEach(function(key){ if(w.getDays().length>1) w.removeDay(key); });
ok(w.getDays().length===1,'guard · removed down to 1 day');
w.removeDay('a');
ok(w.getDays().length===1,'guard · cannot remove the last remaining day');

// ── config round-trips through sync ──
var payload=w.buildBinPayload();
ok(Array.isArray(payload.days_config_v1) && payload.days_config_v1.some(function(d){return d.archived;}),'sync · payload carries config incl. archived flags');
// archived days still backed up
ok(payload['gymlog_f'] && payload['gymlog_f'].length===1,'sync · archived day f history is in the backup payload');

console.log('\n'+(fail?('DAY-MANAGER SPOT-CHECK: '+fail+' FAILED'):'DAY-MANAGER SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
