'use strict';
// v3.6 — pre-production durability net: on-device rotating snapshots, snapshot
// restore, and the cloud-sync status banner. Source of truth stays localStorage;
// these protect against a bad write / lost cloud without touching history shape.
const fs=require('fs');const{JSDOM}=require('jsdom');
const HTML=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
function store(i){const m=new Map(Object.entries(i||{}));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(''+k,''+v),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:x=>{const a=[...m.keys()];return x<a.length?a[x]:null},get length(){return m.size}};}
function app(st,sess){
  const ctx=new Proxy(function(){return ctx},{get:()=>ctx,set:()=>true,apply:()=>ctx});
  return new JSDOM(HTML,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
    Object.defineProperty(w,'localStorage',{value:st,configurable:true});
    Object.defineProperty(w,'sessionStorage',{value:store(sess||{}),configurable:true});
    w.fetch=()=>Promise.reject(new Error('no'));
    w.HTMLCanvasElement.prototype.getContext=()=>ctx;
    w.confirm=()=>true; w.prompt=()=>'';
  }}).window;
}
let fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };

// ── snapshots rotate and keep the newest SNAP_KEEP ──
const ST=store(); ST.setItem('gym_primary_device','1');
const w=app(ST,{}); // NOT test mode
ST.setItem('gymlog_a', JSON.stringify([{label:'Day 1',date:'x',ts:1,entries:[{ex:'Bench',note:'Set 1: 100 lbs x5reps'}]}]));
for(var i=0;i<10;i++) w.takeLocalSnapshot('session');
var snaps=w.getSnapshots();
ok(snaps.length===w.SNAP_KEEP,'snapshots cap at SNAP_KEEP ('+w.SNAP_KEEP+'), got '+snaps.length);
ok(snaps[0].ts>=snaps[snaps.length-1].ts,'newest snapshot is first');
ok(snaps[0].data && Array.isArray(snaps[0].data['gymlog_a']),'snapshot captured the full payload (gymlog_a present)');

// ── restore applies a snapshot back to local ──
ST.setItem('gymlog_a', JSON.stringify([])); // simulate a bad write that wiped Day 1
ok(JSON.parse(ST.getItem('gymlog_a')).length===0,'precondition: gymlog_a wiped');
w._pendingSnapRestore=0;          // pick the newest snapshot
w.applyPayloadToLocal(w.getSnapshots()[0].data);  // executeSnapRestore minus the reload
ok(JSON.parse(ST.getItem('gymlog_a')).length===1,'restore brought Day 1 history back');

// ── snapshots are NOT taken in Test Mode (would leak sandbox data) ──
const ST2=store(); ST2.setItem('gym_primary_device','1');
const w2=app(ST2,{gym_test_mode:'1'}); // TEST MODE on
var before=w2.getSnapshots().length;
w2.takeLocalSnapshot('session');
ok(w2.getSnapshots().length===before,'takeLocalSnapshot is a no-op in Test Mode');

// ── sync status: success stamps last-sync-ok + clears banner; failure shows it ──
const ST3=store(); ST3.setItem('gym_primary_device','1');
const w3=app(ST3,{}); const D3=w3.document;
w3.markPendingSync();
ok(ST3.getItem('gymlog_sync_pending')==='1','markPendingSync sets the pending flag');
ok(D3.getElementById('sync-banner').style.display==='flex','pending → sync banner visible');
w3.clearPendingSync();
ok(!ST3.getItem('gymlog_sync_pending'),'clearPendingSync clears pending');
ok(!!ST3.getItem('gymlog_last_sync_ok'),'clearPendingSync stamps last-sync-ok time');
ok(D3.getElementById('sync-banner').style.display==='none','synced → banner hidden');

console.log('\n'+(fail?('DURABILITY SPOT-CHECK: '+fail+' FAILED'):'DURABILITY SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
