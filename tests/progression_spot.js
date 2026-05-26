'use strict';
// v3.36 — characterization tests for the (previously untested) auto-progression
// engine: getOverloadSuggestion() (double-progression + RPE) and getDeloadAdvice()
// (stall + high-effort / systemic fatigue). Read-only: these read logged history
// (the .note / RPE / PR parsing) and must never write. Locking them guards that
// sensitive parsing against regressions.
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

// pick a real built-in exercise that has a target (sets × reps) to anchor scenarios
const probe=app(store({}));
const targets=probe.getExerciseTargets();
const K=Object.keys(targets).filter(function(k){ return targets[k] && targets[k].reps>=3; })[0];
const R=K?targets[K].reps:0, S=K?(targets[K].sets||3):0;
ok(!!K,'found a target exercise to anchor tests ('+K+' @ '+S+'×'+R+')');
probe.close();

function sess(ts, note, rpe){ var e=[{ex:K,note:note}]; if(rpe!=null) e.push({ex:K+'-rpe',note:'RPE '+rpe}); return {label:'D',date:'x',ts:ts,entries:e}; }
function withHist(sessions){ var st=store({gym_primary_device:'1'}); st.setItem('gymlog_a', JSON.stringify(sessions)); return app(st); }
function sugg(w){ var s=w.getOverloadSuggestion(K); return (s&&s.text)||''; }

// ── A · hit all target reps (no high RPE) → add weight (+5) ──
var wA=withHist([ sess(1000,'Set 1: 100 lbs x'+R+'reps | Set 2: 100 lbs x'+R+'reps') ]);
ok(/try 105 lbs/.test(sugg(wA)) && /Hit/.test(sugg(wA)),'all sets hit target reps → suggest +5 lbs ('+sugg(wA)+')');

// ── B · below target reps → "build to" the target at current weight ──
var wB=withHist([ sess(1000,'Set 1: 100 lbs x'+(R-2)+'reps | Set 2: 100 lbs x'+(R-2)+'reps') ]);
ok(/Build to/.test(sugg(wB)),'below target reps → build-to-target cue ('+sugg(wB)+')');

// ── C · hit reps but RPE 9 → hold weight, sharpen form (no jump) ──
var wC=withHist([ sess(1000,'Set 1: 100 lbs x'+R+'reps', 9) ]);
ok(/hold 100 lbs/.test(sugg(wC)) && /sharpen/.test(sugg(wC)),'hit reps at RPE 9 → hold + sharpen ('+sugg(wC)+')');

// ── D · no reps logged, same top weight 2 sessions → "ready to try +5" ──
var wD=withHist([ sess(2000,'Set 1: 100 lbs'), sess(1000,'Set 1: 100 lbs') ]);
ok(/Ready to try 105/.test(sugg(wD)),'flat top weight, no reps → ready-to-progress ('+sugg(wD)+')');

// ── E · no history → no suggestion ──
var wE=app(store({gym_primary_device:'1'}));
ok(wE.getOverloadSuggestion(K)===null,'no history → null suggestion');

// ── read-only: the suggestion calls must not mutate stored history ──
var st=store({gym_primary_device:'1'});
st.setItem('gymlog_a', JSON.stringify([ sess(1000,'Set 1: 100 lbs x'+R+'reps') ]));
var wR=app(st);
var before=st.getItem('gymlog_a');
wR.getOverloadSuggestion(K); wR.getDeloadAdvice();
ok(st.getItem('gymlog_a')===before,'getOverloadSuggestion + getDeloadAdvice never write gymlog (read-only)');

// ── getDeloadAdvice · none with no data; systemic flag with hard recent block ──
var wN=app(store({gym_primary_device:'1'}));
ok(wN.getDeloadAdvice()===null,'getDeloadAdvice → null with no history');
var now=Date.now(), six=[];
for(var i=0;i<6;i++){ six.push(sess(now-i*86400000,'Set 1: 100 lbs x'+R+'reps', 9)); }   // 6 hard sessions, no PRs
var wDl=withHist(six); wDl.TEST_MODE=false;
var adv=wDl.getDeloadAdvice();
ok(!!adv,'getDeloadAdvice → advice for 6 hard recent sessions');
ok(adv && adv.sess14>=6 && adv.avgRpe14>=8,'advice carries session count + avg RPE');
// the banner surfaces it (only when not in Test Mode)
wDl.maybeShowDeloadBanner();
var ban=wDl.document.getElementById('deload-banner');
ok(ban && ban.style.display==='flex','maybeShowDeloadBanner shows the banner when advice exists');
ok(/deload/i.test(wDl.document.getElementById('deload-banner-msg').textContent||''),'banner message mentions a deload');

// ── the card nudge: loadLastTimes injects an .overload-nudge from the suggestion ──
var st2=store({gym_primary_device:'1'});
st2.setItem('gymlog_a', JSON.stringify([ sess(1000,'Set 1: 100 lbs x'+R+'reps | Set 2: 100 lbs x'+R+'reps') ]));
var wL=app(st2);
try{ wL.loadLastTimes(); }catch(e){}
var nudge=[].slice.call(wL.document.querySelectorAll('.overload-nudge')).map(function(n){return n.textContent;}).join(' | ');
ok(/try 105 lbs|Hit|Build to|Ready to try|hold/.test(nudge),'loadLastTimes injects an .overload-nudge on the workout card ('+(nudge||'none')+')');

// ── F1 (v5.1) · progressionNudge: stalled+easy → bump, stalled+hard → hold ──
var wP1=withHist([ sess(2000,'Set 1: 100 lbs x'+R+'reps'), sess(1000,'Set 1: 100 lbs x'+R+'reps') ]);
var n1=wP1.progressionNudge(K, wP1.exerciseMeta(K));
ok(n1 && n1.kind==='bump' && n1.target>100,'F1 · flat top weight, easy/no RPE → bump suggestion ('+JSON.stringify(n1)+')');

var wP2=withHist([ sess(2000,'Set 1: 100 lbs x'+R+'reps',9), sess(1000,'Set 1: 100 lbs x'+R+'reps',8) ]);
var n2=wP2.progressionNudge(K, wP2.exerciseMeta(K));
ok(n2 && n2.kind==='hold','F1 · flat top weight, hard RPE (avg ≥8) → hold ('+JSON.stringify(n2)+')');

var wP3=app(store({gym_primary_device:'1'}));
ok(wP3.progressionNudge(K, wP3.exerciseMeta(K))===null,'F1 · no history → null (no nudge)');

// ── F2 (v5.1) · countNewEstPRs: new est-1RM beats prior completed sessions ──
// index 0 = "just saved" (excluded from baseline); est1RM Epley = w*(1+r/30).
var wF2a=withHist([ sess(2000,'Set 1: 140 lbs x5reps'), sess(1000,'Set 1: 100 lbs x5reps') ]);
ok(wF2a.countNewEstPRs('a', [{ex:K,note:'Set 1: 140 lbs x5reps'}])===1,'F2 · new est-1RM beats history → 1 PR');
var wF2b=withHist([ sess(2000,'Set 1: 90 lbs x5reps'), sess(1000,'Set 1: 100 lbs x5reps') ]);
ok(wF2b.countNewEstPRs('a', [{ex:K,note:'Set 1: 90 lbs x5reps'}])===0,'F2 · below prior best → 0 PRs');
ok(wF2a.est1RM(140,5)>wF2a.est1RM(100,5),'F2 · est1RM monotonic in weight (Epley reused, not reinvented)');

console.log('\n'+(fail?('PROGRESSION SPOT-CHECK: '+fail+' FAILED'):'PROGRESSION SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
