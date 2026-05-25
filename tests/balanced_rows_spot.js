'use strict';
// v3.2 — balanced-row layout for the day-derived button strips. Verifies the
// column math and that renderDaySelector / renderProgressDayWidgets actually
// apply the flex-basis layout to their children (no horizontal scroll).
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
    w.confirm=()=>true; w.prompt=()=>'Day 6 — Arms';
  }}).window;
}
let fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };
const ST=store(); ST.setItem('gym_primary_device','1');
const w=app(ST); const D=w.document;

// ── column math ──
var cases={1:1,4:4,5:3,6:3,7:4,8:4,9:3,10:4,12:4,13:4};
Object.keys(cases).forEach(function(n){ ok(w._balancedCols(+n)===cases[n],'_balancedCols('+n+')='+cases[n]+' (got '+w._balancedCols(+n)+')'); });

// ── default 5-day view: day selector is wrapped (3+2), not a scroll row ──
var sel=D.getElementById('day-selector');
ok(sel && sel.style.display==='flex' && sel.style.flexWrap==='wrap','day-selector uses flex-wrap (no overflow scroll)');
ok(sel.children.length===5 && sel.children[0].style.flex.indexOf('0 0')===0,'day-selector children given fixed flex-basis');
// jsdom rewrites calc((100% - Npx)/cols) as calc(<1/cols> * (...)), so derive
// the column count from the coefficient.
function colsFrom(el){ var m=(el.style.maxWidth||'').match(/calc\(\s*([0-9.]+)/); return m?Math.round(1/parseFloat(m[1])):0; }
ok(colsFrom(sel.children[0])===3,'5 days → 3 columns (3-over-2)');

// ── v4.1: stat-box grid replaced by a single hero metric line; per-day counts
//    moved to the filter-chip pills (which still wrap). ──
var hero=D.getElementById('prog-hero');
ok(!!hero,'progress hero line element present (replaced the stat-box grid)');
ok(!D.querySelector('#prog-stats-row .stat-box'),'old per-day stat boxes are gone');
var chips=D.getElementById('sess-filter-row');
ok(chips && chips.style.flexWrap==='wrap' && !/auto/.test(chips.style.overflowX||''),'filter chips wrap (scrollbar gone)');

// ── add a 6th day → re-layout to 3+3 ──
w.addDay('Day 6 — Arms');
w.renderDaySelector();
var sel2=D.getElementById('day-selector');
ok(sel2.children.length===6 && colsFrom(sel2.children[0])===3,'6 days → still 3 columns (3+3)');

// ── Plan as its own screen: 📋 hides the Progress chrome + lights up; 📊 restores ──
var statsRow=D.getElementById('prog-stats-row'), tabRow=D.querySelector('.prog-tab-row');
w.openManage();
ok(D.getElementById('hdr-plan-btn').classList.contains('active'),'📋 lights up when Plan opens');
ok(!D.getElementById('hdr-prog-btn').classList.contains('active'),'📊 dims while Plan is open');
ok(statsRow.style.display==='none' && tabRow.style.display==='none','Plan hides Progress stat boxes + tab row (distinct screen)');
ok(D.getElementById('prog-panel-manage').classList.contains('show'),'Plan panel shown');
// 📊 from the Plan screen returns to Sessions with chrome restored
w.sw('prog', D.getElementById('hdr-prog-btn'));
ok(!D.getElementById('prog-panel-manage').classList.contains('show'),'📊 leaves the Plan screen');
ok(D.getElementById('prog-panel-days').classList.contains('show'),'📊 lands on Sessions');
ok(statsRow.style.display!=='none' && tabRow.style.display!=='none','Progress chrome restored');
ok(!D.getElementById('hdr-plan-btn').classList.contains('active') && D.getElementById('hdr-prog-btn').classList.contains('active'),'header highlight back on 📊');

console.log('\n'+(fail?('BALANCED-ROWS SPOT-CHECK: '+fail+' FAILED'):'BALANCED-ROWS SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
