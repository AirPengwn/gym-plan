'use strict';
// v2.63 — Repair-data spot-check using a sanitized synthesis of the user's
// real JSONbin shape. Covers: writer no-double-lbs, parser hardening for
// labeled-weight notes, parser correctly skipping bodyweight notes,
// one-tap Repair button cleaning doubles + remigrating + reporting toast,
// idempotent on subsequent taps, cloud-sync triggered when changes occur.
const fs=require('fs');const{JSDOM}=require('jsdom');
const HTML=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
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

// ─── Parser hardening (no boot required — pure function check) ───────
let w0=app(store());
ok(JSON.stringify(w0.parseSetWeights('Set 1: 90 lbs | Set 2: 90 lbs'))==='[90,90]','parser · canonical "Set N: 90 lbs" still parses (no regression)');
ok(JSON.stringify(w0.parseSetWeights('Set 1: 90 lbs lbs | Set 2: 90 lbs lbs'))==='[90,90]','parser · doubled units still parse to single weight (no regression)');
ok(JSON.stringify(w0.parseSetWeights('Set 1: Rear: 90 lbs pec: 90 lbs | Set 2: Rear: 90 lbs pec: 90 lbs'))==='[90,90]','parser · v2.63 labeled-weight "Set 1: Rear: 90 lbs pec: 90 lbs" now captures 90');
ok(JSON.stringify(w0.parseSetWeights('Set 1: On step | Set 2: On step'))==='[]','parser · bodyweight "On step" still correctly fails (no digits)');
ok(JSON.stringify(w0.parseSetWeights('Set 1: On step lbs | Set 2: On step lbs'))==='[]','parser · "On step lbs" still correctly fails (no digit BEFORE unit)');
// parseSetWR equivalents.
var wr=w0.parseSetWR('Set 1: Rear: 90 lbs pec: 90 lbs');
ok(wr.length===1 && wr[0].w===90 && wr[0].r===null,'parser · parseSetWR captures w:90 r:null on labeled note');
// Empty/edge.
ok(JSON.stringify(w0.parseSetWeights(''))==='[]','parser · empty string still → []');
ok(JSON.stringify(w0.parseSetWeights(null))==='[]','parser · null still → []');

// ─── Repair: replay the user's data shape, then tap the button ───────
const ST=store();
ST.setItem('gym_primary_device','1'); // v2.73+: write-action buttons require primary mode
ST.setItem('gymlog_a', JSON.stringify([
  { label:'Day 1', date:'Tue, May 12, 2026 at 11:40 PM',
    entries:[{ ex:'Chest press', note:'Set 1: 90 lbs | Set 2: 90 lbs | Set 3: 90 lbs' }]}
]));
// Day B: doubled "lbs lbs" on Leg extension + Leg curl + Hip ab/adductor,
// bodyweight Calf raises.
ST.setItem('gymlog_b', JSON.stringify([
  { label:'Day 2', date:'Sat, May 16, 2026 at 12:00 AM',
    entries:[
      { ex:'Leg press', note:'Set 1: 90 lbs | Set 2: 90 lbs | Set 3: 90 lbs' },
      { ex:'Leg extension', note:'Set 1: 90 lbs lbs | Set 2: 90 lbs lbs' },
      { ex:'Leg curl', note:'Set 1: 90 lbs lbs | Set 2: 90 lbs lbs | Set 3: 90 lbs lbs' },
      { ex:'Hip abductor', note:'Set 1: 50 lbs lbs | Set 2: 70 lbs | Set 3: 90 lbs' },
      { ex:'Hip adductor', note:'Set 1: 50 lbs lbs | Set 2: 70 lbs | Set 3: 80 lbs' },
      { ex:'Calf raises', note:'Set 1: On step lbs | Set 2: On step lbs | Set 3: On step lbs' }
    ]}
]));
// Day D: labeled-weight Pec fly that current parser can now read.
ST.setItem('gymlog_d', JSON.stringify([
  { label:'Day 4', date:'Wed, May 6, 2026 at 11:18 PM',
    entries:[
      { ex:'Lat pulldown wide', note:'Set 1: 100 lbs | Set 2: 100 lbs | Set 3: 100 lbs' },
      { ex:'Pec fly', note:'Set 1: Rear: 90 lbs pec: 90 lbs | Set 2: Rear: 90 lbs pec: 90 lbs | Set 3: Rear: 90 lbs pec: 90 lbs' }
    ]}
]));
// Day E: another bodyweight Calf raises.
ST.setItem('gymlog_e', JSON.stringify([
  { label:'Day 5', date:'Sat, May 9, 2026 at 11:30 PM',
    entries:[
      { ex:'Leg press — high foot', note:'Set 1: 90 lbs | Set 2: 90 lbs | Set 3: 90 lbs' },
      { ex:'Calf raises', note:'Set 1: On step | Set 2: On step | Set 3: On step' }
    ]}
]));

let w=app(ST); let D=w.document;
// Boot-time migration should have run already.
var s1=w._patch5DiagStats();
ok(s1.flag==='1','init · migration flag set on boot');
// Fixture: 1 (Day A) + 5 set-bearing (Day B, Calf raises excluded as bodyweight) + 2 (Day D) + 1 (Day E, Calf raises excluded) = 9 set-bearing.
// Doubled-unit entries: Leg ext + Leg curl + Hip abductor + Hip adductor = 4 entries.
ok(s1.doubledUnits===4,'init · diagnostic counts 4 doubled-unit entries (one per affected entry, not per occurrence)');
ok(s1.totalSet===9,'init · 9 set-bearing entries (Pec fly Day D counts via permissive regex; bodyweight Calf raises excluded both days)');
ok(s1.withSets===9,'init · all 9 set-bearing entries already migrated (including Pec fly Day D via permissive migration)');

// Open Backup modal — diagnostic should report the doubled units.
w.showExportImport();
var el=D.getElementById('patch5-status');
ok(/patch5-warn/.test(el.className),'modal · diagnostic in warn state due to doubled units');
ok(/duplicate units/.test(el.innerHTML),'modal · message mentions duplicate units');
ok(/>Repair data</.test(el.innerHTML),'modal · button labeled "Repair data" (not just "Re-run migration")');
var btn=D.querySelector('.patch5-rerun-btn');
ok(!!btn,'modal · Repair button rendered');

// Capture toast + cloud sync calls.
var toastLog=[];
var origToast=w.showToast; w.showToast=function(m){ toastLog.push(m); };
var syncCalled=false;
var origSync=w.syncToJbin; w.syncToJbin=function(cb,opts){ syncCalled=true; if(cb)cb(true); };

// Tap Repair.
btn.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));

// Verify cleanup ran on the affected entries.
var bAfter=JSON.parse(w.localStorage.getItem('gymlog_b'));
ok(!/lbs lbs/.test(bAfter[0].entries[1].note),'repair · Leg extension "lbs lbs" stripped from .note');
ok(!/lbs lbs/.test(bAfter[0].entries[2].note),'repair · Leg curl "lbs lbs" stripped from .note');
ok(!/lbs lbs/.test(bAfter[0].entries[3].note),'repair · Hip abductor "lbs lbs" stripped from .note');
ok(!/lbs lbs/.test(bAfter[0].entries[4].note),'repair · Hip adductor "lbs lbs" stripped from .note');
// Calf raises bodyweight note ("On step lbs") is NOT a doubled-unit pattern (no digit), should be UNTOUCHED.
ok(bAfter[0].entries[5].note==='Set 1: On step lbs | Set 2: On step lbs | Set 3: On step lbs','repair · Calf raises bodyweight note untouched (no digit before unit)');
// Cleaned entries should have .sets rebuilt (rebuilt from clean .note via migration).
ok(Array.isArray(bAfter[0].entries[1].sets) && bAfter[0].entries[1].sets[0].w===90,'repair · cleaned Leg extension now has .sets with w=90');
ok(Array.isArray(bAfter[0].entries[3].sets) && bAfter[0].entries[3].sets[0].w===50,'repair · cleaned Hip abductor set 0 w=50');
// Pec fly Day D weights end up in .sets too.
var dAfter=JSON.parse(w.localStorage.getItem('gymlog_d'));
ok(Array.isArray(dAfter[0].entries[1].sets) && dAfter[0].entries[1].sets.length===3,'repair · Pec fly Day D got .sets with 3 sets via permissive regex');
ok(dAfter[0].entries[1].sets[0].w===90 && dAfter[0].entries[1].sets[1].w===90 && dAfter[0].entries[1].sets[2].w===90,'repair · Pec fly Day D structured weights = [90,90,90]');
// .note preserved (rollback safety net).
ok(dAfter[0].entries[1].note==='Set 1: Rear: 90 lbs pec: 90 lbs | Set 2: Rear: 90 lbs pec: 90 lbs | Set 3: Rear: 90 lbs pec: 90 lbs','repair · Pec fly .note string preserved verbatim (annotation intact)');

// Toast + sync.
// Toast counts OCCURRENCES of "N lbs lbs" not entries: 2+3+1+1 = 7 across the 4 doubled-unit entries.
// v2.65: toast wording changed — initial "Repaired: ... · syncing…" then follow-up "Cloud sync ✓ — repair persisted to JSONbin".
var initialToast=toastLog.find(function(t){return /Repaired:.*syncing/.test(t);});
ok(!!initialToast && /cleaned 7 duplicate units/.test(initialToast),'repair · initial toast reports 7 duplicates cleaned + "syncing…" suffix');
ok(syncCalled,'repair · cloud sync triggered (syncToJbin called) so the cleanup persists across devices');
// The sync callback's success toast should also have fired (mocked sync passes true).
var syncToast=toastLog.find(function(t){return /Cloud sync ✓/.test(t);});
ok(!!syncToast,'repair · success-path follow-up toast confirms "Cloud sync ✓"');

// Idempotency: tap Repair again → no changes.
toastLog.length=0; syncCalled=false;
w.reRunMigration();
ok(toastLog.length>=1 && /already clean/.test(toastLog[toastLog.length-1]),'repair · second tap reports "Data already clean"');
ok(!syncCalled,'repair · second tap does NOT trigger cloud sync (no changes to push)');

// v2.65: sync failure path — mocked sync returns false → user gets clear ⚠️ toast.
// Re-introduce a dirty entry so Repair has something to do.
var dDataAgain=JSON.parse(w.localStorage.getItem('gymlog_b'));
dDataAgain[0].entries[1].note='Set 1: 90 lbs lbs | Set 2: 90 lbs lbs';
delete dDataAgain[0].entries[1].sets;
w.localStorage.setItem('gymlog_b', JSON.stringify(dDataAgain));
// Mock sync to fail.
w.syncToJbin=function(cb){ if(cb) cb(false); };
toastLog.length=0;
w.reRunMigration();
var failToast=toastLog.find(function(t){return /Cloud sync failed/.test(t);});
ok(!!failToast,'repair · sync-fail path shows ⚠️ toast so user knows repair is local-only');

// Diagnostic now reports — v2.68: still warn (combined Pec fly Day D entry
// requires a separate Split action to reach OK). Migration + cleanup are
// done, but the Rear+Pec combined entry is correctly surfaced as a follow-up.
el=D.getElementById('patch5-status');
ok(/patch5-warn/.test(el.className),'modal · post-Repair state remains warn until combined Pec fly is also split (v2.68)');
ok(/Rear \+ Pec in one note/.test(el.innerHTML),'modal · combined-entry line surfaces post-Repair');
ok(!!D.querySelector('.patch5-rerun-btn[onclick="splitRearPecCombined()"]'),'modal · Split button visible for the remaining combined entry');
ok(!D.querySelector('.patch5-rerun-btn[onclick="reRunMigration()"]'),'modal · Repair button hidden once duplicate units + migration are done');

w.showToast=origToast; w.syncToJbin=origSync;

// ─── Writer fix: confirmSave strips trailing unit from val ────────────
// Direct DOM check: when a user types "90 lbs" into a weight field, the
// emitted .note must NOT contain "lbs lbs".
var p=D.getElementById('p-a');
ok(!!p,'writer · Day 1 panel present');
var repInputs=p.querySelectorAll('.rep-input[data-ex="Chest press"]');
ok(repInputs.length>0,'writer · Chest press rep inputs present');
// Simulate the user typing "90 lbs" into the first input (cluttered with unit).
repInputs[0].value='90 lbs';
// And a second clean value with trailing whitespace.
if(repInputs[1]) repInputs[1].value=' 95 LBS ';
// Set pendingDay and trigger save.
w.pendingDay='a'; w.pendingLabel='Day 1 — Upper A';
var dtInp=D.getElementById('session-datetime');
if(dtInp) dtInp.value=new Date(Date.now()).toISOString().slice(0,16);
// silence post-save modals
w.showShareModal=function(){};
w.confirmSave();
var fresh=JSON.parse(w.localStorage.getItem('gymlog_a'))[0];
var freshChest=fresh.entries.find(function(en){ return en.ex==='Chest press'; });
ok(!!freshChest,'writer · fresh Chest press entry exists');
ok(!/lbs lbs/.test(freshChest.note),'writer · "90 lbs" input did NOT produce "lbs lbs" in .note');
ok(/Set 1: 90 lbs/.test(freshChest.note),'writer · "90 lbs" input correctly normalised to "Set 1: 90 lbs"');
ok(/Set 2: 95 lbs/.test(freshChest.note),'writer · " 95 LBS " (whitespace + upper) also normalised to "Set 2: 95 lbs"');
// Structured form: w field is the number only, unit is the canonical lowercase.
ok(freshChest.sets[0].w===90 && freshChest.sets[0].u==='lbs','writer · structured set 0 = {w:90, u:"lbs"}');
ok(freshChest.sets[1] && freshChest.sets[1].w===95 && freshChest.sets[1].u==='lbs','writer · structured set 1 = {w:95, u:"lbs"} (no double unit)');

console.log('\n'+(fail?('PATCH 5 REPAIR SPOT-CHECK: '+fail+' FAILED'):'PATCH 5 REPAIR SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
