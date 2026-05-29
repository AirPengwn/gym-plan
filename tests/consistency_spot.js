'use strict';
// v3.38 — characterization lock for the consistency viz (previously untested):
// computeStats() streak/cadence math + renderActivityHeatmap() 13-week calendar.
// Read-only. Also guards the v3.38 fix to longestStreak (chronological, not
// lexical, day-key sort — single→double-digit dates no longer break a streak).
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

// timestamp n days ago. n=0 → "just now" (always today + in the past, so
// daysSinceLast===0 regardless of the runner's clock/timezone); n>=1 → noon n
// days ago (a stable, clearly-past calendar day for streak math).
function dayTs(n){ if(n===0) return Date.now()-60000; var d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-n); return d.getTime(); }
function s(n){ return {label:'D',date:'x',ts:dayTs(n),entries:[{ex:'Chest press',note:'Set 1: 100 lbs x8reps'}]}; }

// ── empty state ──
var wE=app(store({gym_primary_device:'1'}));
ok(wE.computeStats()===null,'computeStats → null with no sessions');
ok(wE.renderActivityHeatmap()==='','activity heatmap empty string with no sessions');

// ── seeded cadence: current 3-day streak (today,-1,-2) + an older 4-day block ──
var ST=store({gym_primary_device:'1'});
ST.setItem('gymlog_a', JSON.stringify([ s(0), s(1), s(2),  s(10), s(11), s(12), s(13) ]));
var w=app(ST);
var st=w.computeStats();
ok(!!st,'computeStats returns a stats object');
ok(st.total===7,'total sessions counted (7)');
ok(st.streak===3,'current streak = 3 consecutive days (today, -1, -2) — got '+st.streak);
ok(st.longestStreak===4,'longest streak = 4 (the older block) — got '+st.longestStreak+' (guards the chronological-sort fix)');
ok(st.daysSinceLast===0,'days since last = 0 (trained today)');
ok(typeof st.avgDaysBetween==='number' && st.avgDaysBetween>0,'avg days between sessions computed');

// ── the activity calendar renders the last 12 weeks with a legend + day cells ──
var heat=w.renderActivityHeatmap();
ok(/last 12 weeks/.test(heat),'activity heatmap titled "last 12 weeks"');
// v5.19: legend is now explicit ("rest · 1 session · 2+ sessions") instead of "Less → More".
ok(/rest/.test(heat) && /1 session/.test(heat) && /2\+ sessions/.test(heat),'activity heatmap legend spells out the color meanings');
ok(/session/.test(heat),'activity heatmap cells carry session-count tooltips');
ok(/hm-dow/.test(heat) && /hm-cell/.test(heat),'v5.19 · day-of-week labels + cell grid markup present');
ok(/hm-cell\s+high\s+today|hm-cell\s+med\s+today|hm-cell\s+rest\s+today/.test(heat) || /hm-cell rest today|hm-cell med today|hm-cell high today/.test(heat),'v5.19 · today cell carries the .today class');

// ── longestStreak chronological-sort fix: a streak straddling day 9↔10 counts ──
// (build 3 consecutive days anchored so the block includes a single→double-digit
//  rollover; the streak must read 3, not be split by lexical sort.)
var ST2=store({gym_primary_device:'1'});
var base=new Date(); base.setHours(12,0,0,0); base.setFullYear(2026,4,8); // 2026-05-08 fixed
function fixedTs(dom){ var d=new Date(2026,4,dom,12,0,0,0); return d.getTime(); }
ST2.setItem('gymlog_a', JSON.stringify([
  {label:'D',date:'x',ts:fixedTs(9), entries:[{ex:'Chest press',note:'Set 1: 100 lbs x8reps'}]},
  {label:'D',date:'x',ts:fixedTs(10),entries:[{ex:'Chest press',note:'Set 1: 100 lbs x8reps'}]},
  {label:'D',date:'x',ts:fixedTs(11),entries:[{ex:'Chest press',note:'Set 1: 100 lbs x8reps'}]}
]));
var w2=app(ST2);
ok(w2.computeStats().longestStreak===3,'longest streak across 9→10→11 = 3 (lexical sort would have split it)');

// ── read-only ──
var before=ST.getItem('gymlog_a');
w.computeStats(); w.renderActivityHeatmap();
ok(ST.getItem('gymlog_a')===before,'computeStats + renderActivityHeatmap are read-only');

console.log('\n'+(fail?('CONSISTENCY SPOT-CHECK: '+fail+' FAILED'):'CONSISTENCY SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
