'use strict';
// v3.2 — exercise library + linked re-add. getExerciseLibrary() surfaces every
// distinct exercise (active days, history-only, archived). planAddExisting()
// re-adds by the existing histEx (history stays attached) and links across days.
const fs=require('fs');const{JSDOM}=require('jsdom');
const HTML=fs.readFileSync('C:\\dev\\gym-plan\\index.html','utf8');
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
const ST=store(); ST.setItem('gym_primary_device','1');
// a history-only exercise (never in any plan) — should still surface in library
ST.setItem('gymlog_b', JSON.stringify([{label:'Day 2',date:'x',ts:7,entries:[{ex:'Imaginary Lift',note:'Set 1: 50 lbs x8reps'}]}]));
const w=app(ST);
function idsOf(day){ return (w.getEffectivePlan().order[day]||[]); }

// ── library surfaces defaults + history-only ──
var lib=w.getExerciseLibrary();
ok(lib.length>5,'library lists many exercises (defaults included)');
ok(lib.some(function(e){ return /Imaginary Lift/i.test(e.name); }),'history-only exercise appears in library');
var imaginary=lib.filter(function(e){ return /Imaginary Lift/i.test(e.name); })[0];
ok(imaginary && imaginary.daysList.length===0 && imaginary.sessions===1,'history-only entry: 0 active days, 1 session');

// ── re-add a default exercise (currently on day a, NOT day b) onto day b → LINKED ──
var plan=w.getEffectivePlan();
var bHists={}; idsOf('b').forEach(function(id){ bHists[plan.ex[id].histEx]=1; });
var srcId=idsOf('a').filter(function(id){ return !bHists[plan.ex[id].histEx]; })[0];
var srcHist=plan.ex[srcId].histEx;
ok(idsOf('b').every(function(id){ return w.getEffectivePlan().ex[id].histEx!==srcHist; }),'precondition: that exercise not yet on day b');
w.planAddExisting(srcHist, ['b']);
var p2=w.getEffectivePlan();
var bInst=idsOf('b').filter(function(id){ return p2.ex[id].histEx===srcHist; })[0];
ok(!!bInst,'re-added onto day b with the SAME histEx (history preserved)');
var aInst=idsOf('a').filter(function(id){ return p2.ex[id].histEx===srcHist; })[0];
ok(p2.ex[aInst].linkId && p2.ex[aInst].linkId===p2.ex[bInst].linkId,'day a + day b instances share a linkId (linked)');

// ── re-adding to a day it's already on is a no-op (no duplicate) ──
var beforeLen=idsOf('b').length;
w.planAddExisting(srcHist, ['b']);
ok(idsOf('b').length===beforeLen,'re-adding to an existing day does not duplicate');

// ── re-add the history-only exercise to an active day → creates a real instance ──
w.planAddExisting('Imaginary Lift', ['c']);
var p3=w.getEffectivePlan();
ok(idsOf('c').some(function(id){ return /Imaginary Lift/i.test(p3.ex[id].name||''); }),'history-only exercise placed onto a day, history reconnects by histEx');

// ── v3.3 seed catalog: library-only exercises, NOT on any day until added ──
var lib2=w.getExerciseLibrary();
var catNames=w.EXERCISE_CATALOG.map(function(c){return c.name;});
ok(w.EXERCISE_CATALOG.length===17,'catalog has all 17 seed exercises');
ok(catNames.every(function(n){ return lib2.some(function(e){ return e.name===n; }); }),'every catalog exercise shows in the library');
var goblet=lib2.filter(function(e){ return /goblet squat/i.test(e.name); })[0];
ok(goblet && goblet.daysList.length===0,'catalog exercise is NOT scheduled on any day (library only)');
// none of the catalog exercises leaked onto a real day's plan
var onAnyDay=false; w.getDays().forEach(function(d){ (w.getEffectivePlan().order[d]||[]).forEach(function(id){ if(catNames.indexOf((w.getEffectivePlan().ex[id]||{}).name)!==-1) onAnyDay=true; }); });
ok(!onAnyDay,'no catalog exercise auto-added to a day');
// adding one from the catalog carries its full fields (category, cues, video, muscles, badge)
w.planAddExisting('Dumbbell goblet squat', ['d']);
var pg=w.getEffectivePlan();
var gid=(pg.order['d']||[]).filter(function(id){ return /goblet squat/i.test(pg.ex[id].name||''); })[0];
ok(!!gid,'catalog exercise added to a day');
var grec=pg.ex[gid];
ok(grec.cat==='Lower body' && /hold dumbbell at chest/.test(grec.sub||''),'carries category + cues line');
ok(grec.badge && grec.badge.text==='knee-aware','carries the knee-aware badge');
ok((grec.muscles||[]).indexOf('quad')!==-1 && (grec.muscles||[]).indexOf('glute')!==-1,'carries mapped muscle keys');
ok(/youtube\.com/.test(grec.video||''),'carries the demo video URL');

// ── v3.5 user library: save without a day, appears, addable, deletable ──
w.addToUserLibrary({name:'Hack squat XYZ',type:'strength',cat:'Lower body',sub:'3 × 10 · deep',loc:'Hack rack',video:'',sets:3,muscles:['quad','glute']});
var lib3=w.getExerciseLibrary();
var hs=lib3.filter(function(e){ return /hack squat xyz/i.test(e.name); })[0];
ok(hs && hs.fromUser===true && hs.daysList.length===0,'saved-to-library exercise appears (fromUser, no day)');
w.planAddExisting('Hack squat XYZ', ['e']);
var pe=w.getEffectivePlan();
var hid=(pe.order['e']||[]).filter(function(id){ return /hack squat xyz/i.test(pe.ex[id].name||''); })[0];
ok(hid && pe.ex[hid].cat==='Lower body' && (pe.ex[hid].muscles||[]).indexOf('quad')!==-1,'user-library add carries category + muscles');
w.addToUserLibrary({name:'Temp Move',type:'strength',sets:3,muscles:[]});
ok(w.getExerciseLibrary().some(function(e){ return /temp move/i.test(e.name); }),'temp template present in library');
ok(w.removeFromUserLibrary('Temp Move'),'removeFromUserLibrary returns true');
ok(!w.getActiveUserLibrary().some(function(e){ return /temp move/i.test(e.name); }),'deleted template gone from active library');
ok(w.getUserLibrary().some(function(e){ return /temp move/i.test(e.name) && e.deleted; }),'delete kept as a tombstone (so it syncs)');

// ── _mergeLibraries last-write-wins per name (any-device convergence) ──
var A=[{name:'Foo',cat:'X',updatedAt:100},{name:'Bar',cat:'B',updatedAt:50}];
var B=[{name:'Foo',cat:'Y',updatedAt:200},{name:'Baz',cat:'Z',updatedAt:10}];
var M=w._mergeLibraries(A,B);
ok(M.length===3,'merge unions distinct names (Foo/Bar/Baz) — no device loses additions');
ok(M.filter(function(e){return e.name==='Foo';})[0].cat==='Y','newer Foo (updatedAt 200) wins the conflict');
var C=[{name:'Foo',cat:'Y',updatedAt:300,deleted:true}];
ok(w._mergeLibraries(B,C).filter(function(e){return e.name==='Foo';})[0].deleted===true,'newer delete wins over older add (delete propagates)');

// ── library travels in the sync payload ──
ok(Array.isArray(w.buildBinPayload()['exercise_library_v1']),'exercise_library_v1 is in the sync/backup payload');

// ── v3.11 picker UX: selected item is clearly marked + day pills reflect current assignment ──
var D=w.document;
// srcHist is a default exercise we earlier added onto day b, so it's on a + b
w.openLibrary();                 // builder, library mode
w.selectLibItem(srcHist);
var sel=D.querySelector('#b-lib-list .bld-lib-item.on');
ok(!!sel,'selected library row carries the .on class (clear highlight)');
var onDays=[].slice.call(D.querySelectorAll('#b-days button[data-sel="1"]')).map(function(b){return b.getAttribute('data-dk');});
ok(onDays.indexOf('a')!==-1 && onDays.indexOf('b')!==-1,'day pills pre-light the days the exercise is already on (a + b)');
// a never-scheduled catalog pick lights no day pills
w.selectLibItem('Cable upright row');
var none=[].slice.call(D.querySelectorAll('#b-days button[data-sel="1"]'));
ok(none.length===0,'unscheduled exercise lights no day pills');

console.log('\n'+(fail?('LIBRARY SPOT-CHECK: '+fail+' FAILED'):'LIBRARY SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
