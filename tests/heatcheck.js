'use strict';
const fs=require('fs');const{JSDOM}=require('jsdom');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const ctx=new Proxy(function(){return ctx;},{get:()=>ctx,set:()=>true,apply:()=>ctx});
const now=Date.now();
function sess(daysAgo, ex, note){
  const t=now-daysAgo*864e5;
  const d=new Date(t);
  return {date:d.toDateString()+' at 5:00 PM', ts:t, label:'Day 1 — Upper A', entries:[{ex:ex,note:note}]};
}
// Day a history: chest press across THIS week (heavy) + 2 prior weeks (lighter)
const gymlogA=[
  sess(1,  'Chest press','Set 1: 100 lbs x10reps | Set 2: 100 lbs x10reps | Set 3: 100 lbs x10reps'), // this wk ~3000
  sess(9,  'Chest press','Set 1: 60 lbs x10reps'),   // prior wk ~600
  sess(16, 'Chest press','Set 1: 60 lbs x10reps')    // 2 wks ago ~600
];
const mk=init=>{const z=new Map(Object.entries(init||{}));return{getItem:k=>z.has(k)?z.get(k):null,setItem:(k,v)=>z.set(''+k,''+v),removeItem:k=>z.delete(k),clear:()=>z.clear(),key:i=>{const a=[...z.keys()];return i<a.length?a[i]:null;},get length(){return z.size;}};};
const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://s.test/',pretendToBeVisual:true,beforeParse(w){
 Object.defineProperty(w,'localStorage',{value:mk({gymlog_a:JSON.stringify(gymlogA)}),configurable:true});
 Object.defineProperty(w,'sessionStorage',{value:mk({gym_test_mode:'1'}),configurable:true});
 w.fetch=()=>Promise.reject(new Error('no'));
 w.HTMLCanvasElement.prototype.getContext=()=>ctx;
 w.devicePixelRatio=1;w.scrollTo=()=>{};
 w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
 try{Object.defineProperty(w.location,'reload',{value(){},configurable:true});}catch(e){}
}});
const w=dom.window;
let fail=0; const ok=(c,l)=>{ console.log((c?'  ok   ':'  FAIL ')+l); if(!c) fail++; };
ok(typeof w.buildMuscleHeatMapSVG==='function','buildMuscleHeatMapSVG exposed');
ok(typeof w.computeWeeklyMuscleLoad==='function','computeWeeklyMuscleLoad exposed');
const loads=w.computeWeeklyMuscleLoad();
ok(loads && typeof loads==='object','loads object returned');
ok(['high','overworked'].indexOf(loads.chest)>=0,'chest flagged high/overworked this week (got '+loads.chest+')');
ok(loads.quad==='none','untrained muscle (quad) = "none" not omitted (got '+loads.quad+')');
ok(Object.prototype.hasOwnProperty.call(loads,'hamstring'),'all renderable muscles present in loads (hamstring)');
// dark-mode repaint hook should run renderProgress+renderStats without throwing
var threw=false; try{ w.toggleDarkMode(); }catch(e){ threw=true; }
ok(!threw && w.document.body.classList.contains('dark'),'toggleDarkMode repaints + flips class without error');
w.toggleDarkMode(); // back to light for the rest of the checks
const svg=w.buildMuscleHeatMapSVG(loads);
ok(typeof svg==='string' && svg.indexOf('FRONT')>=0 && svg.indexOf('Overworked')>=0 && svg.indexOf('translate(45,18)')>=0,'heat svg renders with legend');
w.document.body.classList.add('dark');
const svgD=w.buildMuscleHeatMapSVG(loads);
ok(svgD.indexOf('#1A1A2E')>=0,'dark mode honored');
// renderStats injects the section
w.document.body.classList.remove('dark');
w.renderStats();
const statsHtml=(w.document.getElementById('prog-stats')||{}).innerHTML||'';
ok(statsHtml.indexOf('Weekly Muscle Load')>=0,'renderStats injects Weekly Muscle Load section');
ok(statsHtml.indexOf('Weekly Volume')>=0,'existing Weekly Volume section still present');

// ── Scenario 2: NOTHING logged this calendar week (all sessions stale) ──
// Must fall back to the most recent week with data and still render.
const stale=[
  sess(12,'Chest press','Set 1: 100 lbs x10reps | Set 2: 100 lbs x10reps | Set 3: 100 lbs x10reps'),
  sess(20,'Chest press','Set 1: 60 lbs x10reps'),
  sess(27,'Chest press','Set 1: 60 lbs x10reps')
];
const dom2=new JSDOM(html,{runScripts:'dangerously',url:'https://s.test/',pretendToBeVisual:true,beforeParse(w2){
 Object.defineProperty(w2,'localStorage',{value:mk({gymlog_a:JSON.stringify(stale)}),configurable:true});
 Object.defineProperty(w2,'sessionStorage',{value:mk({gym_test_mode:'1'}),configurable:true});
 w2.fetch=()=>Promise.reject(new Error('no'));
 w2.HTMLCanvasElement.prototype.getContext=()=>ctx;
 w2.devicePixelRatio=1;w2.scrollTo=()=>{};
 w2.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
 try{Object.defineProperty(w2.location,'reload',{value(){},configurable:true});}catch(e){}
}});
const w2=dom2.window;
const L2=w2.computeWeeklyMuscleLoad();
ok(L2 && Object.keys(L2).some(function(k){return L2[k]&&L2[k]!=='none';}),'stale-week: still produces a non-none load (fallback to latest week)');
w2.renderStats();
const sh2=(w2.document.getElementById('prog-stats')||{}).innerHTML||'';
ok(sh2.indexOf('Weekly Muscle Load')>=0,'stale-week: Weekly Muscle Load section still renders');

console.log('\n'+(fail?('HEATCHECK FAIL '+fail):'HEATCHECK PASS'));
process.exit(fail?1:0);
