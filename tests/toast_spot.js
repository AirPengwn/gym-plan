'use strict';
// v3.27 — showToast(msg, opts): a plain auto-dismissing toast by default, but
// sync results can pass a longer duration or { sticky:true } so an important
// "synced ✓" / "sync failed" message stays until the user taps the ✕.
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
const T=D.getElementById('toast');

// ── plain toast (back-compatible single-arg call) ──
w.showToast('hello');
ok(T.classList.contains('show'),'plain toast shows');
ok(T.textContent==='hello','plain toast text set');
ok(!T.classList.contains('toast-sticky'),'plain toast is not sticky');

// ── numeric duration arg still renders a plain toast ──
w.showToast('held longer', 4000);
ok(T.classList.contains('show') && T.textContent==='held longer','numeric duration arg renders a plain toast');
ok(!T.classList.contains('toast-sticky'),'numeric duration arg is not sticky');

// ── sticky toast: stays, carries an ✕, dismiss on tap ──
w.showToast('⚠️ Cloud sync failed — data saved locally · boom', {sticky:true});
ok(T.classList.contains('show') && T.classList.contains('toast-sticky'),'sticky toast shows + carries the sticky class');
var x=T.querySelector('.toast-x');
var msg=T.querySelector('.toast-msg');
ok(!!x,'sticky toast renders a dismiss ✕ button');
ok(msg && /sync failed/.test(msg.textContent),'sticky toast keeps the message text');
x.dispatchEvent(new w.Event('click',{bubbles:true}));
ok(!T.classList.contains('show'),'tapping ✕ dismisses the sticky toast');

// ── a following plain toast clears the sticky chrome ──
w.showToast('Synced to cloud ☁ ✓', 4000);
ok(T.classList.contains('show') && !T.classList.contains('toast-sticky'),'a later plain toast clears sticky state');
ok(T.querySelector('.toast-x')===null && T.textContent.indexOf('Synced')!==-1,'later plain toast replaces sticky markup with plain text');

console.log('\n'+(fail?('TOAST SPOT-CHECK: '+fail+' FAILED'):'TOAST SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
