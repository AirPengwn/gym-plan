'use strict';
// v3.34 — editable day button-label. The "D1" chip text is a per-day setting
// (config.short), independent of the day name: set on create, editable in the
// add/rename modal (name + label), and reflected in the day selector chips.
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
    w.confirm=()=>true; w.prompt=()=>'';
  }}).window;
}
let fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };
const ST=store(); ST.setItem('gym_primary_device','1');
const w=app(ST); const D=w.document;

// ── addDay accepts a custom button label ──
var k=w.addDay('Arm Day','ARMS');
ok(!!k,'addDay returns a key');
ok(w.getDayShort(k)==='ARMS','addDay stores the custom short label');
ok(w.getDayName(k)==='Arm Day','addDay stores the name');
// the selector chip shows the custom label
var chip=[].slice.call(D.querySelectorAll('#day-selector .day-btn')).filter(function(b){ return (b.getAttribute('onclick')||'').indexOf("'"+k+"'")!==-1; })[0];
ok(chip && chip.textContent.trim()==='ARMS','day-selector chip renders the custom label (not D6)');

// ── addDay without a label defaults to D{n} ──
var k2=w.addDay('Conditioning','');
ok(/^D\d+$/.test(w.getDayShort(k2)),'no label given → defaults to D{n} ('+w.getDayShort(k2)+')');

// ── label is independent of the name (editing name keeps label) ──
w.renameDay(k,'Guns');
ok(w.getDayName(k)==='Guns' && w.getDayShort(k)==='ARMS','renaming the day keeps the custom label');

// ── setDayLabel changes only the label ──
ok(w.setDayLabel(k,'GUNZ')===true,'setDayLabel returns true on change');
ok(w.getDayShort(k)==='GUNZ' && w.getDayName(k)==='Guns','setDayLabel changes label only, name untouched');

// ── editDayMeta edits both at once ──
w.editDayMeta(k,'Upper Pull','PULL');
ok(w.getDayName(k)==='Upper Pull' && w.getDayShort(k)==='PULL','editDayMeta updates name AND label');
// empty fields are no-ops (keep existing)
w.editDayMeta(k,'','');
ok(w.getDayName(k)==='Upper Pull' && w.getDayShort(k)==='PULL','editDayMeta with empty fields keeps existing values');
// label capped at 6 chars
w.setDayLabel(k,'TOOLONGLABEL');
ok(w.getDayShort(k).length<=6,'label capped to 6 chars ('+w.getDayShort(k)+')');

// ── the modal: openDayEdit prefills (rename) vs defaults (add) ──
w.openDayEdit(k);
ok(D.getElementById('day-edit-overlay').classList.contains('show'),'openDayEdit shows the modal');
// v3.41 contrast guard: inputs must use a theme-aware bg (var(--surface)), NOT the
// undefined var(--card) which fell back to white → invisible light text in dark mode.
['day-edit-name','day-edit-short'].forEach(function(id){
  var stl=D.getElementById(id).getAttribute('style')||'';
  ok(/var\(--surface\)/.test(stl) && !/var\(--card/.test(stl),id+' uses theme-aware var(--surface) bg (readable in dark mode)');
});
ok(D.getElementById('day-edit-name').value==='Upper Pull' && D.getElementById('day-edit-short').value===w.getDayShort(k),'rename mode prefills name + label');
w.closeDayEdit();
w.openDayEdit(null);
ok(/^D\d+$/.test(D.getElementById('day-edit-short').value) && D.getElementById('day-edit-name').value==='','add mode: blank name + suggested D{n} label');

// ── saveDayEdit add-path uses the fields ──
D.getElementById('day-edit-name').value='Legs B';
D.getElementById('day-edit-short').value='LEGB';
var before=w.getDays().length;
w.saveDayEdit();
ok(w.getDays().length===before+1,'saveDayEdit (add) creates the day');
var legKey=w.getDays().filter(function(dk){ return w.getDayName(dk)==='Legs B'; })[0];
ok(legKey && w.getDayShort(legKey)==='LEGB','saveDayEdit (add) applies the custom label');

// ── persists in synced config ──
ok(JSON.parse(ST.getItem('days_config_v1')).some(function(d){ return d.short==='LEGB' && d.name==='Legs B'; }),'custom label persists in days_config_v1 (synced)');

console.log('\n'+(fail?('DAY-EDIT SPOT-CHECK: '+fail+' FAILED'):'DAY-EDIT SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
