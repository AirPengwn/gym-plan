'use strict';
// Patch 3 spot-check: per-step verification per HANDOFF-patch-3.md.
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
const ST=store();
const w=app(ST); const D=w.document;

// ─── Step 1 ───
// 1a. deltaPill signature backward compatible — no-variant calls render identically.
ok(/delta-up.*▲ \+50%/.test(w.deltaPill(15,10,{})),'Step 1 · deltaPill no-variant default rendering unchanged');
ok(/delta-down.*▼/.test(w.deltaPill(5,10,{})),'Step 1 · deltaPill down arrow unchanged');
ok(/delta-flat.*= no change/.test(w.deltaPill(10,10,{})),'Step 1 · deltaPill flat unchanged');
// 1b. PB gold variant opt-in: emits PB Nd, ignores previous, no arrow.
var pb=w.deltaPill(12,12,{variant:'pb'});
ok(/delta-pb">PB 12d</.test(pb),'Step 1 · PB variant emits "PB 12d" with .delta-pb class');
// PB variant text content has no arrow/equals glyph (ignore CSS attribute `=` in markup).
ok(!/>PB \d+d[^<]*[▲▼]/.test(pb) && !/>= /.test(pb.replace(/class="[^"]*"/g,'')),'Step 1 · PB variant text has no arrow/equals glyph');
// 1c. _streakPill PB case now routes through deltaPill.
ok(/PB 7d/.test(w._streakPill(7,7)),'Step 1 · _streakPill emits PB pill when current==longest');
ok(/vs PB 10d/.test(w._streakPill(6,10)),'Step 1 · _streakPill emits "vs PB" neutral when current>=50% longest');
ok(w._streakPill(2,10)==='','Step 1 · _streakPill empty when current<50% longest');
// 1d. .delta-pb CSS uses spec colors.
var css=D.documentElement.innerHTML;
ok(/\.delta-pb\{background:#FBF1D6;color:#8C6500\}/.test(css),'Step 1 · .delta-pb light colors match spec (#FBF1D6 / #8C6500)');
// v5.14 (T10): #FFD740 → var(--gold). Color still resolves to the same hex.
ok(/body\.dark \.delta-pb\{background:#3A2E00;color:var\(--gold\)\}/.test(css),'Step 1 · .delta-pb dark colors match spec (v5.14: var(--gold))');
// 1e. Body-measurements summary now uses deltaPill.
// v5.14 (T2-B5): bodyweight Change is colored ONLY when a goal is explicitly set.
// Seed two weight entries (start 200, current 185 — loss) and goal=down.
w.localStorage.setItem('bodyweight_goal_v1','down');
w.localStorage.setItem('body_measurements', JSON.stringify([
  {type:'weight', value:200, unit:'lbs', date:'2026-04-01'},
  {type:'weight', value:185, unit:'lbs', date:'2026-05-15'}
]));
try{ w.renderGenericMeas('weight'); }catch(e){console.log('renderGenericMeas err: '+e.message);}
var summW=(D.getElementById('meas-summary')||{}).innerHTML||'';
ok(/delta-pill/.test(summW),'Step 1 · weight summary card renders a delta-pill');
ok(/delta-up/.test(summW) && /▼/.test(summW),'Step 1 · v5.14 · with goal=down, loss reads green ▼');
// Inverse: gain → red (still goal=down so gain is bad)
w.localStorage.setItem('body_measurements', JSON.stringify([
  {type:'weight', value:180, unit:'lbs', date:'2026-04-01'},
  {type:'weight', value:195, unit:'lbs', date:'2026-05-15'}
]));
try{ w.renderGenericMeas('weight'); }catch(e){}
var summG=(D.getElementById('meas-summary')||{}).innerHTML||'';
ok(/delta-down/.test(summG) && /▲/.test(summG),'Step 1 · v5.14 · with goal=down, gain reads red ▲');
// v5.14 (T2-B5): without a goal set, weight Change is neutral muted text.
w.localStorage.removeItem('bodyweight_goal_v1');
try{ w.renderGenericMeas('weight'); }catch(e){}
var summN=(D.getElementById('meas-summary')||{}).innerHTML||'';
ok(/delta-neutral/.test(summN) && !/delta-up|delta-down/.test(summN),'Step 1 · v5.14 · without goal, Change is neutral (no green/red)');
// Waist
w.localStorage.setItem('body_measurements', JSON.stringify([
  {type:'waist', value:36, unit:'in', date:'2026-04-01'},
  {type:'waist', value:34, unit:'in', date:'2026-05-15'}
]));
try{ w.renderGenericMeas('waist'); }catch(e){}
var summWa=(D.getElementById('meas-summary-waist')||{}).innerHTML||'';
ok(/delta-pill/.test(summWa) && /delta-up/.test(summWa),'Step 1 · waist summary renders delta-pill (loss=green)');
// Bodyfat
w.localStorage.setItem('body_measurements', JSON.stringify([
  {type:'bodyfat', value:22, unit:'%', date:'2026-04-01'},
  {type:'bodyfat', value:18, unit:'%', date:'2026-05-15'}
]));
try{ w.renderGenericMeas('bodyfat'); }catch(e){}
var summBf=(D.getElementById('meas-summary-bodyfat')||{}).innerHTML||'';
ok(/delta-pill/.test(summBf) && /delta-up/.test(summBf),'Step 1 · bodyfat summary renders delta-pill (loss=green)');

// ─── Step 2 ───
// Seed a session so renderStats emits zones.
w.localStorage.setItem('gymlog_a', JSON.stringify([{
  label:'Day 1 — Upper A', date:'May 18, 2026 at 9:00 AM', ts:Date.now()-86400*1000, duration:42,
  entries:[{ex:'Chest press', note:'Set 1: 100 lbs x10reps | Set 2: 105 lbs x8reps'}]
}]));
w.switchProgTab('stats', null);
var stats=(D.getElementById('prog-stats')||{}).innerHTML||'';
// v5.45 (P1-A): the 3 zone-titles (Now / Trends / Awards) became 4 collapsible
// <details class="trend-band"> bands (This week / Over time / Needs a look /
// Achievements). The section content within each band is unchanged.
ok(/data-band="this-week"/.test(stats)&&/trend-band-title">This week</.test(stats),'v5.45 · "This week" band present (was: Now zone)');
ok(/data-band="over-time"/.test(stats)&&/trend-band-title">Over time</.test(stats),'v5.45 · "Over time" band present (was: Trends zone)');
ok(/data-band="achievements"/.test(stats)&&/trend-band-title">Achievements</.test(stats),'v5.45 · "Achievements" band present (was: Awards zone)');
ok(/\.stats-zone-title\{margin-top:28px\}/.test(css),'Step 2 · CSS adds 28px top margin to zone titles');
ok(/\.zone-section:first-child>\.stats-zone-title\{margin-top:0\}/.test(css),'Step 2 · first-zone gets margin-top:0');
ok(!/\.zone-hdr\{/.test(css),'Step 2 · dead .zone-hdr CSS rule removed');
ok(!/zone-hdr-sub/.test(stats),'Step 2 · no remaining zone-hdr-sub usage');

// ─── Step 3 ───
// Force render of v2 card by switching to Day 1.
var pa=D.getElementById('p-a');
ok(!!pa,'Step 3 · Day 1 panel exists');
// v2 card (strength/notes) checkbox is the one promoted in Step 3; the legacy
// cardio card (warm-up) still uses the legacy div checkbox by design.
var cb=pa && pa.querySelector('.v2-card .checkbox');
ok(cb && cb.tagName==='BUTTON','Step 3 · v2 card .checkbox tagName=BUTTON');
ok(cb && cb.getAttribute('role')==='checkbox','Step 3 · role="checkbox"');
ok(cb && cb.getAttribute('aria-checked')==='false','Step 3 · initial aria-checked="false"');
ok(cb && cb.getAttribute('aria-label')==='Mark exercise complete','Step 3 · aria-label set');
ok(cb && /tog\(/.test(cb.getAttribute('onclick')||''),'Step 3 · onclick still calls tog()');
ok(cb && cb.getAttribute('type')==='button','Step 3 · type="button" to prevent form-submit');
// Toggle and confirm aria-checked flips.
cb.click();
ok(cb.getAttribute('aria-checked')==='true','Step 3 · aria-checked flips to "true" after tog()');
ok(cb.getAttribute('aria-pressed')==='true','Step 3 · aria-pressed also stays in sync (backward-compat)');
cb.click();
ok(cb.getAttribute('aria-checked')==='false','Step 3 · aria-checked flips back to "false"');
// CSS reset present.
var _bcb=(css.match(/button\.checkbox\{[^}]*\}/)||[''])[0];
ok(/background:transparent/.test(_bcb)&&/appearance:none/.test(_bcb)&&/border:0/.test(_bcb)&&/line-height:0/.test(_bcb),'Step 3 · button.checkbox UA-reset CSS present');
// applyA11y must NOT clobber role="checkbox" with role="button" on the new <button> form.
ok(cb.getAttribute('role')==='checkbox','Step 3 · applyA11y did not overwrite role="checkbox"');
// And native button is keyboard-focusable (we don't add tabindex=0 since it's intrinsic).
ok(cb.getAttribute('tabindex')==null,'Step 3 · no redundant tabindex on real <button>');

// ─── Step 4 ───
// Comment block immediately above prog-tab-row.
var htmlSrc=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
ok(/Tab labels \(Sessions \/ Lifts \/ Trends\) intentionally diverge/.test(htmlSrc),'Step 4 · alias comment present in source');
ok(/<!--[\s\S]*?Tab labels \(Sessions \/ Lifts \/ Trends\)[\s\S]*?-->\s*<!-- Sessions \/ Lifts \/ Trends tabs/.test(htmlSrc),'Step 4 · comment immediately precedes the prog-tab-row markup');

console.log('\n'+(fail?('PATCH 3 SPOT-CHECK: '+fail+' FAILED'):'PATCH 3 SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
