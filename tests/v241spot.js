'use strict';
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
    w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    try{Object.defineProperty(w.location,'reload',{value(){},configurable:true});}catch(e){}
  }}).window;
}
const w=app(store()); const D=w.document; let fail=0;
const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l);if(!c)fail++;};

// 1. Tab classes
w.showTab('backup');
ok(D.getElementById('tab-backup').className==='tab-btn on','tab-btn backup=on');
ok(D.getElementById('tab-restore').className==='tab-btn off','tab-btn restore=off');
w.showTab('restore');
ok(D.getElementById('tab-backup').className==='tab-btn off','tab-btn backup=off after toggle');
ok(D.getElementById('tab-restore').className==='tab-btn on','tab-btn restore=on after toggle');

// 2. Chip via builder
try{w.openBuilder(null);}catch(e){console.log('  (openBuilder error: '+e.message+')');}
var chips=D.querySelectorAll('#b-muscles .chip');
ok(chips.length>0,'muscle chips render with .chip class ('+chips.length+')');
if(chips[0]){
  ok(!chips[0].getAttribute('style'),'chip has no inline style');
  w.toggleMuscleChip(chips[0]);
  ok(chips[0].className==='chip on','toggleMuscleChip sets .chip.on');
  w.toggleMuscleChip(chips[0]);
  ok(chips[0].className==='chip','toggleMuscleChip removes .on');
}
var dchips=D.querySelectorAll('#b-days .chip');
ok(dchips.length===5,'day chips: 5 with .chip class (got '+dchips.length+')');

// 3. Measurement inputs have .meas-in class, no inline style
['meas-weight-val','meas-date-val','meas-waist-val','meas-waist-date','meas-bodyfat-val','meas-bodyfat-date'].forEach(function(id){
  var el=D.getElementById(id);
  ok(el && el.classList.contains('meas-in'),id+' has .meas-in');
  ok(el && !el.getAttribute('style'),id+' has no inline style');
});

// 4. Lift row: load history, render stats, navigate to lift detail
w.localStorage.setItem('gymlog_a',JSON.stringify([{label:'Day 1',date:Date.now(),entries:[{ex:'Chest press',note:'Set 1: 100 x 10|Set 2: 100 x 10|Set 3: 100 x 10'}]}]));
try{w.renderStats&&w.renderStats();}catch(e){}
try{w.openLiftDetail&&w.openLiftDetail('Chest press');}catch(e){}
var rows=D.querySelectorAll('.lift-stat-row');
ok(rows.length>0,'lift-stat-row rendered ('+rows.length+')');
if(rows[0]){
  ok(!!rows[0].querySelector('.k'),'lift-stat-row has .k child');
  ok(!!rows[0].querySelector('.v'),'lift-stat-row has .v child');
}

// 5. CSS source check: every new dark rule is present
var css=D.documentElement.innerHTML;
ok(/body\.dark \.meas-in\{/.test(css),'body.dark .meas-in rule present');
ok(/body\.dark \.tab-btn\.off\{/.test(css),'body.dark .tab-btn.off rule present');
ok(/body\.dark \.lift-stat-row\{/.test(css),'body.dark .lift-stat-row rule present');
ok(/body\.dark \.chip\{/.test(css),'body.dark .chip rule present');
ok(/body\.dark #pc-target,body\.dark #pc-bar\{/.test(css),'body.dark #pc-target/#pc-bar rule present');
ok(/body\.dark \.edit-date-input\{/.test(css),'body.dark .edit-date-input rule present');
ok(/body\.dark \.rep-input:focus/.test(css),'body.dark focus rule present');

// 6. No residual inline #fff/#FAFAF8/#2C2C2A in the refactored sites
ok(!/id="meas-weight-val"[^>]*style=/.test(css),'meas-weight-val has no inline style');
ok(!/id="tab-backup"[^>]*style=/.test(css),'tab-backup has no inline style');
ok(!/id="tab-restore"[^>]*style=/.test(css),'tab-restore has no inline style');

// 7. Dark mode toggles
try{w.toggleDarkMode();}catch(e){}
ok(D.body.classList.contains('dark'),'dark mode applied');
try{w.toggleDarkMode();}catch(e){}
ok(!D.body.classList.contains('dark'),'returns to light');

console.log('\n'+(fail?('v2.41 SPOT-CHECK: '+fail+' FAILED'):'v2.41 SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
