'use strict';
// v2.71 — Primary/Reader device mode. Cloud writes are gated on the per-device
// flag. Default = primary (preserves existing behavior). Reader mode blocks
// cloudPUT silently, hides destructive action buttons in the diagnostic, and
// surfaces a 📖 prefix on the version badge for persistent awareness.
const fs=require('fs');const{JSDOM}=require('jsdom');
const HTML=fs.readFileSync('C:\\dev\\gym-plan\\index.html','utf8');
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

// ─── Default = primary (no behavior change for existing users) ────────
let ST=store();
let w=app(ST); let D=w.document;
ok(typeof w.isPrimaryDevice==='function','API · isPrimaryDevice exposed');
ok(typeof w.setPrimaryDevice==='function','API · setPrimaryDevice exposed');
ok(typeof w.togglePrimaryDevice==='function','API · togglePrimaryDevice exposed');
ok(typeof w._renderPrimaryBadge==='function','API · _renderPrimaryBadge exposed');
// v2.73 — default flipped to reader-mode. Devices must explicitly opt in.
ok(w.isPrimaryDevice()===false,'v2.73 default · isPrimaryDevice returns FALSE when flag is null (strict opt-in)');
// Now flip to primary for the rest of the test (it expects primary state).
w.localStorage.setItem('gym_primary_device','1');
ok(w.isPrimaryDevice()===true,'v2.73 default · after explicit setItem("1") isPrimaryDevice returns true');
// Version badge: no 📖 prefix by default.
var badge=D.getElementById('app-version');
ok(!!badge,'init · #app-version badge exists');
ok(!/^📖/.test(badge.textContent),'default · version badge has NO 📖 prefix (primary device)');
// Boot's setTimeout(_renderPrimaryBadge, 0) hasn't fired yet; trigger it explicitly.
w._renderPrimaryBadge();
ok(/Primary device/.test(badge.getAttribute('title')||''),'default · badge title says "Primary device" after first render');

// ─── Toggle UI in Backup modal ────────────────────────────────────────
w.showExportImport();
var cb=D.getElementById('primary-device-toggle');
ok(!!cb,'UI · #primary-device-toggle checkbox rendered');
ok(cb.checked===true,'UI · toggle reflects primary state (checked)');
var hint=D.getElementById('primary-toggle-hint');
ok(!!hint && /sync to cloud/.test(hint.textContent),'UI · hint shows primary-state copy');

// ─── Switching to reader mode ─────────────────────────────────────────
// Mock confirm() to accept.
w.confirm=function(){ return true; };
var toastLog=[];
var origToast=w.showToast; w.showToast=function(m){ toastLog.push(m); };
w.togglePrimaryDevice(false);
ok(w.isPrimaryDevice()===false,'switch → reader · isPrimaryDevice returns false');
ok(ST.getItem('gym_primary_device')==='0','switch → reader · flag persisted as "0"');
ok(/Reader mode/.test(toastLog[toastLog.length-1]),'switch → reader · confirmation toast fired');
// Badge picks up the 📖 prefix.
badge=D.getElementById('app-version');
ok(/^📖\s/.test(badge.textContent),'switch → reader · version badge gains 📖 prefix');
ok(/Reader mode/.test(badge.getAttribute('title')||''),'switch → reader · badge title says "Reader mode"');
// Hint copy updates.
hint=D.getElementById('primary-toggle-hint');
w._renderPatch5Status();
hint=D.getElementById('primary-toggle-hint');
ok(/locally only/.test(hint.textContent),'switch → reader · hint copy updated');
ok(/pt-reader/.test(hint.className),'switch → reader · hint uses pt-reader class (warn color)');

// ─── cloudPUT is no-op'd in reader mode ───────────────────────────────
// TEST_MODE rejects cloudPUT before the reader-check; mock it off for this
// specific test (production users never have TEST_MODE on).
w.TEST_MODE=false;
var fetchCalled=false;
w.fetch=function(){ fetchCalled=true; return Promise.reject(new Error('fetch should not fire in reader mode')); };
return w.cloudPUT({test:'payload'}).then(function(result){
  ok(!fetchCalled,'reader · cloudPUT did NOT call fetch (write suppressed)');
  ok(result && result.readerMode===true,'reader · cloudPUT resolved with {readerMode:true} marker');

  // ─── syncToJbin (non-authoritative) — should still cloudGET but never PUT
  fetchCalled=false;
  var getCalls=0, putAttempts=0;
  w.cloudGET=function(){ getCalls++; return Promise.resolve({gymlog_a:[],gymlog_b:[],gymlog_c:[],gymlog_d:[],gymlog_e:[]}); };
  // cloudPUT is the one we already verified above — should remain no-op.
  return new Promise(function(r){
    w.syncToJbin(function(ok2){
      ok(ok2===true,'reader · syncToJbin (non-authoritative) callback fires with success');
      r();
    });
  });
}).then(function(){
  // ─── syncToJbin authoritative — still no fetch on cloudPUT path
  fetchCalled=false;
  return new Promise(function(r){
    w.syncToJbin(function(ok2){
      ok(ok2===true,'reader · syncToJbin authoritative also succeeds (no actual fetch fired)');
      ok(!fetchCalled,'reader · authoritative push made no real fetch call');
      r();
    }, {authoritative:true});
  });
}).then(function(){
  // ─── Diagnostic in reader mode hides Repair/Split/Dedupe buttons ──────
  // Seed a session with doubled units so Repair would normally surface.
  ST.setItem('gymlog_a', JSON.stringify([
    { label:'Day 1', date:'May 17, 2026', ts:Date.now(),
      entries:[{ ex:'Test', note:'Set 1: 90 lbs lbs | Set 2: 90 lbs lbs',
                 sets:[{w:90,u:'lbs',r:null},{w:90,u:'lbs',r:null}] }] }
  ]));
  ST.setItem('sessions_migrated_v1','1');
  w._renderPatch5Status();
  var statusHTML=D.getElementById('patch5-status').innerHTML;
  ok(/Reader mode — fixes are hidden/.test(statusHTML),'reader · diagnostic surfaces "fixes hidden" note');
  ok(!/onclick="reRunMigration\(\)"/.test(statusHTML),'reader · Repair button hidden');
  ok(!/onclick="splitRearPecCombined\(\)"/.test(statusHTML),'reader · Split button hidden');
  ok(!/onclick="dedupeDuplicateSessions\(\)"/.test(statusHTML),'reader · Dedupe button hidden');
  // Pull from cloud button is OUTSIDE the diagnostic — always visible.
  ok(!!D.querySelector('.multi-device-row .patch5-rerun-btn'),'reader · "Pull from cloud" remains visible in multi-device-row');

  // ─── Switching back to primary ────────────────────────────────────────
  // No confirm needed on this direction.
  w.togglePrimaryDevice(true);
  ok(w.isPrimaryDevice()===true,'switch → primary · flag flips back');
  ok(ST.getItem('gym_primary_device')==='1','switch → primary · persisted as "1"');
  badge=D.getElementById('app-version');
  ok(!/^📖/.test(badge.textContent),'switch → primary · 📖 prefix removed from badge');
  // Repair/Split/Dedupe now visible again.
  w._renderPatch5Status();
  statusHTML=D.getElementById('patch5-status').innerHTML;
  ok(/onclick="reRunMigration\(\)"/.test(statusHTML),'switch → primary · Repair button visible again');

  // ─── Cancel path: confirm() returns false → flag unchanged ───────────
  w.confirm=function(){ return false; };
  // Currently primary; simulate user attempting to switch to reader but cancelling.
  cb=D.getElementById('primary-device-toggle');
  cb.checked=false; // simulate the checkbox click that fires onchange
  w.togglePrimaryDevice(false);
  ok(w.isPrimaryDevice()===true,'cancel · user-cancel did NOT change flag (still primary)');
  ok(cb.checked===true,'cancel · checkbox is restored to checked state on cancel');

  // ─── confirmSave on reader device surfaces local-only toast ──────────
  w.confirm=function(){ return true; };
  w.togglePrimaryDevice(false);
  ok(!w.isPrimaryDevice(),'reader · in reader mode for save test');
  toastLog.length=0;
  // Seed minimal save state.
  var p=D.getElementById('p-a');
  var inp=p.querySelector('.rep-input[data-ex="Chest press"][data-set="1"]');
  if(inp){ inp.value='100'; }
  w.pendingDay='a'; w.pendingLabel='Day 1 — Upper A';
  var dtInp=D.getElementById('session-datetime');
  if(dtInp) dtInp.value=new Date(Date.now()).toISOString().slice(0,16);
  w.showShareModal=function(){};
  w.confirmSave();
  var localToast=toastLog.find(function(t){return /Reader mode \(no cloud push/.test(t)||/Saved locally · reader mode/.test(t);});
  ok(!!localToast,'reader · confirmSave shows "Saved locally · reader mode" toast');

  console.log('\n'+(fail?('PATCH 5 PRIMARY/READER SPOT-CHECK: '+fail+' FAILED'):'PATCH 5 PRIMARY/READER SPOT-CHECK: ALL PASS'));
  process.exit(fail?1:0);
});
