'use strict';
// Patch 4 spot-check: 7 verification steps from HANDOFF-patch-4.md §Verification.
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

// Seed a session so generateExport has data to emit.
w.localStorage.setItem('gymlog_a', JSON.stringify([{
  label:'Day 1 — Upper A', date:'May 18, 2026 at 9:00 AM', ts:Date.now(), duration:42,
  entries:[{ex:'Chest press', note:'Set 1: 100 lbs x10reps | Set 2: 105 lbs x8reps'}]
}]));

// ─── Step 1: before Generate, Copy hidden ───
w.showExportImport();
var copyBtn=D.getElementById('backup-copy-btn');
var genBtn=D.getElementById('backup-gen-btn');
var ta=D.getElementById('export-text');
ok(!!copyBtn,'Step 1 · #backup-copy-btn element exists');
ok(copyBtn && copyBtn.style.display==='none','Step 1 · Copy button hidden before Generate');
ok(genBtn && genBtn.className==='modal-btn-primary','Step 1 · Generate is the primary action pre-generate');
ok(genBtn && genBtn.textContent==='Generate backup code','Step 1 · Generate label="Generate backup code"');
ok(ta && ta.value==='','Step 1 · textarea is empty');
ok(ta && ta.hasAttribute('readonly'),'Step 1 · textarea readonly preserved (long-press fallback)');

// ─── Step 2: Generate → textarea fills + Copy appears as primary ───
w.generateExport();
ok(ta.value.length>0,'Step 2 · textarea populated by Generate');
ok(copyBtn.style.display!=='none','Step 2 · Copy button visible after Generate');
ok(copyBtn.className==='modal-btn-primary','Step 2 · Copy button uses modal-btn-primary');
ok(genBtn.className==='modal-btn-secondary','Step 2 · Generate demoted to secondary');
ok(genBtn.textContent==='Regenerate','Step 2 · Generate relabelled "Regenerate"');
ok(D.getElementById('backup-hint').style.display==='block','Step 2 · backup-hint revealed');
ok(/Tap.*<b>Copy code<\/b>.*paste/.test(D.getElementById('backup-hint').innerHTML),'Step 2 · hint leads with Copy code');
ok(/long-press/i.test(D.getElementById('backup-hint').innerHTML),'Step 2 · hint keeps long-press as fallback');

// ─── Step 3: tap Copy → success path (modern clipboard API) ───
var copied='';
w.navigator.clipboard={writeText:function(t){copied=t;return Promise.resolve();}};
w.copyBackupCode();
return Promise.resolve().then(function(){
  ok(copied===ta.value,'Step 3 · navigator.clipboard.writeText received full textarea contents');
  ok(copyBtn.innerHTML==='✓ Copied','Step 3 · Copy button label transitions to "✓ Copied"');
  ok(copyBtn.disabled===true,'Step 3 · Copy button briefly disabled during success state');
  // v2.55: textarea is also visibly selected (selection range covers full content) for iPhone highlight feedback.
  ok(ta.selectionStart===0 && ta.selectionEnd===ta.value.length,'Step 3 · v2.55 — textarea is selected end-to-end after Copy (visible iPhone highlight)');
  // Wait for the 1800ms reset.
  return new Promise(function(r){ setTimeout(r, 1900); });
}).then(function(){
  ok(/Copy code/.test(copyBtn.innerHTML),'Step 3 · Copy button label resets after ~1.8s');
  ok(copyBtn.disabled===false,'Step 3 · Copy button re-enabled after reset');

  // ─── Step 4: clipboard API gated → execCommand fallback ───
  delete w.navigator.clipboard;
  var execCalled=false;
  D.execCommand=function(cmd){ if(cmd==='copy') execCalled=true; return true; };
  w.copyBackupCode();
  ok(execCalled,'Step 4 · execCommand("copy") fallback fires when navigator.clipboard absent');
  ok(copyBtn.innerHTML==='✓ Copied','Step 4 · fallback path still flips the button label');
  return new Promise(function(r){ setTimeout(r, 1900); });
}).then(function(){
  // Worst-case: both gated → toast tells user to long-press.
  D.execCommand=function(){ return false; };
  var toasted='';
  var origToast=w.showToast;
  w.showToast=function(m){ toasted=m; };
  w.copyBackupCode();
  ok(/long-press/i.test(toasted),'Step 4 · when both paths fail, toast tells user to long-press');
  w.showToast=origToast;

  // ─── Step 5: tap Generate again → success state has reset ───
  // (Even with prior copied state, the next render should restore Copy to its fresh label.)
  w.generateExport();
  ok(copyBtn.style.display!=='none','Step 5 · Copy still visible after Regenerate');
  ok(/Copy code/.test(copyBtn.innerHTML),'Step 5 · Copy label is fresh ("Copy code") after Regenerate');
  ok(copyBtn.disabled===false,'Step 5 · Copy enabled after Regenerate');
  ok(genBtn.textContent==='Regenerate','Step 5 · Generate stays "Regenerate" after another generate');

  // ─── Step 6: close + reopen → pristine ───
  D.getElementById('modal-overlay').classList.remove('show');
  w.showExportImport();
  ok(ta.value==='','Step 6 · reopened modal — textarea pristine');
  ok(copyBtn.style.display==='none','Step 6 · reopened modal — Copy button hidden again');
  ok(copyBtn.disabled===false,'Step 6 · reopened modal — Copy button enabled (reset)');
  ok(/Copy code/.test(copyBtn.innerHTML),'Step 6 · reopened modal — Copy label reset');
  ok(genBtn.className==='modal-btn-primary','Step 6 · reopened modal — Generate restored to primary');
  ok(genBtn.textContent==='Generate backup code','Step 6 · reopened modal — Generate label restored');
  ok(D.getElementById('backup-hint').style.display==='none','Step 6 · reopened modal — hint hidden');

  // ─── Step 7: long-press fallback intact ───
  // Generate to populate; textarea must still be readonly so manual long-press path works.
  w.generateExport();
  ok(ta.hasAttribute('readonly'),'Step 7 · textarea readonly preserved post-generate (long-press path intact)');
  // Simulate a selection (what long-press → Select All does in iOS); the API surface still works.
  ta.focus(); ta.setSelectionRange(0, ta.value.length);
  ok(ta.selectionStart===0 && ta.selectionEnd===ta.value.length,'Step 7 · selection across full textarea contents still works');

  // ─── Export format unchanged sanity (Do-Not-Touch) ───
  // The textarea value is btoa(JSON.stringify(payload)) — same as before Patch 4.
  var decoded;
  try{ decoded=JSON.parse(decodeURIComponent(escape(w.atob(ta.value)))); }catch(e){}
  ok(decoded && Array.isArray(decoded.gymlog_a) && decoded.gymlog_a.length===1,'Do-Not-Touch · export format unchanged (base64(JSON) of payload)');
  ok(decoded && decoded.gymlog_a[0].entries[0].note==='Set 1: 100 lbs x10reps | Set 2: 105 lbs x8reps','Do-Not-Touch · pipe-delimited session-entry format preserved end-to-end');

  // ─── v2.58 Select All button ───
  // Reset to pristine then re-open + generate.
  D.getElementById('modal-overlay').classList.remove('show');
  w.showExportImport();
  var selBtn=D.getElementById('backup-select-btn');
  ok(!!selBtn,'v2.58 · #backup-select-btn element exists');
  ok(selBtn.style.display==='none','v2.58 · Select All hidden before Generate');
  ok(selBtn.className==='modal-btn-secondary','v2.58 · Select All uses .modal-btn-secondary');
  w.generateExport();
  ok(selBtn.style.display!=='none','v2.58 · Select All visible after Generate');
  ok(typeof w.selectBackupCode==='function','v2.58 · selectBackupCode() defined');
  // Tap Select All → textarea selected end-to-end + (v5.44) clipboard write
  // so iOS users whose visual highlight UI misbehaves on long readonly
  // textareas still get the backup onto their clipboard in the same tap.
  var toasted='';
  var origToast2=w.showToast; w.showToast=function(m){ toasted=m; };
  var clipboardCalled=false, clipboardArg='';
  w.navigator.clipboard={writeText:function(t){ clipboardCalled=true; clipboardArg=t; return Promise.resolve(); }};
  w.selectBackupCode();
  ok(ta.selectionStart===0 && ta.selectionEnd===ta.value.length,'v2.58 · Select All selects full textarea');
  ok(clipboardCalled && clipboardArg===ta.value,'v5.44 · Select All ALSO writes the full backup to the clipboard (iOS highlight-paint fallback)');
  ok(/Selected/i.test(toasted),'v2.58 · Select All shows toast confirmation');
  w.showToast=origToast2;
  // Reopen → Select All hidden again (pristine reset).
  D.getElementById('modal-overlay').classList.remove('show');
  w.showExportImport();
  ok(selBtn.style.display==='none','v2.58 · Select All hidden again after reopen');

  // ─── v2.58 Test-mode menu styling ───
  var testBtn=D.getElementById('test-toggle');
  ok(!!testBtn,'v2.58 · #test-toggle element exists');
  // Off-state: no test-on class, no inline color overrides.
  // (Test mode is enabled in this harness via sessionStorage, so toggle to OFF first.)
  if(testBtn.classList.contains('test-on')){ w.toggleTestMode(); }
  ok(!testBtn.classList.contains('test-on'),'v2.58 · test-toggle has no .test-on class when OFF');
  ok(testBtn.style.background==='' && testBtn.style.color===''&&testBtn.style.borderColor==='','v2.58 · test-toggle has no inline color/background/border when OFF (themes via .hdr-mi)');
  ok(/Test mode/.test(testBtn.textContent),'v2.58 · test-toggle label="Test mode" when OFF');
  // Toggle ON → test-on class applied.
  w.toggleTestMode();
  ok(testBtn.classList.contains('test-on'),'v2.58 · test-toggle gains .test-on class when ON');
  ok(/End test/.test(testBtn.textContent),'v2.58 · test-toggle label changes to "End test (discard)" when ON');
  ok(testBtn.style.background==='' && testBtn.style.color===''&&testBtn.style.borderColor==='','v2.58 · test-toggle inline styles cleared (CSS classes drive theme)');
  // CSS source: themed on-state rules present for both light and dark.
  var src=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
  ok(/#test-toggle\.test-on\{background:#FFE5E5;color:#C53030\}/.test(src),'v2.58 · light-mode .test-on CSS rule present');
  ok(/body\.dark #test-toggle\.test-on\{background:#3A1A1A;color:#FF8080\}/.test(src),'v2.58 · dark-mode .test-on CSS rule present');
  ok(!/btn\.style\.background\s*=\s*TEST_MODE/.test(src),'v2.58 · old inline-hex assignments in _testUpdateUI removed');
  // Toggle OFF cleanup.
  w.toggleTestMode();
  ok(!testBtn.classList.contains('test-on'),'v2.58 · test-toggle .test-on class removed when toggled back OFF');

  console.log('\n'+(fail?('PATCH 4 SPOT-CHECK: '+fail+' FAILED'):'PATCH 4 SPOT-CHECK: ALL PASS'));
  process.exit(fail?1:0);
});
