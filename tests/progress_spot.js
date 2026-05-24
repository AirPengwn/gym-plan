'use strict';
// Progress-refresh spot check: Steps 1-9 functional + backup-restore roundtrip canary.
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
let w=app(ST); let D=w.document;

// Step 1 — Plan button
ok(!!D.getElementById('hdr-plan-btn'),'Step 1 · 📋 Plan button in header');
ok(typeof w.openManage==='function','Step 1 · openManage() defined');

// Step 2 — Three tabs visible, labels Sessions / Lifts / Trends
var tabs=Array.from(D.querySelectorAll('.prog-tab-btn'));
ok(tabs.length===3,'Step 2 · prog-tab-row has 3 tabs ('+tabs.length+')');
ok(/Sessions/.test(tabs[0].textContent)&&/Lifts/.test(tabs[1].textContent)&&/Trends/.test(tabs[2].textContent),'Step 2 · tabs labelled Sessions · Lifts · Trends');
// Measurements panel ID gone but switchProgTab('measurements') aliases to stats
ok(!D.getElementById('prog-panel-measurements'),'Step 2 · prog-panel-measurements removed');
ok(!!D.getElementById('meas-wrap-host'),'Step 2 · meas-wrap-host present (inside Trends)');
// switchProgTab('measurements') doesn't crash and lands on stats
var threw=false; try{ w.switchProgTab('measurements', null); }catch(e){ threw=true; }
ok(!threw && D.getElementById('prog-panel-stats').classList.contains('show'),'Step 2 · switchProgTab("measurements") aliases to Trends/stats panel');

// Step 3 + Step 4 — Deload card + zones
ok(typeof w.isDeloadSuppressed==='function','Step 3 · isDeloadSuppressed() defined');
ok(typeof w.renderDeloadCard==='function','Step 3 · renderDeloadCard() defined');
ok(typeof w.planDeload==='function' && typeof w.snoozeDeload==='function','Step 3 · planDeload + snoozeDeload defined');
// Snooze test: writing the flag suppresses the card.
w.localStorage.setItem('deload_snooze_until', String(Date.now()+86400*1000));
ok(w.isDeloadSuppressed()===true,'Step 3 · snooze flag suppresses card');
w.localStorage.removeItem('deload_snooze_until');
ok(w.isDeloadSuppressed()===false,'Step 3 · removing snooze re-enables');

// Seed data first so renderStats emits zones (computeStats short-circuits with no data).
w.localStorage.setItem('gymlog_a', JSON.stringify([{
  label:'Day 1 — Upper A', date:'May 18, 2026 at 9:00 AM', ts:Date.now()-86400*1000, duration:42, checkin:'great',
  entries:[{ex:'Chest press', note:'Set 1: 100 lbs x10reps | Set 2: 105 lbs x8reps'}]
},{
  label:'Day 1 — Upper A', date:'May 12, 2026 at 9:00 AM', ts:Date.now()-7*86400*1000, duration:38,
  entries:[{ex:'Chest press', note:'Set 1: 95 lbs x10reps'}]
},{
  label:'Day 1 — Upper A', date:'May 5, 2026 at 9:00 AM', ts:Date.now()-14*86400*1000, duration:40,
  entries:[{ex:'Chest press', note:'Set 1: 90 lbs x10reps'}]
}]));

// Step 4 — zones render in Trends
w.switchProgTab('stats', null);
var statsHTML=(D.getElementById('prog-stats')||{}).innerHTML||'';
ok(/stats-zone-title">Now</.test(statsHTML),'Step 4 · Now zone title present (Patch 3 Step 2: now .stats-section-title.stats-zone-title)');
ok(/stats-zone-title">Trends</.test(statsHTML),'Step 4 · Trends zone title present');
ok(/stats-zone-title">Awards</.test(statsHTML),'Step 4 · Awards zone title present');
// Body Measurements moved into Trends zone
var measHost=D.getElementById('meas-wrap-host');
var anchor=D.getElementById('trends-zone-meas-anchor');
ok(measHost && anchor && anchor.contains(measHost),'Step 4 · meas-wrap-host moved into Trends zone anchor');

// Step 5 — Sessions feed
w.renderProgress();
var feed=D.getElementById('sess-feed');
ok(feed && feed.querySelectorAll('.sess-card').length===3,'Step 5 · feed renders 3 session cards');
ok(/sess-day-pill/.test(feed.innerHTML),'Step 5 · day pill rendered');
ok(/Chest press/.test(feed.innerHTML),'Step 5 · lift name visible');
ok(/sess-lift-set/.test(feed.innerHTML),'Step 5 · structured set list rendered');
ok((D.getElementById('prog-count-a')||{}).textContent==='3','Step 5 · prog-count-a updates to 3');
ok(/🏆.*PR/.test(feed.innerHTML),'Step 5 · PR chip rendered on newer session');
// Filter
w.sessFilter('a', D.querySelector('.sess-filter[data-d="a"]'));
ok(D.querySelectorAll('.sess-card').length===3,'Step 5 · filter D1 keeps all 3 Day-1 sessions');
ok(D.getElementById('sess-filter-actions').style.display==='block','Step 5 · per-day Clear button visible when day-filter active');
w.sessFilter('b', D.querySelector('.sess-filter[data-d="b"]'));
ok(D.querySelectorAll('.sess-card').length===0,'Step 5 · filter D2 hides Day-1 sessions');
w.sessFilter('all', D.querySelector('.sess-filter[data-d="all"]'));
ok(D.querySelectorAll('.sess-card').length===3,'Step 5 · filter All restores all sessions');
// Overflow + delete
ok(typeof w.confirmDeleteSession==='function','Step 5 · confirmDeleteSession defined');
w.confirmDeleteSession('a', 0);
ok(D.getElementById('sess-del-overlay').classList.contains('show'),'Step 5 · delete confirm modal opens');
w.executeDeleteSession();
ok(w.getSaved('a').length===2,'Step 5 · executeDeleteSession removes one session (3→2)');
ok(!D.getElementById('sess-del-overlay').classList.contains('show'),'Step 5 · delete modal closes after execute');

// Step 6 — Lifts sort chips + sparklines
w.switchProgTab('exercises', null);
ok(typeof w.liftsSort==='function','Step 6 · liftsSort defined');
ok(D.querySelectorAll('.lifts-sort-chip').length===4,'Step 6 · 4 sort chips rendered');
ok(D.querySelector('.lifts-sort-chip.on').textContent.trim()==='A–Z','Step 6 · default sort is A–Z');
ok(D.querySelector('.lift-spark')!=null,'Step 6 · inline sparkline SVG rendered');
ok(D.querySelector('.lift-pill')!=null,'Step 6 · % delta pill rendered per row');
w.liftsSort('recent', D.querySelectorAll('.lifts-sort-chip')[2]);
ok(D.querySelectorAll('.lifts-sort-chip.on')[0].textContent==='Recent','Step 6 · switching to Recent sort updates chip');
w.liftsSort('az', D.querySelectorAll('.lifts-sort-chip')[0]);

// Step 7 — Single chart + 3 metric pills
// Pick the first exercise to open detail
var firstEx=D.querySelector('.ex-list-btn');
ok(!!firstEx,'Step 7 · exercise list has rows');
// selectExByIndex(0) opens it
w.selectExByIndex(0);
ok(D.querySelectorAll('.lift-metric-pill').length===3,'Step 7 · 3 metric toggle pills (Weight/1RM/Volume)');
ok(D.querySelector('.lift-metric-pill.on').getAttribute('data-m')==='weight','Step 7 · Weight is default metric');
ok(!!D.getElementById('lift-chart-canvas'),'Step 7 · single lift-chart-canvas exists (no rm-* duplicate)');
ok(D.querySelectorAll('canvas[id^="rm-chart-"]').length===0,'Step 7 · old rm-chart canvas no longer rendered');
ok(D.querySelector('.ex-history-delta')!=null,'Step 7 · per-history-row delta pill rendered (≥1)');
w.setLiftMetric('1rm');
ok(D.querySelector('.lift-metric-pill[data-m="1rm"]').classList.contains('on'),'Step 7 · switching to 1RM toggles pill');
w.setLiftMetric('volume');
ok(D.querySelector('.lift-metric-pill[data-m="volume"]').classList.contains('on'),'Step 7 · switching to Volume toggles pill');

// Step 8 — drawChartV2 unified renderer
ok(typeof w.drawChartV2==='function','Step 8 · drawChartV2 defined');
ok(typeof w.drawChart==='function' && typeof w.drawVolumeChart==='function','Step 8 · drawChart & drawVolumeChart still callable (delegate to V2)');
ok(typeof w.drawMeasChartGeneric==='function','Step 8 · drawMeasChartGeneric still callable');

// Step 9 — Delta pill helper + emissions
ok(typeof w.deltaPill==='function','Step 9 · deltaPill() defined');
ok(/delta-up/.test(w.deltaPill(10, 5, {})),'Step 9 · deltaPill higher→up class');
ok(/delta-down/.test(w.deltaPill(5, 10, {})),'Step 9 · deltaPill lower→down class');
ok(/delta-up/.test(w.deltaPill(140, 180, {lowerIsBetter:true})),'Step 9 · lowerIsBetter flips: lower→up');
ok(/delta-flat/.test(w.deltaPill(100, 100, {})),'Step 9 · equal→flat');
// Render Trends and verify pills appear
w.switchProgTab('stats', null);
var sHTML=(D.getElementById('prog-stats')||{}).innerHTML||'';
ok(/delta-pill/.test(sHTML),'Step 9 · delta-pill class appears in Trends output');
ok(/Weekly Volume \(lbs moved\) <span class="delta-pill/.test(sHTML),'Step 9 · Weekly Volume header carries a delta pill');

// Backup-restore roundtrip canary
var beforeLen=w.getSaved('a').length;
ok(beforeLen>=2,'Backup · pre-roundtrip session count >=2 (got '+beforeLen+')');
ok(typeof w.generateExport==='function' && typeof w.importData==='function','Backup · generateExport + importData defined');
// Generate the export blob
w.generateExport();
var exp=(D.getElementById('export-text')||{}).value||'';
ok(exp.length>0,'Backup · generateExport produces a non-empty blob');
// Wipe locally
['a','b','c','d','e'].forEach(function(d){ w.localStorage.removeItem('gymlog_'+d); });
ok(w.getSaved('a').length===0,'Backup · local wipe clears sessions');
// Paste the blob into the import textarea and restore
var imp=D.getElementById('import-text'); if(imp) imp.value=exp;
try{ w.importData(); }catch(e){}
ok(w.getSaved('a').length===beforeLen,'Backup · restore re-populates getSaved("a") with '+beforeLen+' session(s)');
var restoredSess=w.getSaved('a')[0];
ok(restoredSess && (restoredSess.entries||[]).some(function(e){return /Set 1:\s*\d+\s*lbs/.test(e.note||'');}),'Backup · restored session keeps pipe-delimited note format');

// Dark mode round-trip after Steps 1-9
w.toggleDarkMode(); ok(D.body.classList.contains('dark'),'Dark · toggles on');
w.toggleDarkMode(); ok(!D.body.classList.contains('dark'),'Dark · toggles off');

console.log('\n'+(fail?('PROGRESS SPOT-CHECK: '+fail+' FAILED'):'PROGRESS SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
