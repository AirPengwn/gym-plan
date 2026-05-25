'use strict';
// Functional smoke test for gym-plan: loads the REAL index.html in jsdom,
// drives the builder mutators, and simulates the save→reload cycle via a
// shared localStorage. Guards the dynamic paths the byte-diff harness can't.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const IDX = require('path').join(__dirname,'..','index.html');
const HTML = fs.readFileSync(IDX, 'utf8');

let failures = 0, passes = 0;
function ok(cond, label){ if(cond){ passes++; console.log('  ok   '+label); } else { failures++; console.log('  FAIL '+label); } }

// Persistent localStorage shared across "reloads".
function makeStore(initial){
  const m = new Map(Object.entries(initial||{}));
  return {
    _m:m,
    getItem(k){ return m.has(k)? m.get(k) : null; },
    setItem(k,v){ m.set(String(k), String(v)); },
    removeItem(k){ m.delete(k); },
    clear(){ m.clear(); },
    key(i){ return Array.from(m.keys())[i] != null ? Array.from(m.keys())[i] : null; },
    get length(){ return m.size; }
  };
}

function loadApp(store){
  const ctxProxy = new Proxy(function(){ return ctxProxy; }, {
    get(){ return ctxProxy; }, set(){ return true; }, apply(){ return ctxProxy; }
  });
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    url: 'https://smoke.test/index.html',
    pretendToBeVisual: true,
    beforeParse(window){
      Object.defineProperty(window,'localStorage',{value:store,configurable:true});
      const sess = makeStore({ gym_test_mode:'1' }); // sandbox: all cloud sync off
      Object.defineProperty(window,'sessionStorage',{value:sess,configurable:true});
      window.fetch = function(){ return Promise.reject(new Error('no-net')); };
      window.devicePixelRatio = 1;
      window.matchMedia = window.matchMedia || function(){ return {matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}; };
      try{ Object.defineProperty(window.location,'reload',{value:function(){ window.__reloaded=(window.__reloaded||0)+1; },configurable:true}); }catch(e){}
      try{ window.location.replace = function(){ window.__reloaded=(window.__reloaded||0)+1; }; }catch(e){}
      window.HTMLCanvasElement.prototype.getContext = function(){ return ctxProxy; };
      window.scrollTo = function(){};
      window.alert = function(){}; window.confirm = function(){ return true; };
    }
  });
  return dom.window;
}

function itemsCount(doc,d){ return doc.querySelectorAll('#items-'+d+' .item').length; }
function dataExSet(doc){ return (doc.documentElement.outerHTML.match(/data-ex="[^"]*"/g)||[]); }
function domIdByDataEx(doc, day, ex){
  var inp = doc.querySelector('#items-'+day+' [data-ex="'+ex+'"]');
  if(!inp) return null;
  var it = inp.closest('.item');
  return it ? it.id : null;
}

// ── T1: default render parity ────────────────────────────────────────
(function(){
  console.log('T1 default render');
  const store = makeStore();
  const w = loadApp(store);
  const exp = {a:10,b:9,c:6,d:8,e:9};
  let allc=true;
  ['a','b','c','d','e'].forEach(function(d){ const n=itemsCount(w.document,d); if(n!==exp[d]){ allc=false; console.log('   day '+d+' got '+n+' exp '+exp[d]); } });
  ok(allc, 'per-day item counts a10/b9/c6/d8/e9');
  ok(dataExSet(w.document).length>=200, 'data-ex attributes present ('+dataExSet(w.document).length+')');
  ['buildExerciseModel','getEffectivePlan','planAddExercise','planEditExercise','planSwapExercise','planReorder','_groupDomIds','_unlinkedSiblingDays','renderDayItems'].forEach(function(fn){
    ok(typeof w[fn]==='function', 'fn '+fn+' exposed');
  });
  ok(!store.getItem('plan_v2'), 'clean install does not persist plan_v2');
  // Step 2: full card-head row toggles done; rest pill must NOT toggle.
  var firstItem=w.document.querySelector('#items-a .item');
  var nameEl=firstItem && firstItem.querySelector('.ex-name');
  if(nameEl){
    nameEl.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    ok(firstItem.classList.contains('done'),'row-tap on .ex-name toggles item done');
    nameEl.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    ok(!firstItem.classList.contains('done'),'row-tap again untoggles');
  } else { ok(false,'found .ex-name to test row-tap'); }
  var timer=firstItem && firstItem.querySelector('.item-timer-btn');
  if(timer){
    var before=firstItem.classList.contains('done');
    timer.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    ok(firstItem.classList.contains('done')===before,'tapping the rest pill does NOT toggle done (contract)');
  }
  // Step 3: a11y
  if(typeof w.applyA11y==='function') w.applyA11y();
  var rep=w.document.querySelector('#items-a .rep-input');
  ok(rep && rep.getAttribute('inputmode')==='decimal','rep-input gets inputmode=decimal');
  var ra=w.document.querySelector('#items-a .reps-actual-input');
  ok(!ra || ra.getAttribute('inputmode')==='decimal','reps-actual-input gets inputmode=decimal');
  var mw=w.document.getElementById('meas-weight-val');
  ok(mw && mw.getAttribute('inputmode')==='decimal','#meas-weight-val inputmode=decimal');
  var cb=w.document.querySelector('#items-a .checkbox');
  ok(cb && cb.getAttribute('role')==='button' && cb.getAttribute('tabindex')==='0' && cb.hasAttribute('aria-pressed'),'checkbox is keyboard-reachable button w/ aria-pressed');
  var dk=w.document.getElementById('dark-toggle');
  ok(dk && dk.getAttribute('aria-label'),'dark-toggle has aria-label');
  ok(w.document.querySelector('style') && /:focus-visible\{/.test(w.document.documentElement.innerHTML),':focus-visible rule present');
  // Step 5: v2 card layout + preserved data bindings + no double-injection
  var sid=domIdByDataEx(w.document,'a','Chest press');
  var sItem=sid && w.document.getElementById(sid);
  ok(sItem && sItem.getAttribute('data-cardv2')==='1','strength card uses v2 layout (data-cardv2)');
  ok(sItem && sItem.querySelector('.v2-sets .rep-single .rep-input[data-ex="Chest press"][data-set="1"]'),'v2 keeps rep-input data-ex/data-set binding');
  ok(sItem && sItem.querySelector('.rep-single input[type="hidden"][id^="unit-"]'),'v2 keeps per-set hidden unit input (getUnitForInput)');
  ok(sItem && sItem.querySelectorAll('.rpe-slider').length===1 && sItem.querySelector('.rpe-slider').getAttribute('data-ex')==='Chest press','exactly one RPE slider (Option 1) bound to exercise');
  ok(sItem && sItem.querySelectorAll('.pain-btn').length===2,'v2 keeps pain buttons (confirmSave/setPain)');
  ok(sItem && sItem.querySelector('.reps-actual-input[data-ex-reps="Chest press"]'),'v2 keeps reps-actual-input binding');
  ok(sItem && sItem.querySelector('.last-time[id="lt-Chest-press"] .last-time-vals'),'v2 keeps last-time element id for loadLastTimes');
  ok(sItem && sItem.querySelector('.notes-input[data-ex="Chest press-notes"]'),'v2 keeps notes-input -notes binding');
  ok(sItem && sItem.querySelectorAll('.item-timer-btn').length===1,'v2 has exactly one rest pill (no injection dupe)');
  // collapsible footer toggles
  var ftog=sItem.querySelector('.v2-foot-toggle'), foot=sItem.querySelector('.v2-foot');
  ok(foot && foot.hasAttribute('hidden'),'footer collapsed by default');
  if(ftog){ ftog.dispatchEvent(new w.MouseEvent('click',{bubbles:true})); ok(!foot.hasAttribute('hidden'),'footer expands on tap'); }
  // notes-only card (Dead bug) also v2
  var nid=domIdByDataEx(w.document,'a','Dead bug');
  var nItem=nid&&w.document.getElementById(nid);
  ok(nItem && nItem.getAttribute('data-cardv2')==='1' && nItem.querySelector('.notes-input[data-ex="Dead bug"]') && !nItem.querySelector('.rep-row'),'notes-only card v2 (no sets, notes binding kept)');

  // Step 6: builder modal 3-phase reshuffle — all field IDs intact, logic unchanged
  ['b-name','b-cat','b-type','b-days','b-sets','b-mins','b-muscles','b-sub','b-loc','b-video','b-badge','b-swap','builder-title','builder-idnote'].forEach(function(fid){
    ok(w.document.querySelectorAll('#'+fid).length===1,'builder field #'+fid+' present exactly once');
  });
  ok(w.document.querySelectorAll('#builder-modal-overlay .bld-sec').length===3,'builder has 3 sections');
  ok(!!w.document.querySelector('#builder-modal-overlay details.bld-more'),'builder has collapsed More options disclosure');
  var moreD=w.document.querySelector('#builder-modal-overlay details.bld-more');
  ok(moreD && !moreD.open,'More options collapsed by default');
  ok(moreD && moreD.querySelector('#b-sub') && moreD.querySelector('#b-loc') && moreD.querySelector('#b-video') && moreD.querySelector('#b-badge'),'sub/loc/video/badge moved into More options');
  var threwB=false; try{ w.openBuilder(null); }catch(e){ threwB=true; }
  ok(!threwB,'openBuilder(add) does not throw after reshuffle');
  ok(w.document.getElementById('b-days').children.length>0 || /data-dk=/.test(w.document.getElementById('b-days').innerHTML),'openBuilder populates day chips into #b-days');
  ok(/data-mk=/.test(w.document.getElementById('b-muscles').innerHTML),'openBuilder populates muscle chips into #b-muscles');
  try{ w.closeBuilder(); }catch(e){}

  // Step 4: notice tray (renderer-only; legacy banners are hidden state-holders)
  var tray=w.document.getElementById('notice-tray');
  ok(!!tray,'#notice-tray exists');
  ok(tray.style.display==='none' || tray.innerHTML==='','tray hidden when no notices');
  ['backup-banner','merge-banner','deload-banner'].forEach(function(id){
    ok(w.document.getElementById(id) && w.document.getElementById(id).classList.contains('legacy-banner'),id+' kept as hidden legacy state-holder');
  });
  // simulate the deload + backup triggers firing
  w.document.getElementById('deload-banner').style.display='flex';
  w.document.getElementById('backup-banner').style.display='flex';
  w.renderNoticeTray();
  ok(tray.style.display==='block','tray shows when notices active');
  ok((tray.querySelectorAll('.tray-row')||[]).length===2,'2 rows rendered (deload+backup)');
  ok(/Clear all/.test(tray.innerHTML),'Clear all shown when >=2 notices');
  ok(tray.querySelector('.tray-row .tray-ic.red') && tray.querySelector('.tray-row .tray-ic.warn'),'severity-tinted icons (red+warn)');
  // dismissing via the existing handler removes the row + re-renders
  w.dismissBackupBanner(); w.renderNoticeTray();
  ok((tray.querySelectorAll('.tray-row')||[]).length===1,'dismissBackupBanner removes its row (handler untouched)');
  ok(!/Clear all/.test(tray.innerHTML),'Clear all hidden with 1 notice');
  w.noticeClearAll(); w.renderNoticeTray();
  ok(tray.style.display==='none','noticeClearAll empties the tray');
  // test-mode strip stays a separate element, not absorbed into the tray
  ok(!!w.document.getElementById('test-banner'),'#test-banner (test strip) still separate');
  // Follow-up 1 (corrected): segmented day-selector has ONLY 5 pills (D1–D5);
  // Progress lives in the header cluster.
  var dsel=w.document.querySelector('.day-selector');
  var dbtns=w.document.querySelectorAll('.day-selector .day-btn');
  ok(dsel && dbtns.length===5,'day-selector is one row of 5 segments (no Progress pill)');
  ok(/\.day-selector\{display:flex/.test(w.document.documentElement.innerHTML),'day-selector is flex (segmented), not grid');
  ok(!w.document.querySelector('.day-selector .progress-tab'),'no Progress pill inside the segmented control');
  ok(dbtns[0].textContent.trim()==='D1' && dbtns[4].textContent.trim()==='D5','D1..D5 labels');
  ok(/sw\('b',this\)/.test(dbtns[1].getAttribute('onclick')||''),'sw() handler still bound per pill (D2)');
  dbtns[1].dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  ok(w.document.getElementById('p-b').classList.contains('show'),'tapping D2 switches to Day 2 panel');
  // v3.30: navigation moved to a fixed bottom tab bar (4 tabs). 📊/📋 relocated
  // there (same ids + handlers preserved). v4.3: Sync + Settings folded into one
  // ⋯ More tab → 4 tabs. Old openSync()/openSettings() still work as jump entry points.
  var bar=w.document.querySelector('.tabbar');
  ok(!!bar && bar.querySelectorAll('.tab').length===4,'bottom tab bar has 4 tabs (Workout/Progress/Plan/More)');
  ok(!w.document.getElementById('nav-sync') && !w.document.getElementById('nav-settings'),'separate Sync + Settings tabs removed (folded into More)');
  ok(!!w.document.getElementById('nav-more') && /openMore\(\)/.test(w.document.getElementById('nav-more').getAttribute('onclick')||''),'⋯ More tab calls openMore()');
  var hp=w.document.getElementById('hdr-prog-btn');
  ok(!!hp && !!hp.closest('.tabbar'),'📊 Progress lives in the bottom bar');
  ok(hp.classList.contains('progress-tab') && /sw\('prog',this\)/.test(hp.getAttribute('onclick')||''),'📊 keeps progress-tab class + sw("prog") handler (returnToManageAfterPlan still works)');
  ok(hp.getAttribute('aria-label')==='Progress and stats','📊 aria-label="Progress and stats" preserved');
  var hpl=w.document.getElementById('hdr-plan-btn');
  ok(!!hpl && !!hpl.closest('.tabbar') && /openManage\(\)/.test(hpl.getAttribute('onclick')||''),'📋 Plan in the bottom bar, calls openManage()');
  ok(!!w.document.getElementById('nav-workout') && /navWorkout\(\)/.test(w.document.getElementById('nav-workout').getAttribute('onclick')||''),'🏋️ Workout tab calls navWorkout()');
  ok(typeof w.openMore==='function' && typeof w.openSync==='function' && typeof w.openSettings==='function' && typeof w.navWorkout==='function','nav functions defined (openMore + legacy openSync/openSettings entry points)');
  ok(!Array.from(w.document.querySelectorAll('.prog-tab-btn')).some(function(b){return /manage/.test(b.getAttribute('onclick')||'');}),'Manage tab button removed from prog-tab-row');
  ok(!w.document.getElementById('hdr-ovf-btn') && !w.document.getElementById('hdr-menu'),'old ⋯ header overflow menu gone');
  var dk2=w.document.getElementById('dark-toggle');
  ok(!!dk2 && !dk2.closest('.tabbar'),'🌙 dark toggle present, not in the tab bar');
  ok(!!dk2 && !!dk2.closest('#more-appearance'),'v4.11 · dark toggle moved to More → Appearance');
  w.toggleDarkMode(); var _st=w.document.getElementById('dark-mode-state');
  ok(_st && _st.textContent==='On','v4.11 · dark toggle reflects On state'); w.toggleDarkMode();
  ok(_st && _st.textContent==='Off','v4.11 · dark toggle reflects Off state');
  // v4.3: the single More panel hosts Sync + Backup + Appearance + App, all reachable.
  var mp=w.document.getElementById('p-more');
  ok(!!mp,'More panel (#p-more) exists');
  ok(!w.document.getElementById('p-sync') && !w.document.getElementById('p-settings'),'old #p-sync / #p-settings panels removed');
  ok(w.document.querySelectorAll('#test-toggle').length===1 && !!w.document.getElementById('test-toggle').closest('#p-more'),'#test-toggle preserved (single) and now in More (_testUpdateUI still works)');
  ok(!!mp.querySelector('[onclick="reloadPage()"]'),'Update handler lives in More (App group)');
  ok(!!mp.querySelector('[onclick="showExportImport()"]'),'Backup & restore launcher lives in More');
  ok(!!mp.querySelector('#more-sync') && !!mp.querySelector('#more-app'),'More has Sync + App group anchors (for openSync/openSettings jumps)');
  // openMore renders the cloud-sync controls into the Sync group + highlights the tab
  w.openMore();
  ok(mp.classList.contains('show') && mp.style.display!=='none' && w.document.getElementById('nav-more').classList.contains('active'),'⋯ More opens its panel (not blank) + highlights the tab');
  ok(!!w.document.getElementById('plan-sync-switch') && !!mp.querySelector('.plan-sync-box [onclick="pushPlanToCloud()"]'),'More renders the cloud-sync controls (switch + push)');
  ok(!!mp.querySelector('[onclick="pullFromCloud()"]'),'More has Pull from cloud');
  // legacy entry points still open More
  w.navWorkout(); w.openSync();
  ok(mp.classList.contains('show'),'openSync() (Plan jump / backup nag) still opens More');
  w.navWorkout(); w.openSettings();
  ok(mp.classList.contains('show'),'openSettings() still opens More');
  // navigation actually switches panels + highlights the right tab
  hp.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  ok(w.document.getElementById('p-prog').classList.contains('show'),'tapping 📊 switches to Progress panel');
  ok(hp.classList.contains('active'),'📊 tab highlights when Progress is open');
  // regression guard: syncDayPanels() must NOT leave an inline display:none on
  // p-more (it isn't a day-keyed panel) — that bug class once blanked p-settings.
  w.openMore();
  ok(mp.style.display!=='none','More panel is not inline-hidden by syncDayPanels (renders, not blank)');
  w.navWorkout();
  ok(w.document.getElementById('nav-workout').classList.contains('active') && !w.document.getElementById('p-prog').classList.contains('show'),'🏋️ Workout returns to a day + highlights its tab');
  // v3.32: the D1…Dn day chips show ONLY on Workout
  ok(w.document.getElementById('day-selector').style.display!=='none','day-selector visible on the Workout screen');
  w.openMore();
  ok(w.document.getElementById('day-selector').style.display==='none','day-selector hidden on the More screen');
  ok(w.document.getElementById('swh-l').hasAttribute('hidden') && w.document.getElementById('swh-r').hasAttribute('hidden'),'swipe hints hidden off the Workout screen');
  w.openManage();
  ok(w.document.getElementById('day-selector').style.display==='none','day-selector hidden on the Plan screen');
  w.navWorkout();
  // v3.38 hardening: sw() with a stale/unknown day key is a safe no-op (no throw,
  // doesn't blank the screen) — the workout panel stays shown.
  var _wkShown=w.document.getElementById('p-'+(w._lastWorkoutDay||'a')).classList.contains('show');
  var _threwSw=false; try{ w.sw('zzz-nonexistent', null); }catch(e){ _threwSw=true; }
  ok(!_threwSw,'sw() with an unknown day key does not throw');
  ok(w.document.getElementById('p-'+(w._lastWorkoutDay||'a')).classList.contains('show')===_wkShown && _wkShown,'sw() with a bad key leaves the current workout panel shown (no blank screen)');
  // Follow-up 2: cardio "Watch demo" → overflow
  if(typeof w.enhanceCardioCards==='function') w.enhanceCardioCards();
  var wu=w.document.querySelector('#items-a .item .cardio-fields');
  var cItem=wu && wu.closest('.item');
  ok(cItem && cItem.getAttribute('data-ovfx')==='1','cardio card enhanced (data-ovfx)');
  ok(cItem && !cItem.querySelector('.item-top .ex-link') && cItem.querySelector('.v2-ovf .ex-link'),'cardio demo link moved out of head into .v2-ovf');
  ok(cItem && cItem.querySelector('.item-top .v2-ovf-btn'),'cardio head has ⋯ overflow button');
  var cbtn=cItem.querySelector('.item-top .v2-ovf-btn'), cov=cItem.querySelector('.v2-ovf');
  ok(cov && cov.hasAttribute('hidden'),'cardio overflow hidden by default');
  cbtn.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  ok(cov && !cov.hasAttribute('hidden'),'cardio ⋯ opens overflow (cardToggle reused)');
  ok(!w.document.querySelector('.v2-card .cardio-fields'),'cardio body untouched (still old layout, not v2)');
  // Follow-up 4: footer contrast rules present
  var sheets=w.document.documentElement.innerHTML;
  ok(/\.v2-foot \.rpe-top-label,\.v2-foot \.rpe-ends,\.v2-foot \.rpe-top-val\{color:var\(--muted\)\}/.test(sheets),'footer label contrast rule present');
  ok(/body\.dark \.v2-foot \.last-time\{background:#2A2850\}/.test(sheets),'dark footer last-time bg override present');
  w.close();
})();

// ── T2: add exercise on two days (linked) ────────────────────────────
(function(){
  console.log('T2 add multi-day exercise');
  const store = makeStore();
  let w = loadApp(store);
  w.planAddExercise(['a','d'], {name:'Smoke Press', type:'strength', sub:'3 x 10', loc:'rack', video:'', badge:null, sets:3, cat:'Upper body', mins:5, muscles:['chest']});
  ok(!!store.getItem('plan_v2'), 'plan_v2 persisted after add');
  w.close();
  w = loadApp(store); // simulate reload
  const a = domIdByDataEx(w.document,'a','Smoke Press');
  const d = domIdByDataEx(w.document,'d','Smoke Press');
  ok(!!a && !!d, 'added exercise present on Day 1 and Day 4');
  ok(itemsCount(w.document,'a')===11 && itemsCount(w.document,'d')===9, 'counts incremented (a 11, d 9)');
  const plan = w.getEffectivePlan();
  const grp = w._groupDomIds(plan, plan.ex[a]);
  ok(grp.length===2, 'two linked instances share histEx ('+grp.length+')');
  ok(plan.ex[a].linkId && plan.ex[a].linkId===plan.ex[d].linkId, 'shared linkId across days');
  ok(plan.ex[a].histEx==='Smoke Press' && plan.ex[d].histEx==='Smoke Press', 'shared history key');
  w.close();
})();

// ── T3: rename a built-in keeps history key frozen ───────────────────
(function(){
  console.log('T3 rename keeps history key + logs');
  const store = makeStore({ 'gymlog_a': JSON.stringify([{date:'Mon, May 5, 2026 at 5:00 PM', ts:Date.parse('2026-05-05T17:00'), label:'Day 1 — Upper A', entries:[{ex:'Chest press', note:'Set 1: 50 lbs'}]}]) });
  let w = loadApp(store);
  const id = domIdByDataEx(w.document,'a','Chest press');
  ok(!!id, 'found built-in Chest press card');
  w.planEditExercise(id, {name:'Chest Press RENAMED', type:'strength', sub:'3 x 12', loc:'x', video:'', badge:null, sets:3, cat:'Upper body', mins:5, muscles:['chest']}, ['a']);
  w.close();
  w = loadApp(store);
  const card = w.document.getElementById(id) || (function(){ var i=w.document.querySelector('#items-a [data-ex="Chest press"]'); return i&&i.closest('.item'); })();
  ok(!!card, 'renamed card still on Day 1');
  ok(/Chest Press RENAMED/.test(card.querySelector('.ex-name').textContent), 'display name updated');
  ok(!!w.document.querySelector('#items-a [data-ex="Chest press"]'), 'history key data-ex="Chest press" FROZEN (unchanged)');
  const saved = w.getSaved('a');
  ok(saved.length===1 && saved[0].entries[0].ex==='Chest press', 'existing logged history intact + still keyed to Chest press');
  // Step 7: session-date affordance (dotted date opens picker; ✏️ gone; fixes
  // the latent missing-#pdate / quote bug so editSessionDate actually works)
  if(typeof w.renderProgress==='function') w.renderProgress();
  ok(!/edit-date-btn/.test(w.document.body.innerHTML),'✏️ edit-date button removed');
  var pd=w.document.getElementById('pdate-a-0');
  ok(!!pd && pd.classList.contains('ps-date'),'date wrapped in tappable .ps-date#pdate-a-0');
  ok(pd && /editSessionDate\('a',0\)/.test(pd.getAttribute('onclick')||''),'tapping the date calls editSessionDate (valid quoting)');
  ok(pd && pd.querySelector('.ps-cv'),'chevron present on the date');
  try{ w.editSessionDate('a',0); }catch(e){}
  ok(w.document.querySelector('#pdate-a-0 .edit-date-input, #pdate-a-0.edit-date-input') || /edit-date-input/.test((w.document.getElementById('pdate-a-0')||{}).innerHTML||''),'editSessionDate now opens the datetime input (latent bug fixed)');
  // v4.2: rest timer is now a floating pill ABOVE the tab bar (z-index 1001 > the
  // bar's 1000, lifted ~66px so it's never clipped) — fully rounded, not a bottom bar.
  var src=w.document.documentElement.innerHTML;
  ok(/\.rest-timer-bar\{[^}]*z-index:1001/.test(src),'rest-timer sits above the tab bar (z-index 1001)');
  ok(/\.rest-timer-bar\{[^}]*bottom:calc\(env\(safe-area-inset-bottom\) \+ 66px \+ var\(--kb-offset,0px\)\)/.test(src),'rest-timer lifted above the tab bar (not clipped)');
  ok(/\.rest-timer-bar\{[^}]*border-radius:14px/.test(src),'rest-timer is a fully-rounded floating pill');
  // v4.4: hidden state must fully clear the viewport — anchored 66px up, so a small
  // translate (the old 220%) left it peeking behind the tab bar.
  ok(/\.rest-timer-bar\{[^}]*translateY\(calc\(100% \+ 74px \+ env\(safe-area-inset-bottom\)\)\)/.test(src),'rest-timer hidden state fully off-screen (no peek behind the tab bar)');
  // v4.1: checkbox is a 44×44 tap target with the visual circle drawn as ::before (markup unchanged).
  // v4.9.2: 38px groove ring (::before) + 32px disk (::after); checked disk = radial sphere.
  ok(/\.checkbox\{[^}]*width:44px;height:44px/.test(src),'v4.1 · checkbox is a 44×44 tap target');
  ok(/\.checkbox::before\{[^}]*width:38px;height:38px[^}]*border-radius:50%/.test(src),'v4.9.2 · 38px groove ring drawn as ::before');
  ok(/\.checkbox::after\{[^}]*width:32px;height:32px[^}]*border-radius:50%/.test(src),'v4.9.2 · 32px disk drawn as ::after');
  ok(w.document.querySelectorAll('#items-a .checkbox').length>0,'v4.1 · checkbox markup intact (still .checkbox in cards)');
  // v4.10 (Step 4B): floating Complete pill + keyboard-aware floating chrome
  ok(!!w.document.getElementById('complete-bar'),'v4.10 · complete-bar element present');
  ok(/\.complete-bar\{[^}]*z-index:1002/.test(src),'v4.10 · complete-bar stacks above the timer (z-index 1002 > 1001)');
  ok(/\.complete-bar\.show\{transform:translateX\(-50%\) translateY\(0\)\}/.test(src),'v4.10 · complete-bar reveals via .show');
  ok(/body\.timer-active \.complete-bar\{[^}]*118px/.test(src),'v4.10 · complete-bar lifts above the timer when both show');
  ok(/\.rest-timer-bar\{[^}]*var\(--kb-offset,0px\)/.test(src) && /\.complete-bar\{[^}]*var\(--kb-offset,0px\)/.test(src),'v4.10 · both floating bars ride above the keyboard via --kb-offset');
  ok(typeof w.updateCompleteBar==='function' && typeof w.hideCompleteBar==='function' && typeof w.triggerCompleteFromBar==='function','v4.10 · complete-bar JS present');
  // >=80% of a day done → pill shows; reset/under-threshold → hidden
  (function(){
    var pa=w.document.getElementById('p-a');
    pa.classList.add('show');
    pa.querySelectorAll('.item.done').forEach(function(it){ it.classList.remove('done'); });
    var items=pa.querySelectorAll('.item'), need=Math.ceil(items.length*0.8), n=0;
    items.forEach(function(it){ if(n<need){ it.classList.add('done'); n++; } });
    w.counts.a=items.length; w.updateCompleteBar('a');
    ok(w.document.getElementById('complete-bar').classList.contains('show'),'v4.10 · pill shows at >=80% done');
    pa.querySelectorAll('.item.done').forEach(function(it){ it.classList.remove('done'); });
    w.updateCompleteBar('a');
    ok(!w.document.getElementById('complete-bar').classList.contains('show'),'v4.10 · pill hidden when under threshold');
  })();
  // v4.8: cardio cards got the same field/button sizing as strength cards
  ok(/\.cardio-input\{[^}]*height:40px/.test(src),'v4.8 · cardio inputs match the 40px field height');
  ok(/\.cardio-machine-btn\{[^}]*min-height:38px/.test(src),'v4.8 · cardio machine toggle buttons have a real tap height');
  // start/stop toggles the .show class
  if(typeof w.startRestTimer==='function'){
    w.startRestTimer(90);
    ok(w.document.getElementById('rest-timer-bar').classList.contains('show'),'startRestTimer shows the pill');
    w.stopRestTimer();
    ok(!w.document.getElementById('rest-timer-bar').classList.contains('show'),'stopRestTimer hides the pill');
  }
  w.close();
})();

// ── T4: heal legacy duplicate (Cable rotation a8 + c4) ───────────────
(function(){
  console.log('T4 heal duplicate copies on edit');
  const store = makeStore();
  let w = loadApp(store);
  const aId = domIdByDataEx(w.document,'a','Cable rotation');
  const cId0 = domIdByDataEx(w.document,'c','Cable rotation');
  ok(!!aId && !!cId0, 'Cable rotation exists on Day 1 and Day 3 (built-in duplicate)');
  const sib = w._unlinkedSiblingDays(aId);
  ok(sib.indexOf('c')!==-1, 'unlinked sibling day "c" detected for the note');
  w.planEditExercise(aId, {name:'Cable Rotation', type:'strength', sub:'3 x 12', loc:'cable', video:'', badge:null, sets:3, cat:'Core', mins:5, muscles:['core-front']}, ['a','c']);
  w.close();
  w = loadApp(store);
  const aCards = w.document.querySelectorAll('#items-a [data-ex="Cable rotation"][data-set="1"]').length;
  const cCards = w.document.querySelectorAll('#items-c [data-ex="Cable rotation"][data-set="1"]').length;
  ok(aCards===1 && cCards===1, 'exactly ONE Cable rotation per day — no duplicate created (a='+aCards+' c='+cCards+')');
  const plan = w.getEffectivePlan();
  const aId2 = domIdByDataEx(w.document,'a','Cable rotation');
  const grp = w._groupDomIds(plan, plan.ex[aId2]);
  const link = plan.ex[grp[0]].linkId;
  ok(grp.length===2 && link && grp.every(function(g){return plan.ex[g].linkId===link;}), 'both copies adopted into one linkId');
  w.close();
})();

// ── T5: untick a day removes that copy, history stays ────────────────
(function(){
  console.log('T5 untick a day removes copy only');
  const store = makeStore();
  let w = loadApp(store);
  const aId = domIdByDataEx(w.document,'a','Cable rotation');
  w.planEditExercise(aId, {name:'Cable Rotation', type:'strength', sub:'3 x 12', loc:'x', video:'', badge:null, sets:3, cat:'Core', mins:5, muscles:[]}, ['a']); // only day a
  w.close();
  w = loadApp(store);
  ok(!!domIdByDataEx(w.document,'a','Cable rotation'), 'kept on Day 1');
  ok(!domIdByDataEx(w.document,'c','Cable rotation'), 'removed from Day 3');
  w.close();
})();

// ── Patch 2 ──────────────────────────────────────────────────────────
(function(){
  console.log('Patch2 Step1 progress badge');
  // seed Chest press history: last best = 90
  const store = makeStore({ 'gymlog_a': JSON.stringify([{date:'Mon, May 5, 2026 at 5:00 PM', ts:Date.parse('2026-05-05T17:00'), label:'Day 1 — Upper A', entries:[{ex:'Chest press', note:'Set 1: 80 lbs | Set 2: 90 lbs'}]}]) });
  const w = loadApp(store);
  const id = domIdByDataEx(w.document,'a','Chest press');
  const it = w.document.getElementById(id);
  const nudge = it && it.querySelector('.v2-nudge[data-hist="Chest press"]');
  ok(!!nudge,'progress badge element present in strength head');
  // planned (ghost == last) → "= holding"
  w.updateProgressBadges(it);
  ok(/= holding 90/.test(nudge.textContent) && nudge.className.indexOf('even')>=0,'planned==last → "= holding" ('+nudge.textContent+')');
  // type higher → ↑ +N
  var w1=it.querySelector('.rep-input[data-set="1"]'); w1.value='100'; w1.dispatchEvent(new w.Event('input',{bubbles:true}));
  ok(/↑ \+10/.test(nudge.textContent) && nudge.className.indexOf('up')>=0,'planned>last → ↑ +10 green ('+nudge.textContent+')');
  // type lower → ↓ −N
  w1.value='80'; w1.dispatchEvent(new w.Event('input',{bubbles:true}));
  ok(/↓ -10/.test(nudge.textContent) && nudge.className.indexOf('down')>=0,'planned<last → ↓ -10 warn ('+nudge.textContent+')');
  // no-history exercise → no pill
  const id2 = domIdByDataEx(w.document,'a','Lat pulldown');
  const n2 = w.document.getElementById(id2).querySelector('.v2-nudge');
  w.updateProgressBadges(w.document.getElementById(id2));
  ok(n2 && !n2.classList.contains('show'),'no previous session → no pill');
  w.close();
})();
(function(){
  console.log('Patch2 Step2 swipe affordance');
  const store = makeStore();
  let w = loadApp(store);
  ok(!!w.document.getElementById('swh-l') && !!w.document.getElementById('swh-r') && !!w.document.getElementById('swipe-tip'),'swipe hint + tip elements present');
  // go to Day 2 → left peek "Day 1", right peek "Day 3"
  var bBtn=null; w.document.querySelectorAll('.day-btn').forEach(function(b){ if(/sw\('b',this\)/.test(b.getAttribute('onclick')||'')) bBtn=b; });
  w.sw('b',bBtn);
  ok(w.document.getElementById('swh-l').textContent==='Day 1' && !w.document.getElementById('swh-l').hasAttribute('hidden'),'Day 2: left peek = Day 1');
  ok(w.document.getElementById('swh-r').textContent==='Day 3','Day 2: right peek = Day 3');
  ok(w.document.querySelector('.swipe-hint').getAttribute('aria-hidden')==='true','edge peeks are aria-hidden / non-interactive');
  // one-time tip (load fires it via setTimeout(0); call explicitly here)
  w.maybeShowSwipeTip();
  ok(store.getItem('swipe_hint_shown')==='1','swipe_hint_shown flag set after first show');
  ok(w.document.getElementById('swipe-tip').classList.contains('show'),'tip shows on first launch');
  w.close();
  w = loadApp(store); // reload with flag set
  w.maybeShowSwipeTip();
  ok(!w.document.getElementById('swipe-tip').classList.contains('show'),'tip does NOT reappear once flag is set');
  w.close();
})();
(function(){
  console.log('Patch2 Step3 stretch links → overflow');
  const store = makeStore();
  const w = loadApp(store);
  const sid = domIdByDataEx(w.document,'a','Stretch D1');
  const sItem = sid && w.document.getElementById(sid);
  ok(!!sItem,'Day 1 stretch card found');
  ok(sItem && !sItem.querySelector('.item-top .ex-link-stretch'),'no inline stretch pills in the head');
  var ov = sItem && sItem.querySelector('.v2-ovf');
  var sl = ov ? ov.querySelectorAll('.ex-link-stretch') : [];
  ok(sl.length===3,'3 stretch links live in the ⋯ overflow ('+sl.length+')');
  ok(sl.length && Array.prototype.every.call(sl,function(a){return a.getAttribute('target')==='_blank' && /youtube\.com/.test(a.getAttribute('href')||'');}),'each opens its href in a new tab (urls unchanged)');
  ok(sItem.querySelector('.item-top .v2-ovf-btn'),'stretch card head has ⋯ button');
  w.close();
})();

// ── Patch 3: input dark-mode + ghost + placeholder ───────────────────
(function(){
  console.log('Patch3 input contrast + ghost');
  const store = makeStore({ 'gymlog_a': JSON.stringify([{date:'Mon, May 5, 2026 at 5:00 PM', ts:Date.parse('2026-05-05T17:00'), label:'Day 1 — Upper A', entries:[{ex:'Chest press', note:'Set 1: 90 lbs | Set 2: 90 lbs'}]}]) });
  const w = loadApp(store);
  // 1 · dark-mode CSS for the three input families
  var css=w.document.documentElement.innerHTML;
  ok(/body\.dark \.rep-input,body\.dark \.cardio-input,body\.dark \.notes-input\{background:#1F1D38;color:var\(--text\);border-color:var\(--border\)\}/.test(css),'body.dark dark-bg rule for .rep-input/.cardio-input/.notes-input');
  // 2 · placeholders use var(--muted), no raw hex
  ok(/\.rep-input::placeholder\{color:var\(--muted\)/.test(css),'.rep-input::placeholder uses var(--muted)');
  ok(/\.notes-input::placeholder\{color:var\(--muted\)/.test(css),'.notes-input::placeholder uses var(--muted)');
  ok(/\.cardio-input::placeholder\{color:var\(--muted\)/.test(css),'.cardio-input::placeholder uses var(--muted)');
  ok(!/\.rep-input::placeholder\{color:#C8C6BD/.test(css) && !/\.notes-input::placeholder\{color:#C8C6BD/.test(css) && !/\.cardio-input::placeholder\{color:#C8C6BD/.test(css),'old raw-hex placeholder rules removed');
  // 3 · --ghost token defined for both themes. v4.15 (nit 5): italic stays the cue;
  //     color bumped to a legible muted tone (was the low-contrast primary purple).
  ok(/--ghost:\s*#6E6C66/.test(css) && /--ghost:\s*#A7A2CE/.test(css),'--ghost token: #6E6C66 light / #A7A2CE dark');
  // 4 · loadLastTimes uses var(--ghost), not raw hex
  ok(!/inp\.style\.color\s*=\s*'#E07B3F'/.test(css) && !/inp\.style\.color\s*=\s*'#7F77DD'/.test(css),'ghost inline color no longer raw hex (uses var(--ghost))');
  ok((css.match(/inp\.style\.color\s*=\s*'var\(--ghost\)'/g)||[]).length>=6,'all 6 ghost inline assignments now use var(--ghost)');
  // 5 · functional: loadLastTimes paints ghost on .rep-input as inline var(--ghost)
  w.loadLastTimes();
  var rep=w.document.querySelector('#items-a .rep-input[data-ex="Chest press"][data-set="1"]');
  ok(rep && rep.style.color==='var(--ghost)' && rep.style.fontStyle==='italic','rep-input ghost inline color = var(--ghost), italic');
  ok(rep.value==='90 lbs' || /90/.test(rep.value),'rep-input pre-filled with last value');
  // 6 · §1 step 3 — typing commits black/light (oninput clears the inline ghost style)
  rep.value='100'; rep.dispatchEvent(new w.Event('input',{bubbles:true}));
  ok(rep.style.color==='' && rep.style.fontStyle==='','typing clears ghost style (commits as normal text)');
  // 7 · §1 step 8/9 — toggle dark; ghost re-renders via the same token
  w.toggleDarkMode();
  w.loadLastTimes();
  var rep2=w.document.querySelector('#items-a .rep-input[data-ex="Chest press"][data-set="2"]');
  ok(rep2.style.color==='var(--ghost)','ghost still uses var(--ghost) after dark toggle (token swaps to primary-2 via CSS)');
  w.toggleDarkMode();
  w.close();
})();

console.log('\n'+(failures? ('FUNC SMOKE FAIL — '+failures+' failed, '+passes+' passed')
                            : ('FUNC SMOKE PASS — '+passes+' checks')));
process.exit(failures?1:0);
