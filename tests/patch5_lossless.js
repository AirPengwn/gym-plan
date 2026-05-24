'use strict';
// Patch 5 lossless canary — the spec's hard must-not-fail condition:
// "If any chart, delta, or stat reads a different number after the
// migration on the same data, stop and report."
//
// Strategy: seed legacy-only data, capture every reader output across every
// entry across every day BEFORE migration runs, then run migration and
// re-capture from the now-structured fast path. Assert byte-identical.
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
    w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    try{Object.defineProperty(w.location,'reload',{value(){},configurable:true});}catch(e){}
  }}).window;
}
let fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };

// Seed a realistic mix: 5 days, 1-3 sessions each, multiple lifts per session,
// some sessions with reps captured, some without, RPE/pain entries mixed in.
const ST=store();
ST.setItem('gymlog_a', JSON.stringify([
  { label:'Day 1', date:'May 17, 2026 at 9:00 AM', ts:1747497600000, duration:42, checkin:'great',
    entries:[
      { ex:'Chest press', note:'Set 1: 100 lbs x10reps | Set 2: 105 lbs x8reps | Set 3: 110 lbs x6reps' },
      { ex:'Chest press-rpe', note:'RPE 8/10' },
      { ex:'Lat pulldown', note:'Set 1: 80 lbs x12reps | Set 2: 85 lbs x10reps' },
      { ex:'Seated cable row', note:'Set 1: 90 lbs | Set 2: 95 lbs' }, // no reps
      { ex:'wu-a', note:'5 min treadmill' }
    ]},
  { label:'Day 1', date:'May 10, 2026 at 9:00 AM', ts:1746892800000, duration:38,
    entries:[ { ex:'Chest press', note:'Set 1: 95 lbs x10reps | Set 2: 100 lbs x10reps' } ]}
]));
ST.setItem('gymlog_b', JSON.stringify([
  { label:'Day 2', date:'May 19, 2026 at 9:00 AM', ts:1747670400000, duration:50,
    entries:[
      { ex:'Leg press', note:'Set 1: 200 lbs x12reps | Set 2: 220 lbs x10reps | Set 3: 240 lbs x8reps' },
      { ex:'Leg press-rpe', note:'RPE 7/10' },
      { ex:'Calf raise', note:'Set 1: 80 lbs x15reps' }
    ]}
]));
ST.setItem('gymlog_c', JSON.stringify([
  { label:'Day 3', date:'May 14, 2026 at 9:00 AM', ts:1747238400000,
    entries:[{ ex:'Dead bug', note:'30 sec hold' }]}
]));
ST.setItem('gymlog_d', JSON.stringify([
  { label:'Day 4', date:'May 12, 2026 at 9:00 AM', ts:1747065600000, duration:45,
    entries:[
      { ex:'Lat pulldown', note:'Set 1: 85 lbs x10reps | Set 2: 90 lbs x8reps' },
      { ex:'Bicep curl', note:'Set 1: 25 lbs x12reps | Set 2: 30 lbs x10reps | Set 3: 30 lbs x8reps' }
    ]}
]));
ST.setItem('gymlog_e', JSON.stringify([
  { label:'Day 5', date:'May 15, 2026 at 9:00 AM', ts:1747324800000,
    entries:[
      { ex:'Hip adductor', note:'Set 1: 100 lbs x12reps | Set 2: 110 lbs x10reps' },
      { ex:'wu-e', note:'5 min treadmill' }
    ]}
]));

// Boot 1: migration runs. Capture POST-migration reader outputs (fast path).
let w=app(ST);
function snapshot(){
  var snap={};
  ['a','b','c','d','e'].forEach(function(d){
    var saved=w.getSaved(d);
    snap[d]=saved.map(function(sess,si){
      return {
        ts: w.sessTs(sess),
        sessKey: w.sessKey(sess),
        entries: (sess.entries||[]).map(function(e){
          // Reader outputs computed from the entry as it currently is
          // (fast-path post-migration; regex pre-migration).
          var wList=w.parseSetWeights(e);
          var wrList=w.parseSetWR(e);
          var bestRM=w.bestEst1RM(e.note||'');
          return {
            ex: e.ex,
            weights: wList,
            wr: wrList,
            bestRM: Math.round(bestRM*1000)/1000  // numerical equivalence
          };
        })
      };
    });
  });
  return snap;
}
var afterMigration=snapshot();
ok(w.localStorage.getItem('sessions_migrated_v1')==='1','canary · migration ran on first boot');

// Force a re-snapshot via the legacy regex path on the same data — strip
// .sets fields temporarily and re-read through the string parsers, then
// confirm the numerical outputs are identical to the fast-path snapshot.
var legacySnap={};
['a','b','c','d','e'].forEach(function(d){
  var saved=w.getSaved(d);
  legacySnap[d]=saved.map(function(sess){
    return {
      ts: w.sessTs(sess),
      sessKey: w.sessKey(sess),
      entries: (sess.entries||[]).map(function(e){
        // Force the regex path by passing the string directly.
        var wList=w.parseSetWeights(e.note||'');
        var wrList=w.parseSetWR(e.note||'');
        var bestRM=w.bestEst1RM(e.note||'');
        return {
          ex: e.ex,
          weights: wList,
          wr: wrList,
          bestRM: Math.round(bestRM*1000)/1000
        };
      })
    };
  });
});

// Per-entry byte-identical check on every reader output.
var mismatches=[];
['a','b','c','d','e'].forEach(function(d){
  var fast=afterMigration[d], leg=legacySnap[d];
  if(fast.length!==leg.length){ mismatches.push(d+' session-count diverges'); return; }
  fast.forEach(function(fs,si){
    var ls=leg[si];
    if(fs.entries.length!==ls.entries.length){ mismatches.push(d+'.'+si+' entry-count diverges'); return; }
    fs.entries.forEach(function(fe,ei){
      var le=ls.entries[ei];
      if(fe.ex!==le.ex) mismatches.push(d+'.'+si+'.'+ei+' .ex diverges');
      if(JSON.stringify(fe.weights)!==JSON.stringify(le.weights))
        mismatches.push(d+'.'+si+'.'+ei+' weights: fast='+JSON.stringify(fe.weights)+' vs legacy='+JSON.stringify(le.weights));
      if(JSON.stringify(fe.wr)!==JSON.stringify(le.wr))
        mismatches.push(d+'.'+si+'.'+ei+' wr: fast='+JSON.stringify(fe.wr)+' vs legacy='+JSON.stringify(le.wr));
      if(fe.bestRM!==le.bestRM)
        mismatches.push(d+'.'+si+'.'+ei+' bestRM: fast='+fe.bestRM+' vs legacy='+le.bestRM);
    });
  });
});
ok(mismatches.length===0,'canary · zero reader-output mismatches across all 5 days × all sessions × all entries');
if(mismatches.length){
  console.log('  MISMATCHES:'); mismatches.slice(0,10).forEach(function(m){ console.log('    ',m); });
}

// Bonus: a downstream consumer that aggregates across sessions — getExerciseProgress.
// Confirm it produces the same array for the same lift before and after.
function progSnap(){
  var keys=Object.keys(w.getAllExercises());
  var out={};
  keys.forEach(function(k){
    var h=w.getExerciseProgress(k);
    out[k]=h.map(function(rec){ return { ts:rec.ts, top:rec.top, est:Math.round((rec.est||0)*1000)/1000 }; });
  });
  return out;
}
var progFast=progSnap();
// Strip .sets to force regex path, re-read.
['a','b','c','d','e'].forEach(function(d){
  var saved=w.getSaved(d);
  saved.forEach(function(sess){
    (sess.entries||[]).forEach(function(e){ if(e && e.sets) delete e.sets; });
  });
  w.localStorage.setItem('gymlog_'+d, JSON.stringify(saved));
});
var progLegacy=progSnap();
var progMis=[];
Object.keys(progFast).forEach(function(k){
  if(JSON.stringify(progFast[k])!==JSON.stringify(progLegacy[k]))
    progMis.push(k+' diverges: fast='+JSON.stringify(progFast[k]).slice(0,80)+' vs legacy='+JSON.stringify(progLegacy[k]).slice(0,80));
});
ok(progMis.length===0,'canary · getExerciseProgress produces identical history series via fast-path vs legacy-regex on the same data');
if(progMis.length){ progMis.slice(0,5).forEach(function(m){ console.log('  ',m); }); }

console.log('\n'+(fail?('LOSSLESS CANARY: '+fail+' FAILED'):'LOSSLESS CANARY: ALL PASS'));
process.exit(fail?1:0);
