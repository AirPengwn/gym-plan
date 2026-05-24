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
  }}).window;
}
let fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };

const ST=store();
const w=app(ST);

// ── Defaults match the original 5-day cycle ──
ok(typeof w.getDays==='function','API · getDays exposed');
ok(JSON.stringify(w.getDays())==='["a","b","c","d","e"]','default · getDays() = a,b,c,d,e');
ok(w.getDayName('a')==='Day 1 — Upper A','default · day a name = session label');
ok(w.getDayName('e')==='Day 5 — Lower B + Cardio','default · day e name = "Lower B + Cardio" (session label, not selector aria)');
ok(w.getDayShort('a')==='D1','default · day a short = D1');
ok(w.getDayNum('c')===3,'default · day c num = 3');
ok(w.getDayConfig('z')===null,'default · unknown key → null config');
ok(w.getDayName('z')==='Day Z','default · unknown key → graceful fallback name');

// ── Config persists + reads back ──
var custom=[{key:'a',name:'Push',short:'P'},{key:'b',name:'Pull',short:'Pl'},{key:'c',name:'Legs',short:'L'}];
w.saveDaysConfig(custom);
ok(JSON.stringify(w.getDays())==='["a","b","c"]','custom · getDays() reflects saved 3-day config');
ok(w.getDayName('b')==='Pull','custom · day b name = Pull');
ok(w.getDayNum('c')===3,'custom · day c num = 3 (index-based)');

// ── Bad config falls back to default ──
ST.setItem('days_config_v1','not json');
ok(JSON.stringify(w.getDays())==='["a","b","c","d","e"]','robust · malformed config → default');
ST.setItem('days_config_v1','[]');
ok(JSON.stringify(w.getDays())==='["a","b","c","d","e"]','robust · empty array → default');
ST.setItem('days_config_v1','[{"name":"no key"}]');
ok(JSON.stringify(w.getDays())==='["a","b","c","d","e"]','robust · entries without key → default');

// ── Sync payload round-trips the config ──
w.saveDaysConfig(custom);
var payload=w.buildBinPayload();
ok(Array.isArray(payload['days_config_v1']) && payload['days_config_v1'].length===3,'sync · buildBinPayload includes days_config_v1');
// applyPayloadToLocal writes it back
ST.removeItem('days_config_v1');
w.applyPayloadToLocal({ days_config_v1:[{key:'x',name:'X',short:'X'}] });
ok(ST.getItem('days_config_v1')!==null,'sync · applyPayloadToLocal writes days_config_v1');
ok(JSON.stringify(w.getDays())==='["x"]','sync · applied config reflected by getDays');

// ── mergeCloudIntoPayload: local wins when local has sessions ──
ST.setItem('gymlog_a', JSON.stringify([{label:'D',date:'x',entries:[]}]));
w.saveDaysConfig([{key:'a',name:'Local',short:'L'}]);
var merged=w.mergeCloudIntoPayload({ days_config_v1:[{key:'a',name:'Cloud',short:'C'},{key:'b',name:'Cloud2',short:'C2'}] });
ok(merged['days_config_v1'].length===1 && merged['days_config_v1'][0].name==='Local','merge · local config wins when local has sessions');

// ── mergeCloudIntoPayload: cloud fallback on true wipe ──
['a','b','c','d','e'].forEach(d=>ST.removeItem('gymlog_'+d));
ST.removeItem('days_config_v1');
var merged2=w.mergeCloudIntoPayload({ days_config_v1:[{key:'a',name:'CloudOnly',short:'C'}] });
ok(merged2['days_config_v1'] && merged2['days_config_v1'][0].name==='CloudOnly','merge · cloud config restored on a true wipe (no local sessions, no local config)');

console.log('\n'+(fail?('DAY-CONFIG SPOT-CHECK: '+fail+' FAILED'):'DAY-CONFIG SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
