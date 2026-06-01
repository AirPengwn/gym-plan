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
  // C1/C2 (v5.2): per-set unit toggle retired — unit is now the global units_v1.
  ok(sItem && !sItem.querySelector('.unit-toggle') && w.getUnitForInput(sItem.querySelector('.rep-input'))==='lbs','v2 has no per-set unit toggle; getUnitForInput reads the global unit');
  ok(/Weight · lb/.test(sItem.querySelector('.v2-sets-head').textContent),'v2 column header shows the unit (Weight · lb)');
  ok(sItem && sItem.querySelector('.v2-foot .ex-loc') && sItem.querySelector('.v2-foot .ex-link'),'C1 · location + demo folded into the RPE/notes footer');
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
  // v5.14 (T8): tray is now collapsed by default — visibility is on the bell.
  var bell=w.document.getElementById('notice-bell');
  ok(bell && !bell.hidden,'v5.14 T8 · notice bell shown when notices active');
  ok(bell && bell.getAttribute('data-unread')==='2','v5.14 T8 · bell carries unread count');
  // toggling opens the tray
  w.toggleNoticeTray();
  ok(tray.style.display==='block','v5.14 T8 · toggleNoticeTray opens the tray');
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
  // Follow-up 4 + v4.16 (nits 7,9): RPE collapsed to one pill in the footer;
  // last-time promoted to always-on (above the sets), dark override on .v2-card.
  var sheets=w.document.documentElement.innerHTML;
  ok(/\.v2-foot \.rpe-top-val\{color:var\(--muted\)\}/.test(sheets),'footer RPE-pill contrast rule present');
  // S1 (v5.0): #2A2850 in body.dark rules tokenized to var(--primary-tint) (identical value)
  ok(/body\.dark \.v2-card \.last-time\{background:var\(--primary-tint\)\}/.test(sheets),'dark always-on last-time bg override present');
  // v4.16: footer toggle no longer leads with "Last time"; last-time is outside .v2-foot
  ok(!/Last time, RPE &amp; notes/.test(sheets),'nit 9 · footer toggle relabeled (no "Last time, …")');
  var _v2c=w.document.querySelector('.v2-card .fields-wrap > .last-time');
  ok(!!_v2c,'nit 9 · last-time is always-on (direct child of fields-wrap, not in .v2-foot)');
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
  // type lower → ↓ −N. (v5.1/L3: boot now runs loadLastTimes, which ghost-prefills
  // the OTHER sets with last values; the nudge plans off max(all sets), so clear
  // the siblings to isolate Set 1 as the planned weight.)
  it.querySelectorAll('.rep-input').forEach(function(i){ if(i!==w1) i.value=''; });
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

// ── v5.10 · Lifts: Est. 1RM display fix + strength-standard chip ──
(function(){
  const store=makeStore({ 'gymlog_a': JSON.stringify([{label:'D1',date:'Mon, May 25, 2026 at 6:00 PM',ts:2,entries:[{ex:'Barbell bench press',note:'Set 1: 225 lbs x5reps'}]}]),
    'body_measurements': JSON.stringify([{type:'weight',date:'2026-05-25',value:200,unit:'lbs',ts:1}]) });
  const w=loadApp(store);
  try{ w.renderExerciseList(); }catch(e){}
  var btn=[].slice.call(w.document.querySelectorAll('#prog-panel-exercises .ex-list-btn')).filter(function(b){return /barbell bench press/i.test(b.textContent);})[0];
  if(btn) btn.click();
  var chips=[].slice.call(w.document.querySelectorAll('#prog-panel-exercises .ex-stat-chip')).map(function(c){return c.textContent;}).join(' | ');
  ok(/Est\. 1RM: 2\d\d lbs/.test(chips),'v5.10 · Est. 1RM shows the real value (bug fix: was ~1) ('+chips+')');
  ok(/× BW · (Novice|Intermediate|Advanced|Elite)/.test(chips),'v5.10 · strength-standard chip present for a barbell lift');
  w.close();
})();

// ── v5.12 · weekly volume metric toggle (weight ↔ tonnage) ──
(function(){
  var now=Date.now();
  const store=makeStore({ 'gymlog_a': JSON.stringify([
    {label:'D1',date:'recent',ts:now,entries:[{ex:'Barbell bench press',note:'Set 1: 200 lbs x5reps'}]}
  ]) });
  const w=loadApp(store);
  // default mode = weight (legacy)
  ok(w._volMode()==='weight','v5.12 · default volume mode is weight');
  // weight mode sums top-set weights (200); tonnage = 200*5 = 1000
  var sess=JSON.parse(store.getItem('gymlog_a'))[0];
  ok(w._sessionVolume(sess,'weight')===200,'v5.12 · weight mode sums set weight ('+w._sessionVolume(sess,'weight')+')');
  ok(w._sessionVolume(sess,'tonnage')===1000,'v5.12 · tonnage mode = weight×reps ('+w._sessionVolume(sess,'tonnage')+')');
  // toggling persists and changes _weeklyVolumeNow
  var wnWeight=w._weeklyVolumeNow().curr;
  w.setVolMode('tonnage');
  ok(w._volMode()==='tonnage','v5.12 · setVolMode persists tonnage');
  var wnTon=w._weeklyVolumeNow().curr;
  ok(wnTon>wnWeight,'v5.12 · tonnage weekly total exceeds weight-only ('+wnTon+' > '+wnWeight+')');
  // toggle renders in the Trends tab
  try{ w.switchProgTab && w.switchProgTab('stats'); w.renderStats(); }catch(e){}
  var seg=w.document.querySelector('.vol-seg');
  ok(seg && seg.querySelectorAll('.vol-seg-btn').length===2,'v5.12 · two-button volume toggle renders in Trends');
  w.close();
})();

// ── v5.14 · T11 post-save summary + T12 plan editor tightening ──
(function(){
  const w=loadApp(makeStore({}));
  // T11 · showSessionSummary defined + mounts a card
  ok(typeof w.showSessionSummary==='function','v5.14 T11 · showSessionSummary defined');
  var sessObj={label:'D1',date:'',ts:Date.now(),entries:[{ex:'Lat pulldown',note:'Set 1: 120 lbs x12reps | Set 2: 120 lbs x12reps'}]};
  // Seed gymlog so getSaved works.
  w.localStorage.setItem('gymlog_a', JSON.stringify([sessObj]));
  w.showSessionSummary('a','Upper A',sessObj,0);
  var card=w.document.getElementById('sess-summary-card');
  ok(!!card,'v5.14 T11 · summary card mounts');
  ok(card && /saved/i.test(card.textContent||''),'v5.14 T11 · card header reads "{Day} saved"');
  ok(card && /lb moved/.test(card.textContent||''),'v5.14 T11 · falls back to volume when no PRs');
  // PR-count variant
  w.showSessionSummary('a','Upper A',sessObj,2);
  var card2=w.document.getElementById('sess-summary-card');
  ok(card2 && /2.*new PRs/.test(card2.textContent||''),'v5.14 T11 · PR count shown when prCount>0 ('+(card2?card2.textContent:'none')+')');
  if(card2) card2.remove();
  // T12 · plan editor changes
  var css=w.document.documentElement.innerHTML;
  ok(/\.mgr-icon-btn/.test(css),'v5.14 T12 · .mgr-icon-btn style present');
  ok(/_inlineRenameDay/.test(css),'v5.14 T12 · inline rename wiring present in markup-render');
  ok(/_dismissPlanIntro/.test(css),'v5.14 T12 · intro dismiss handler wired');
  ok(typeof w._inlineRenameDay==='function','v5.14 T12 · _inlineRenameDay defined');
  ok(typeof w._dismissPlanIntro==='function','v5.14 T12 · _dismissPlanIntro defined');
  // dismiss flag persists
  w._dismissPlanIntro();
  ok(w.localStorage.getItem('plan_intro_dismissed_v1')==='1','v5.14 T12 · dismiss writes localStorage flag');
  w.close();
})();

// ── v5.14 · T9 dividers + T10 token cleanups ──
(function(){
  const w=loadApp(makeStore({}));
  var css=w.document.documentElement.innerHTML;
  // T9 · "Last 21 days" line uses divider styling, no colored bg.
  ok(/\.day-bal-hint\{[^}]*background:transparent[^}]*border-top:1px solid var\(--border-soft\)/.test(css),'v5.14 T9 · day-bal-hint uses transparent bg + top/bottom dividers');
  // T10 · tokens added
  ok(/--muted-2:\s*#9896C8/.test(css),'v5.14 T10 · --muted-2 token defined in dark');
  ok(/--muted-deep:\s*#5C5A80/.test(css),'v5.14 T10 · --muted-deep token defined in dark');
  ok(/--gold:\s*#FFD740/.test(css),'v5.14 T10 · --gold token defined');
  // Raw hex usage of replaced shades is gone (excluding token decls themselves).
  // We allow the hex in the :root/body.dark token declarations only.
  var bodyOnly=css;
  ['9896C8','9E9CC4','B4B2D8'].forEach(function(h){
    // Count occurrences outside the line "--muted-2: #XXXXXX"
    var rgx=new RegExp('#'+h,'gi');
    var occurrences=(bodyOnly.match(rgx)||[]).length;
    // Only the 1 token decl + maybe a comment line remains; 2 max is OK.
    ok(occurrences<=2,'v5.14 T10 · raw #'+h+' nearly eliminated ('+occurrences+' left, ≤2 expected)');
  });
  w.close();
})();

// ── v5.22 · cardio sessions now contribute to weekly muscle load ──
(function(){
  const w=loadApp(makeStore({}));
  // Strength baseline so prior weeks exist (otherwise everything's 'moderate')
  var now=Date.now(), DAY=86400000;
  w.localStorage.setItem('gymlog_a', JSON.stringify([
    {label:'D1',date:'',ts:now-21*DAY,entries:[{ex:'Lat pulldown',note:'Set 1: 100 lbs x10reps'}]}
  ]));
  // This week: cardio-only session — 30 min treadmill via the warmup-style fields.
  w.localStorage.setItem('gymlog_c', JSON.stringify([
    {label:'D3',date:'',ts:now-1*DAY,entries:[
      {ex:'wu-c-treadmill-speed', note:'2.5 mph'},
      {ex:'wu-c-treadmill-duration', note:'30 min'},
      {ex:'wu-c-treadmill-distance', note:'1.2 mi'}
    ]}
  ]));
  var load=w.computeWeeklyMuscleLoad();
  ok(load.quad && load.quad!=='none','v5.22 · cardio counts toward quads (got '+load.quad+')');
  ok(load.glute && load.glute!=='none','v5.22 · cardio counts toward glutes');
  ok(load.calf && load.calf!=='none','v5.22 · cardio counts toward calves');
  ok(load.hamstring && load.hamstring!=='none','v5.22 · cardio counts toward hamstrings');
  // CARDIO_MODALITY_MUSCLES + CARDIO_VOL_PER_MINUTE present
  ok(w.CARDIO_MODALITY_MUSCLES && w.CARDIO_MODALITY_MUSCLES.treadmill,'v5.22 · CARDIO_MODALITY_MUSCLES map defined');
  ok(typeof w.CARDIO_VOL_PER_MINUTE==='number','v5.22 · CARDIO_VOL_PER_MINUTE calibration constant defined');
  // Row variant exercises upper body too
  w.localStorage.setItem('gymlog_c', JSON.stringify([
    {label:'D3',date:'',ts:now-1*DAY,entries:[
      {ex:'wu-c-row-duration', note:'20 min'}
    ]}
  ]));
  var loadR=w.computeWeeklyMuscleLoad();
  ok(loadR.lat && loadR.lat!=='none','v5.22 · rowing trains lats');
  ok(loadR['upper-back'] && loadR['upper-back']!=='none','v5.22 · rowing trains upper-back');
  // Muscle drill-down also picks up cardio
  var info=w._muscleExercises('quad');
  ok(info.lastEx==='Row','v5.22 · _muscleExercises shows the cardio modality as "last trained" ('+info.lastEx+')');
  w.close();
})();

// ── v5.30 · cross-day cardio prefill + Last summary ──
(function(){
  var DAY=86400000, now=Date.now();
  var d1Sess = {label:'D1', date:'yesterday', ts:now-DAY, entries:[
    {ex:'wu-a-treadmill-speed',    note:'2.5 mph'},
    {ex:'wu-a-treadmill-duration', note:'5 min'}
  ]};
  const w=loadApp(makeStore({ 'gymlog_a': JSON.stringify([d1Sess]) }));
  ok(w._cardioNormalizeKey('wu-a-treadmill-speed')==='wu-treadmill-speed','v5.30 · normalizes wu-a-* → wu-*');
  ok(w._cardioNormalizeKey('wu-d-bike-rpm')==='wu-bike-rpm','v5.30 · normalizes wu-d-* → wu-*');
  ok(w._cardioNormalizeKey('d3cardio-treadmill-speed')==='cardio-treadmill-speed','v5.30 · normalizes d3cardio-* → cardio-*');
  ok(w._cardioNormalizeKey('Lat pulldown')==='Lat pulldown','v5.30 · non-cardio keys pass through');
  var crm=w.buildCardioMap();
  ok(crm['wu-treadmill-speed'] && crm['wu-treadmill-speed'].note==='2.5 mph','v5.30 · cardioMap built across days');
  var nk2=w._cardioNormalizeKey('wu-d-treadmill-speed');
  ok(crm[nk2] && crm[nk2].note==='2.5 mph','v5.30 · Day 4 input data-ex "wu-d-*" finds Day 1\'s "wu-a-*" entry');
  var lastSum=w._cardioLastSummary('d', 'wu-d');
  ok(lastSum && /Treadmill/.test(lastSum.text) && /2\.5 mph/.test(lastSum.text),'v5.30 · Last-session summary is cross-day ('+(lastSum?lastSum.text:'none')+')');
  w.close();
})();

// ── v5.29 · auto-start rest on check (opt-in) + Auto→Default label ──
(function(){
  const w=loadApp(makeStore({}));
  ok(w.getAutoStartRest()===false,'v5.29 · auto-start rest defaults to OFF');
  w.setAutoStartRest(true);
  ok(w.getAutoStartRest()===true,'v5.29 · setAutoStartRest(true) persists');
  ok(w.localStorage.getItem('rest_autostart_v1')==='1','v5.29 · localStorage key written');
  var seg=w.document.getElementById('auto-rest-seg');
  ok(seg && seg.querySelectorAll('button').length===2,'v5.29 · Off/On segmented control rendered');
  try{ w.openMore(); }catch(e){}
  var onBtn=seg.querySelector('button.on');
  ok(onBtn && onBtn.getAttribute('data-ar')==='on','v5.29 · "On" button highlighted when enabled');
  w.setAutoStartRest(false);
  ok(w.getAutoStartRest()===false,'v5.29 · setAutoStartRest(false) persists');
  var restSeg=w.document.getElementById('rest-seg');
  var defaultBtn=[].slice.call(restSeg.querySelectorAll('button')).filter(function(b){return b.getAttribute('data-m')==='auto';})[0];
  ok(defaultBtn && /Default/.test(defaultBtn.textContent),'v5.29 · Rest-timer "Auto" button now labeled "Default" (data-m="auto" intact)');
  w.close();
})();

// ── v5.26 · unified PR counters (save toast / 🏆 toast / Sessions badge agree) ──
(function(){
  var DAY=86400000, now=Date.now();
  var prior = {label:'D1', date:'old', ts:now-7*DAY, entries:[
    {ex:'Lat pulldown', note:'Set 1: 100 lbs x10reps'}
  ]};
  var todayEntries = [
    {ex:'Lat pulldown', note:'Set 1: 110 lbs x8reps'},      // raw PR (110 > 100)
    {ex:'Cable row',    note:'Set 1: 80 lbs x10reps'}        // first-time → NOT a PR
  ];
  var todaySess = {label:'D1', date:'today', ts:now, entries:todayEntries};
  const w=loadApp(makeStore({ 'gymlog_a': JSON.stringify([todaySess, prior]) }));
  var toastCount = w.countNewEstPRs('a', todayEntries);
  var prList     = w.checkForPRs('a', todayEntries);
  var badgeCount = w._sessionPRCount('a', now, todaySess);
  ok(toastCount===1,'v5.26 · save-toast count = 1 PR (was inflated under old est-1RM logic)');
  ok(prList.length===1,'v5.26 · per-exercise PR list also = 1');
  ok(prList[0] && prList[0].ex==='Lat pulldown','v5.26 · the PR is the exercise that actually beat its prior best');
  ok(badgeCount===1,'v5.26 · Sessions tab badge count also = 1');
  ok(toastCount===badgeCount && badgeCount===prList.length,'v5.26 · all three counters agree on the same session');
  w.close();
})();

// ── v5.24 · rest-timer Auto picks survives cloud merge (regression guard) ──
(function(){
  const w=loadApp(makeStore({}));
  // Simulate user previously picked Long (so cloud has it).
  w.setRestMode('long');
  ok(w.getRestMode()==='long','v5.24 · Long persists after set');
  // Simulate a sync that brought down a cloud copy with _mode:'long'.
  // Now user picks Auto.
  w.setRestMode('auto');
  ok(w.getRestMode()==='auto','v5.24 · setRestMode(auto) reads back as auto');
  // The fix: Auto is stored explicitly, not deleted, so the merge can preserve it.
  var stored=JSON.parse(w.localStorage.getItem('rest_overrides_v1')||'{}');
  ok(stored._mode==='auto','v5.24 · _mode explicitly stored as "auto" (not deleted)');
  // Simulate the merge: cloud has _mode:'long', local has _mode:'auto'.
  // _mergeRestOverrides should prefer local ("a wins"), keeping Auto.
  var merged=w._mergeRestOverrides({_mode:'auto'}, {_mode:'long', 'Lat pulldown':60});
  ok(merged._mode==='auto','v5.24 · merge keeps the local Auto pick over cloud Long');
  ok(merged['Lat pulldown']===60,'v5.24 · merge still unions per-exercise overrides');
  w.close();
})();

// ── v5.18 · runtime text-size setting (Appearance → A / A+ / A++ / A+++) ──
(function(){
  const w=loadApp(makeStore({}));
  // Default at boot
  ok(w.getTextSize()==='default','v5.18 · default text size on boot');
  ok(!w.document.body.classList.contains('fs-bumped'),'v5.18 · no fs-* class on default');
  // Toggle through each size
  w.setTextSize('bumped');
  ok(w.getTextSize()==='bumped','v5.18 · setTextSize(bumped) persists');
  ok(w.document.body.classList.contains('fs-bumped'),'v5.18 · body.fs-bumped applied');
  ok(!w.document.body.classList.contains('fs-larger'),'v5.18 · prior classes cleared');
  w.setTextSize('larger');
  ok(w.document.body.classList.contains('fs-larger') && !w.document.body.classList.contains('fs-bumped'),'v5.18 · larger applied, bumped cleared');
  w.setTextSize('xl');
  ok(w.document.body.classList.contains('fs-xl') && !w.document.body.classList.contains('fs-larger'),'v5.18 · xl applied, prior cleared');
  // localStorage persists across "reload"
  ok(w.localStorage.getItem('text_size_v1')==='xl','v5.18 · text_size_v1 persisted in localStorage');
  // Invalid value → falls back to default
  w.setTextSize('garbage');
  ok(w.getTextSize()==='default','v5.18 · invalid input falls back to default');
  ok(!w.document.body.classList.contains('fs-bumped') && !w.document.body.classList.contains('fs-larger') && !w.document.body.classList.contains('fs-xl'),'v5.18 · invalid input clears all fs-* classes');
  // UI: 4 buttons in the segmented control, "default" highlighted as on after init
  var seg=w.document.getElementById('text-size-seg');
  ok(seg && seg.querySelectorAll('button').length===4,'v5.18 · text-size control renders 4 buttons');
  var onBtn=seg && seg.querySelector('button.on');
  ok(onBtn && onBtn.getAttribute('data-ts')==='default','v5.18 · "default" button highlighted after reset');
  // CSS rule presence (no visual change unless class is set)
  var css=w.document.documentElement.innerHTML;
  ok(/body\.fs-bumped\s*\{/.test(css),'v5.18 · body.fs-bumped CSS rule present');
  ok(/body\.fs-larger\s*\{/.test(css),'v5.18 · body.fs-larger CSS rule present');
  ok(/body\.fs-xl\s*\{/.test(css),'v5.18 · body.fs-xl CSS rule present');
  w.close();
})();

// ── v5.14 · T8 Progress hierarchy (strap removed, recap chip, notice bell) ──
(function(){
  // 1) Strap is gone — #prog-stats-row hidden in markup.
  const w=loadApp(makeStore({}));
  var statsRow=w.document.getElementById('prog-stats-row');
  ok(statsRow && statsRow.hidden,'v5.14 T8 · prog-stats-row strap is hidden (deleted)');
  // 2) Recap header shows 🔥 chip when month1 was earned ≤7d ago.
  var now=Date.now();
  // v5.28: anchor session timestamps to "this calendar month" so the test
  // doesn't break when a real date crosses a month boundary. Spreading them
  // 1d apart from today inside the same month works whether we're on the
  // 1st or 15th — clamps to month start if today is too early.
  var _mStart=new Date(now); _mStart.setDate(1); _mStart.setHours(0,0,0,0);
  function _inMonth(daysAgo){ var t=now-daysAgo*86400000; return Math.max(t, _mStart.getTime()+1); }
  w.localStorage.setItem('gymlog_a', JSON.stringify([
    {label:'D1',date:'',ts:_inMonth(1),entries:[{ex:'Lat pulldown',note:'Set 1: 120 lbs x12reps'}]},
    {label:'D1',date:'',ts:_inMonth(3),entries:[{ex:'Lat pulldown',note:'Set 1: 120 lbs x12reps'}]},
    {label:'D1',date:'',ts:_inMonth(5),entries:[{ex:'Lat pulldown',note:'Set 1: 120 lbs x12reps'}]},
    {label:'D1',date:'',ts:_inMonth(7),entries:[{ex:'Lat pulldown',note:'Set 1: 120 lbs x12reps'}]}
  ]));
  w.localStorage.setItem('earned_milestones', JSON.stringify(['month1']));
  w.localStorage.setItem('milestones_earned_at', JSON.stringify({month1:now-86400000}));
  try{ w.renderProgress(); }catch(e){}
  var recap=w.document.getElementById('prog-recap');
  ok(recap && /1mo active/.test(recap.innerHTML||''),'v5.14 T8 · 🔥 1mo active chip shown when earned ≤7d ago');
  // After 8 days, the chip is gone.
  w.localStorage.setItem('milestones_earned_at', JSON.stringify({month1:now-8*86400000}));
  try{ w.renderProgress(); }catch(e){}
  ok(recap && !/1mo active/.test(recap.innerHTML||''),'v5.14 T8 · chip drops after 7 days');
  w.close();
})();

// ── v5.14 · T6 Awards rework + T7 "Worth a look" ──
(function(){
  // Seed enough sessions for some milestones earned + some Up Next.
  var now=Date.now(), DAY=86400000;
  var sessions=[];
  // Need both an exercise that's logged consistently AND one that's sometimes skipped
  // so exPoss/exApp produce a non-empty topSkipped.
  for(var i=0;i<6;i++){
    var entries=[{ex:'Lat pulldown',note:'Set 1: 120 lbs x12reps'}];
    // Cable row logged only on the most recent session (1 of 6 → 83% skipped)
    if(i===0) entries.push({ex:'Cable row',note:'Set 1: 100 lbs x8reps'});
    sessions.push({label:'D1',date:'',ts:now-i*DAY,entries:entries});
  }
  const w=loadApp(makeStore({ 'gymlog_a': JSON.stringify(sessions) }));
  var html=w.renderMilestones();
  // T6 · earned section + Up Next badges + collapse button
  ok(/milestone-badge earned/.test(html),'v5.14 T6 · earned badges present');
  ok(/milestone-badge upnext/.test(html),'v5.14 T6 · Up Next badges present');
  ok(/milestone-progress/.test(html),'v5.14 T6 · progress bars rendered for derivable Up Next');
  ok(/more locked/.test(html),'v5.14 T6 · "+ N more locked" collapse button');
  ok(/milestone-rest/.test(html) && /hidden/.test(html),'v5.14 T6 · the rest are collapsed by default');
  // Test that earned badges come first
  var earnedIdx=html.indexOf('milestone-badge earned');
  var upnextIdx=html.indexOf('milestone-badge upnext');
  ok(earnedIdx<upnextIdx,'v5.14 T6 · earned sorted before Up Next');
  // T7 · "Worth a look" — needs sessions with un-checked items. Add some.
  // Each session above only has 1 entry, so other day-1 exercises (Cable row,
  // Pec fly, …) appear in 6 possibilities but 0 times → 100% "skipped".
  try{ w.renderStats(); }catch(e){}
  var statsHtml=w.document.getElementById('prog-stats')?w.document.getElementById('prog-stats').innerHTML:'';
  ok(/Worth a look/.test(statsHtml),'v5.14 T7 · section renamed to "Worth a look"');
  ok(/done \d+ of last \d+/.test(statsHtml),'v5.14 T7 · row reads "done X of last Y"');
  ok(!/% skipped/.test(statsHtml),'v5.14 T7 · old "% skipped" framing removed');
  w.close();
})();

// ── v5.14 · Phase 2 — fmtSet chips + empty-chip dimming ──
(function(){
  const w=loadApp(makeStore({}));
  // T3 · fmtSet
  ok(w.fmtSet('Set 1: 120 lbs x12reps', 0)==='1 · 120×12','v5.14 T3 · fmtSet: simple lbs+reps ('+w.fmtSet('Set 1: 120 lbs x12reps',0)+')');
  ok(w.fmtSet('Set 3: 95 lbs', 2)==='3 · 95','v5.14 T3 · fmtSet: weight only, no reps');
  ok(w.fmtSet('Set 1: On step', 0)==='1 · On step','v5.14 T3 · fmtSet: non-numeric falls through');
  // Unit suffix only when set's stored unit differs from pref
  w.localStorage.setItem('units_v1','lbs');
  ok(!/kg/.test(w.fmtSet('Set 1: 100 lbs x10reps',0)),'v5.14 T3 · fmtSet: same-unit → no suffix');
  ok(/kg/.test(w.fmtSet('Set 1: 45 kg x10reps',0)),'v5.14 T3 · fmtSet: differing unit → kg suffix');
  // Chip CSS uses 3-col grid
  var css=w.document.documentElement.innerHTML;
  ok(/\.sess-lift-sets\{display:grid;grid-template-columns:repeat\(3,1fr\)/.test(css),'v5.14 T3 · chips lay out in 3-col grid');
  // T5 · empty chip dimming
  ok(/\.sess-filter\.empty\{opacity:\.35;pointer-events:none\}/.test(css),'v5.14 T5 · .sess-filter.empty CSS present');
  w.close();
})();

// ── v5.14 · fmtDate helper + B1–B5 bugfixes (Phase 1) ──
(function(){
  const w=loadApp(makeStore({}));
  // T1 · fmtDate
  var t=new Date(2026,4,25,18,0).getTime();
  ok(w.fmtDate(t,'short')==='May 25','v5.14 T1 · short → "May 25" (got "'+w.fmtDate(t,'short')+'")');
  ok(/^Mon · May 25$/.test(w.fmtDate(t,'med')),'v5.14 T1 · med → "Mon · May 25"');
  ok(w.fmtDate('Mon, May 25, 2026 at 6:00 PM','short')==='May 25','v5.14 T1 · short parses session.date string');
  ok(/^\d{4}-\d{2}-\d{2}T/.test(w.fmtDateISO(t)),'v5.14 T1 · fmtDateISO returns ISO string');
  ok(w.fmtDate('not-a-date','short')==='','v5.14 T1 · invalid input → empty');
  // T2-B4: "Over" caption + non-negative weeks
  w.localStorage.setItem('body_measurements', JSON.stringify([
    {type:'weight',value:200,unit:'lbs',date:'2026-04-20'},
    {type:'weight',value:198,unit:'lbs',date:'2026-05-25'}
  ]));
  try{ w.renderGenericMeas('weight'); }catch(e){}
  var summ=(w.document.getElementById('meas-summary')||{}).innerHTML||'';
  ok(/Over/.test(summ) && !/-\s*\d+\s*wks/.test(summ),'v5.14 B4 · "Over" no negative wks ('+summ.match(/Over[\s\S]{0,40}/)+')');
  ok(/since/i.test(summ),'v5.14 B4 · "since {date}" caption rendered');
  // T2-B2: Body card uses var(--card), not hardcoded near-white
  var css=w.document.documentElement.innerHTML;
  ok(/\.meas-stat-chip\{background:var\(--card\)/.test(css),'v5.14 B2 · .meas-stat-chip uses var(--card)');
  // T2-B5: neutral when no goal set
  w.localStorage.removeItem('bodyweight_goal_v1');
  try{ w.renderGenericMeas('weight'); }catch(e){}
  var summN=(w.document.getElementById('meas-summary')||{}).innerHTML||'';
  ok(/delta-neutral/.test(summN),'v5.14 B5 · no goal → neutral delta on Change card');
  // T2-B3: chart data is sorted ascending — drawMeasChartGeneric has the sort.
  ok(/sort/.test(w.drawMeasChartGeneric.toString()) && /localeCompare/.test(w.drawMeasChartGeneric.toString()),'v5.14 B3 · drawMeasChartGeneric sorts ascending');
  // T2-B1: drawChartV2 honors labelCount option
  ok(/opts\.labelCount/.test(w.drawChartV2.toString()),'v5.14 B1 · drawChartV2 supports labelCount option');
  w.close();
})();

// ── v5.11 · monthly recap card in Progress ──
(function(){
  var now=Date.now();
  var d=new Date(); var iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  // v5.28: both timestamps must land in the current calendar month. Anchor
  // them at the start of the current month + a few hours so they're safe
  // regardless of what day-of-month the test runs.
  var _mStart11=new Date(now); _mStart11.setDate(1); _mStart11.setHours(12,0,0,0);
  var _ts1=_mStart11.getTime()+3600000;
  var _ts2=_mStart11.getTime()+7200000;
  const store=makeStore({ 'gymlog_a': JSON.stringify([
    {label:'D1',date:'this month',ts:_ts2,entries:[{ex:'Barbell bench press',note:'Set 1: 225 lbs x5reps'}]},
    {label:'D1',date:'this month',ts:_ts1,entries:[{ex:'Barbell bench press',note:'Set 1: 200 lbs x5reps'}]}
  ]),
    'body_measurements': JSON.stringify([{type:'weight',date:iso,value:201,unit:'lbs',ts:now}]) });
  const w=loadApp(store);
  try{ w.renderProgress(); }catch(e){}
  var recap=w.document.getElementById('prog-recap');
  ok(recap && !recap.hidden,'v5.11 · monthly recap is visible when there are sessions this month');
  ok(recap && /This month ·/.test(recap.textContent),'v5.11 · recap header present');
  ok(recap && /2 sessions/.test(recap.textContent),'v5.11 · recap counts this-month sessions ('+(recap?recap.textContent:'none')+')');
  ok(recap && /volume/.test(recap.textContent),'v5.11 · recap shows volume');
  const w2=loadApp(makeStore({}));
  try{ w2.renderProgress(); }catch(e){}
  var recap2=w2.document.getElementById('prog-recap');
  ok(recap2 && recap2.hidden,'v5.11 · recap hidden with no sessions this month');
  w.close(); w2.close();
})();

// ── v5.13 · single adaptive coach line (consolidates nudge + pill + aim) ──
(function(){
  // Ready state: two sessions at the same weight, no reps → "ready to add weight".
  const store=makeStore({ 'gymlog_a': JSON.stringify([
    {label:'D1',date:'Mon, May 25, 2026 at 6:00 PM',ts:2,entries:[{ex:'Chest press',note:'Set 1: 150 lbs'}]},
    {label:'D1',date:'Fri, May 22, 2026 at 6:00 PM',ts:1,entries:[{ex:'Chest press',note:'Set 1: 150 lbs'}]}
  ]) });
  const w=loadApp(store);
  try{ w.loadLastTimes(); }catch(e){}
  const card=w.document.getElementById(domIdByDataEx(w.document,'a','Chest press'));
  var lines=card?card.querySelectorAll('.coach-line'):[];
  ok(lines.length===1,'v5.13 · exactly one coach line per card (got '+lines.length+')');
  var ready=card && card.querySelector('.coach-ready');
  ok(ready && /Ready · try/.test(ready.textContent),'v5.14 T4 · ready state renders ('+(ready?ready.textContent:'none')+')');
  ok(ready && /→ Fill/.test(ready.textContent),'v5.14 T4 · ready state is tappable (→ Fill affordance)');
  ok(ready && /lbs/i.test(ready.textContent),'v5.14 T4 · ready state includes unit');
  ok(ready && /^\+[\d.]+ lb/.test(ready.getAttribute('title')||''),'v5.14 T4 · long-press detail in title= ('+(ready?ready.getAttribute('title'):'none')+')');
  // legacy stacked cues must be gone
  ok(card && !card.querySelector('.overload-nudge,.prog-pill,.prog-hold,.aim-cap'),'v5.13 · no legacy stacked cues remain');
  // tapping fills the set inputs
  if(ready) ready.click();
  var filled=card?[].slice.call(card.querySelectorAll('.rep-input[data-set]')).every(function(i){return i.value && parseFloat(i.value)>150;}):false;
  ok(filled,'v5.13 · tapping ready fills the sets with the suggested weight');
  ok(card && !card.querySelector('.coach-ready'),'v5.13 · ready line clears after accepting the fill');
  w.close();
  // Aim (quiet) fallback: last session has no reps but earlier reps give an e1RM.
  const store2=makeStore({ 'gymlog_a': JSON.stringify([
    {label:'D1',date:'Mon, May 25, 2026 at 6:00 PM',ts:3,entries:[{ex:'Chest press',note:'Set 1: 200 lbs'}]},
    {label:'D1',date:'Fri, May 22, 2026 at 6:00 PM',ts:2,entries:[{ex:'Chest press',note:'Set 1: 150 lbs x8reps'}]},
    {label:'D1',date:'Tue, May 19, 2026 at 6:00 PM',ts:1,entries:[{ex:'Chest press',note:'Set 1: 145 lbs x8reps'}]}
  ]) });
  const wa=loadApp(store2);
  try{ wa.loadLastTimes(); }catch(e){}
  const cardA=wa.document.getElementById(domIdByDataEx(wa.document,'a','Chest press'));
  var quiet=cardA && cardA.querySelector('.coach-quiet');
  ok(quiet && /Aim ~\d+ .* same as last time/.test(quiet.textContent),'v5.14 T4 · aim copy: "Aim ~N · same as last time" ('+(quiet?quiet.textContent:'none')+')');
  ok(quiet && !/% of e1RM/.test(quiet.textContent),'v5.14 T4 · e1RM% removed from surface (now in title)');
  ok(quiet && /\d+% of e1RM \d+/.test(quiet.getAttribute('title')||''),'v5.14 T4 · aim detail in title=');
  wa.close();
  // No history → no coach line at all.
  const w2=loadApp(makeStore({}));
  try{ w2.loadLastTimes(); }catch(e){}
  const card2=w2.document.getElementById(domIdByDataEx(w2.document,'a','Chest press'));
  ok(card2 && !card2.querySelector('.coach-line'),'v5.13 · no coach line without logged history');
  w2.close();
})();

// ── v5.5 · tap exercise name → inline history + 1RM sparkline ──
(function(){
  const store=makeStore({ 'gymlog_a': JSON.stringify([
    {label:'D1',date:'Mon, May 25, 2026 at 6:00 PM',ts:3,entries:[{ex:'Chest press',note:'Set 1: 145 lbs x8reps'}]},
    {label:'D1',date:'Fri, May 22, 2026 at 6:00 PM',ts:2,entries:[{ex:'Chest press',note:'Set 1: 140 lbs x8reps'}]},
    {label:'D1',date:'Tue, May 19, 2026 at 6:00 PM',ts:1,entries:[{ex:'Chest press',note:'Set 1: 135 lbs x8reps'}]}
  ]) });
  const w=loadApp(store);
  const id=domIdByDataEx(w.document,'a','Chest press');
  const card=w.document.getElementById(id);
  const name=card && card.querySelector('.ex-name[role="button"]');
  ok(!!name,'v5.5 · strength card name is a tappable history affordance');
  if(name){
    name.click();   // inline onclick=toggleExHistory + the document toggle handler both fire
    ok(!!card.querySelector('.ex-hist-panel'),'v5.5 · name tap opens the inline history panel');
    ok(!card.classList.contains('done'),'v5.5 · name tap does NOT toggle the checkbox (excluded)');
    ok(card.querySelectorAll('.ex-hist-panel .exh-row').length>=3,'v5.5 · history rows render');
    ok(!!card.querySelector('.exh-spark-svg'),'v5.5 · est-1RM sparkline renders (>=2 sessions)');
    name.click();
    ok(!card.querySelector('.ex-hist-panel'),'v5.5 · re-tap closes the panel');
  }
  ok(w._exSparkline([1,2,3],100,20).indexOf('<polyline')>=0,'v5.5 · _exSparkline emits a polyline');
  ok(w._exSparkline([5],100,20)==='','v5.5 · _exSparkline is empty for <2 points');
  w.close();
})();

// ── v5.4 · rest timer is timestamp-based (stays accurate across backgrounding) ──
(function(){
  const w = loadApp(makeStore({}));
  w.startRestTimer(90);
  ok(Math.abs(w.restEndTs - (Date.now()+90000)) < 2000, 'v5.4 · rest timer tracks an absolute end ~90s out');
  ok(w.document.getElementById('rest-timer-count').textContent==='90','v5.4 · rest count shows 90 at start');
  // simulate the timer elapsing while the phone was locked (JS suspended), then the next tick on return:
  w.restEndTs = Date.now()-500; w._restTick();
  ok(w._restDone===true,'v5.4 · an elapsed timer completes on the next tick (not stuck mid-count)');
  ok(!w.document.getElementById('rest-timer-bar').classList.contains('show'),'v5.4 · bar hides on completion');
  w.stopRestTimer(); w.close();
})();

console.log('\n'+(failures? ('FUNC SMOKE FAIL — '+failures+' failed, '+passes+' passed')
                            : ('FUNC SMOKE PASS — '+passes+' checks')));
process.exit(failures?1:0);
