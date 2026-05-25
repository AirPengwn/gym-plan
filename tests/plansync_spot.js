'use strict';
// v2.80 — plan/day cloud-sync: local by default, 2-step (switch + button),
// surgical push (plan-only, preserves cloud sessions), works on a reader device.
const fs=require('fs');const{JSDOM}=require('jsdom');
const HTML=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
function store(i){const m=new Map(Object.entries(i||{}));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(''+k,''+v),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:x=>{const a=[...m.keys()];return x<a.length?a[x]:null},get length(){return m.size}};}
function app(st){
  const ctx=new Proxy(function(){return ctx},{get:()=>ctx,set:()=>true,apply:()=>ctx});
  return new JSDOM(HTML,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
    Object.defineProperty(w,'localStorage',{value:st,configurable:true});
    Object.defineProperty(w,'sessionStorage',{value:store({gym_test_mode:'1'}),configurable:true});
    w.fetch=()=>Promise.reject(new Error('no'));
    w.HTMLCanvasElement.prototype.getContext=()=>ctx; w.confirm=()=>true; w.prompt=()=>'New';
  }}).window;
}
let fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };
const ST=store();
// Reader device (not primary) — proves plan push works even here.
ST.setItem('gym_primary_device','0');
const w=app(ST); const D=w.document;
w.TEST_MODE=false;  // allow the surgical push to run (mock the network below)

// ── default LOCAL ──
ok(w.getPlanSyncEnabled()===false,'default · plan sync OFF (local only)');
w.renderSync();
var sw=D.getElementById('plan-sync-switch');
ok(sw && !sw.checked,'UI · switch rendered, unchecked by default');
var pushBtn=D.querySelector('.plan-sync-box .patch5-rerun-btn');
ok(pushBtn && pushBtn.hasAttribute('disabled'),'UI · push button DISABLED when local-only');

// ── editing a day does NOT auto-push ──
var putCalls=0, getCalls=0;
w._rawCloudPUT=function(p){ putCalls++; w.__lastPut=p; return Promise.resolve({}); };
w.cloudGET=function(){ getCalls++; return Promise.resolve({ gymlog_a:[{label:'real session',date:'x',ts:1,entries:[]}], plan_v2:{days:{},ex:{}}, days_config_v1:[{key:'a',name:'OLD',short:'D1'}] }); };
w.addDay('Test Day');
ok(putCalls===0,'local · addDay did NOT push to cloud (no _rawCloudPUT call)');
ok(w.getDays().length===6,'local · day added locally (6 active)');

// ── push button no-op while switch is OFF ──
w.pushPlanToCloud();
ok(putCalls===0,'guard · pushPlanToCloud is a no-op while switch OFF');

// ── enable switch ──
w.setPlanSyncEnabled(true);
ok(w.getPlanSyncEnabled()===true,'enable · plan sync ON');
w.renderSync();
pushBtn=D.querySelector('.plan-sync-box .patch5-rerun-btn');
ok(pushBtn && !pushBtn.hasAttribute('disabled'),'UI · push button ENABLED when cloud-on');

// ── push: surgical (plan + days only, sessions preserved) ──
return w.pushPlanToCloud(), new Promise(function(r){ setTimeout(r,40); }).then(function(){
  ok(putCalls===1,'push · exactly one cloud write');
  ok(getCalls>=1,'push · fetched cloud first (to overlay)');
  var put=w.__lastPut;
  ok(put && Array.isArray(put.gymlog_a) && put.gymlog_a.length===1 && put.gymlog_a[0].label==='real session','push · cloud session data PRESERVED (gymlog_a from cloud, untouched)');
  ok(put && Array.isArray(put.days_config_v1) && put.days_config_v1.length>=6,'push · local day config (6 days) written');
  ok(put && put.days_config_v1.some(function(d){return d.name==='Test Day';}),'push · the new day is in the pushed config');
  ok(w.planLastPushed()>0,'push · last-pushed timestamp recorded');
  // v3.42: a successful push must refresh the Sync tab so "Last pushed" updates
  // (it called renderDayManager before — wrong panel — so the push looked dead).
  var lastEl=D.querySelector('#sync-body .plan-sync-last');
  ok(lastEl && !/never/i.test(lastEl.textContent),'push · Sync tab "Last pushed" updated (not "never") — visible confirmation');

  // ── reader device DID push (plan channel bypasses reader gate) ──
  ok(w.isPrimaryDevice()===false,'context · this was a READER device');
  ok(putCalls===1,'reader · plan push succeeded from a reader (surgical channel bypasses reader gate)');

  // ── but session-data cloudPUT is STILL gated on this reader ──
  return w.cloudPUT({test:1}).then(function(res){
    ok(res && res.readerMode===true,'reader · session-data cloudPUT still suppressed (readerMode)');

    // ── switch back to local → button disabled again ──
    w.setPlanSyncEnabled(false);
    w.renderSync();
    var pb2=D.querySelector('.plan-sync-box .patch5-rerun-btn');
    ok(pb2 && pb2.hasAttribute('disabled'),'toggle · back to local → button disabled');

    console.log('\n'+(fail?('PLAN-SYNC SPOT-CHECK: '+fail+' FAILED'):'PLAN-SYNC SPOT-CHECK: ALL PASS'));
    process.exit(fail?1:0);
  });
});
