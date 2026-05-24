'use strict';
// v3.10 — saved-session display grouping (DISPLAY ONLY; stored entries untouched).
// Strength sets stay inline + their "-notes" fold under the exercise; cardio's
// per-field entries collapse under one clean, named <details> header.
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
ST.setItem('gymlog_b', JSON.stringify([{ label:'Day 2', date:'Sat, May 16, 2026', ts:Date.now(), entries:[
  {ex:'Leg press', note:'Set 1: 90 lbs | Set 2: 90 lbs | Set 3: 90 lbs'},
  {ex:'Leg press-notes', note:'Additional sled weighs 136 lbs'},
  {ex:'wu-treadmill-speed', note:'3 mph'},
  {ex:'wu-treadmill-incline', note:'3 degrees'},
  {ex:'wu-treadmill-duration', note:'5 min'},
  {ex:'wu-treadmill-distance', note:'0.23 mile'},
  {ex:'wu-treadmill-calories', note:'35'},
  {ex:'wu-treadmill-notes', note:'Mountain peaks'},
  {ex:'d2cardio-elliptical-speed', note:'120'},
  {ex:'d2cardio-elliptical-duration', note:'15 min'}
]}]));
const w=app(ST); const D=w.document;
w.renderProgress();
var feed=D.getElementById('sess-feed'); var html=feed?feed.innerHTML:'';

// helper-level checks
ok(w._humanizeCardioBase('wu-treadmill')==='Warm-up · Treadmill','humanize wu-treadmill → "Warm-up · Treadmill"');
ok(w._humanizeCardioBase('d2cardio-elliptical')==='Cardio · Elliptical','humanize d2cardio-elliptical → "Cardio · Elliptical"');

// strength stays inline
ok(/sess-lift-set/.test(html),'strength set chips still rendered inline');
ok(html.indexOf('Leg press')!==-1,'Leg press shown');

// strength notes folded under the exercise (NOT a separate cryptic row)
ok(html.indexOf('Additional sled weighs 136 lbs')!==-1,'strength note value shown');
ok(html.indexOf('Leg press-notes')===-1,'no raw "Leg press-notes" row (folded under Leg press)');

// cardio grouped into ONE collapsible per machine, with clean names
ok((html.match(/class="sess-cardio"/g)||[]).length===2,'two cardio bundles (treadmill + elliptical)');
ok(html.indexOf('Warm-up · Treadmill')!==-1 && html.indexOf('Cardio · Elliptical')!==-1,'cardio headers use clean names');
ok(html.indexOf('wu-treadmill-speed')===-1 && html.indexOf('d2cardio-elliptical')===-1,'no raw cardio data-ex keys leak into the view');
ok(html.indexOf('Mountain peaks')!==-1,'cardio notes field preserved inside the bundle');
ok(html.indexOf('5 min · 0.23 mile')!==-1,'treadmill summary shows duration · distance');

console.log('\n'+(fail?('SESSION-GROUP SPOT-CHECK: '+fail+' FAILED'):'SESSION-GROUP SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
