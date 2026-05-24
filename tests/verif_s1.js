'use strict';
// VERIFICATION.md §1 — Universal regression suite, executed in jsdom.
// Faithful automation of the 10 manual steps (Test Mode on; reload = fresh
// jsdom over a shared localStorage).
const fs=require('fs');const{JSDOM}=require('jsdom');
const HTML=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
let fail=0; const ok=(c,l)=>{ console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };
function store(init){ const m=new Map(Object.entries(init||{})); return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(''+k,''+v),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:i=>{const a=[...m.keys()];return i<a.length?a[i]:null;},get length(){return m.size;}}; }
function app(st){
  const ctx=new Proxy(function(){return ctx;},{get:()=>ctx,set:()=>true,apply:()=>ctx});
  return new JSDOM(HTML,{runScripts:'dangerously',url:'https://s.test/',pretendToBeVisual:true,beforeParse(w){
    Object.defineProperty(w,'localStorage',{value:st,configurable:true});
    Object.defineProperty(w,'sessionStorage',{value:store({gym_test_mode:'1'}),configurable:true});
    w.fetch=()=>Promise.reject(new Error('no'));
    w.HTMLCanvasElement.prototype.getContext=()=>ctx;
    w.devicePixelRatio=1;w.scrollTo=()=>{};w.alert=()=>{};w.confirm=()=>true;
    w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    try{Object.defineProperty(w.location,'reload',{value(){},configurable:true});}catch(e){}
  }}).window;
}
const ST=store();
let w=app(ST);
const D=w.document;

// 1 — Open Day 1: 10 exercises, name/cues/loc present
var d1=D.querySelectorAll('#items-a .item');
ok(d1.length===10,'1 · Day 1 renders 10 exercises');
var c2=w.document.getElementById(w.domId? '' : '') ; // noop
var ex2=D.querySelector('#items-a [data-ex="Chest press"][data-set="1"]');
var ex2item=ex2&&ex2.closest('.item');
ok(!!D.querySelector('#items-a .ex-name') && !!D.querySelector('#items-a .ex-sub'),'1 · names + cues visible');
// location now lives in the ⋯ overflow for v2/cardio — still in the DOM
ok(!!D.querySelector('#items-a .ex-loc'),'1 · locations present (in overflow per redesign)');

// 2 — tick exercise 1 → done
var it1=D.querySelector('#items-a .item');
it1.querySelector('.checkbox').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
ok(it1.classList.contains('done'),'2 · ticking exercise 1 sets done state');
ok(/\.v2-card\.item\.done \.v2-head \.ex-name\{color:var\(--muted\);text-decoration:line-through\}/.test(D.documentElement.innerHTML),'2 · done state is greyed + struck-through (CSS present)');

// 3 — enter 100 in Set 1 weight of exercise 2, blur, stays
var wIn=ex2item.querySelector('.rep-input[data-set="1"]');
wIn.value='100'; wIn.dispatchEvent(new w.Event('input',{bubbles:true})); wIn.dispatchEvent(new w.Event('blur',{bubbles:true}));
ok(wIn.value==='100','3 · weight 100 persists on blur (not erased)');

// 4 — RPE slider ~7 → label updates
var rpe=ex2item.querySelector('.rpe-slider');
rpe.value='7'; rpe.dispatchEvent(new w.Event('input',{bubbles:true}));
var rv=ex2item.querySelector('.rpe-top-val');
ok(rv && /7/.test(rv.textContent),'4 · RPE value updates next to label ("'+(rv&&rv.textContent)+'")');

// 5 — Complete Day 1 → modal → Save
w.completeDay('a','Day 1 — Upper A');
var modal=D.getElementById('date-modal-overlay');
ok(modal && modal.classList.contains('show'),'5 · date-confirm modal appears');
var before=w.getSaved('a').length;
w.confirmSave();
ok(w.getSaved('a').length===before+1,'5 · Save writes the session');

// 6 — session appears with the entered weight
var saved=w.getSaved('a')[0];
var hasCP=(saved.entries||[]).some(function(e){return e.ex==='Chest press' && /100/.test(e.note);});
ok(hasCP,'6 · saved session contains Chest press 100 (shows in Progress)');
try{ w.renderProgress(); }catch(e){}
// Step 5 refactor: per-day prog-body-X removed; sessions now render into #sess-feed as a cross-day timeline.
var _feedHTML=(D.getElementById('sess-feed')||{}).innerHTML||'';
ok(/Chest press/.test(_feedHTML) && /sess-card/.test(_feedHTML),'6 · Progress → session feed lists the Chest press session');
ok((D.getElementById('prog-count-a')||{}).textContent==='1','6 · Day 1 filter chip shows count of 1');

// 7 — reload: session still there
w.close(); w=app(ST);
ok(w.getSaved('a').length>=1 && (w.getSaved('a')[0].entries||[]).some(function(e){return e.ex==='Chest press';}),'7 · saved session survives reload');

// 8 — dark mode toggles, repaint, no throw
var threw=false; try{ w.toggleDarkMode(); }catch(e){ threw=true; }
ok(!threw && w.document.body.classList.contains('dark'),'8 · dark mode flips (muscle maps repaint via renderProgress/renderStats)');
var svgD=w.buildMuscleMapSVG(w.dayMusclesFor('a'));
ok(svgD.indexOf('#1A1A2E')>=0,'8 · muscle map repaints in dark palette');
// 9 — back to light
try{ w.toggleDarkMode(); }catch(e){}
ok(!w.document.body.classList.contains('dark'),'9 · returns to light');

// 10 — muscle map anatomical + Day 1 lights chest/shoulder/arms
var dm=w.dayMusclesFor('a');
var svg=w.buildMuscleMapSVG(dm);
ok((dm.front||[]).indexOf('chest')!==-1,'10 · Day 1 front includes chest');
ok(svg.indexOf('M 28 58')>=0 && svg.indexOf('translate(45,18)')>=0,'10 · anatomical silhouette figure (not blocks), chest region drawn');

console.log('\n'+(fail?('§1 UNIVERSAL REGRESSION: '+fail+' FAILED'):'§1 UNIVERSAL REGRESSION: ALL 10 PASS'));
process.exit(fail?1:0);
