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

// ── v5.1 · new synced keys (F4 rest_overrides_v1, F3 plate_setup_v1) survive
//    the buildBinPayload → applyPayloadToLocal round-trip (both sync directions) ──
const ST4=store(); ST4.setItem('gym_primary_device','1');
ST4.setItem('rest_overrides_v1', JSON.stringify({lk123:75,_mode:'long'}));
ST4.setItem('plate_setup_v1', JSON.stringify({barWeight:35,plates:[45,25,10]}));
ST4.setItem('units_v1','kg');   // C2 (v5.2)
const w4=app(ST4,{}); const payload4=w4.buildBinPayload();
ok(payload4['rest_overrides_v1'] && payload4['rest_overrides_v1'].lk123===75 && payload4['rest_overrides_v1']._mode==='long','rest_overrides_v1 (overrides + _mode) rides the payload');
ok(payload4['plate_setup_v1'] && payload4['plate_setup_v1'].barWeight===35,'plate_setup_v1 rides the payload');
ok(payload4['units_v1']==='kg','units_v1 rides the payload');
ok(w4.getUnits()==='kg' && w4.getUnitForInput(null)==='kg','C2 · getUnits/getUnitForInput read the global unit');
// apply into a fresh device → all keys land
const ST5=store(); const w5=app(ST5,{});
w5.applyPayloadToLocal(payload4);
ok(JSON.parse(ST5.getItem('rest_overrides_v1'))._mode==='long','applyPayloadToLocal restores rest_overrides_v1');
ok(JSON.parse(ST5.getItem('plate_setup_v1')).barWeight===35,'applyPayloadToLocal restores plate_setup_v1');
ok(ST5.getItem('units_v1')==='kg','applyPayloadToLocal restores units_v1');
// union-merge keeps both sides' rest overrides (never shrinks)
const merged=w5._mergeRestOverrides({lkA:60},{lkB:90,_mode:'short'});
ok(merged.lkA===60 && merged.lkB===90 && merged._mode==='short','_mergeRestOverrides unions both sides');
// F3 plate math (fresh app = default 45 bar / [45,25,10,5,2.5]):
const wM=app(store({}));
const pp=wM.platesPerSide(225);
ok(pp && pp.per===90 && pp.list.length===2 && pp.short===0,'platesPerSide(225) → 90/side as 45+45, no short');
const pp2=wM.platesPerSide(96);
ok(pp2 && pp2.short>0,'platesPerSide(96) → flags the unachievable remainder');
ok(wM.platesPerSide(30)===null,'platesPerSide(below bar) → null');

// ── L3 (v5.1) · cycle auto-advance picks the next day after the last logged ──
const wL3=app(store({}));
ok(wL3._nextCycleDay()===wL3.getDays()[0],'L3 · no history → next cycle day = Day 1');
const days=wL3.getDays();   // a,b,c,d,e
const STl=store({}); STl.setItem('gymlog_'+days[1], JSON.stringify([{label:'x',date:'x',ts:Date.now(),entries:[{ex:'Bench',note:'Set 1: 100 lbs x5reps'}]}]));
const wL3b=app(STl);
ok(wL3b._lastLoggedDay()===days[1],'L3 · lastLoggedDay = the most-recently-logged day');
ok(wL3b._nextCycleDay()===days[2],'L3 · next cycle day = the day after the last logged');
// wrap-around: logging the last day → next is Day 1
const STw=store({}); STw.setItem('gymlog_'+days[days.length-1], JSON.stringify([{label:'x',date:'x',ts:Date.now(),entries:[{ex:'Bench',note:'Set 1: 100 lbs x5reps'}]}]));
const wL3c=app(STw);
ok(wL3c._nextCycleDay()===days[0],'L3 · cycle wraps from the last day back to Day 1');
// v5.1.1: a stale draft must NOT block auto-advance (the old draft guard stranded
// the user on a day they'd long abandoned). Auto-target tracks the last LOGGED day.
const STd=store({});
STd.setItem('gymlog_'+days[1], JSON.stringify([{label:'x',date:'x',ts:Date.now(),entries:[{ex:'Bench',note:'Set 1: 100 lbs x5reps'}]}]));
STd.setItem('gymlog_draft_'+days[0], JSON.stringify({checked:['x'],fields:{}}));  // stale draft on a different day
const wL3d=app(STd);
ok(wL3d._workoutTargetDay().auto===true && wL3d._workoutTargetDay().day===days[2],'L3 · a stale draft no longer blocks auto-advance (lands on next-after-logged)');
// v5.1.1: _sessWhen ranks ts-less legacy sessions by their date string (Safari-safe)
const wSW=app(store({}));
ok(wSW._sessWhen({date:'Sat, May 16, 2026 at 12:00 AM'}) > wSW._sessWhen({date:'Tue, May 12, 2026 at 11:40 PM'}),'L3 · _sessWhen parses ts-less date strings for recency ranking');

// ── L1 (v5.2) · notes search matches per-exercise + session notes; highlights safely ──
const wL1=app(store({}));
var sessHit={notes:'felt strong', entries:[{ex:'Chest press',note:'Set 1: 90 lbs'},{ex:'Chest press-notes',note:'right shoulder twinge'}]};
var sessMiss={notes:'easy day', entries:[{ex:'Leg press',note:'Set 1: 100 lbs'}]};
wL1._sessSearch='shoulder';
ok(wL1._sessMatchesSearch(sessHit)===true && wL1._sessMatchesSearch(sessMiss)===false,'L1 · search matches a per-exercise note, skips non-matches');
wL1._sessSearch='STRONG';   // case-insensitive, session-level note
ok(wL1._sessMatchesSearch(sessHit)===true,'L1 · search is case-insensitive over the session note');
ok(/<mark>strong<\/mark>/i.test(wL1._hl(wL1._esc('felt strong today'))),'L1 · _hl wraps the match in <mark>');
wL1._sessSearch='';
ok(wL1._sessMatchesSearch(sessMiss)===true && wL1._hl('plain')==='plain','L1 · empty search matches everything and does not highlight');

console.log('\n'+(fail?('DURABILITY SPOT-CHECK: '+fail+' FAILED'):'DURABILITY SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
