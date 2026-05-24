'use strict';
// Near-duplicate exercise-name analyzer. Compares EXERCISE_CATALOG names against
// (a) each other and (b) the built-in plan exercises, flagging likely "same
// movement, different name" pairs so we don't add redundant library entries.
//
// HARD FAIL (exit 1): an EXACT normalized duplicate *within* the catalog (a real
// bug — _catalogFind would shadow one). NEAR-dup pairs are printed as warnings.
const fs=require('fs');const{JSDOM}=require('jsdom');
const HTML=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
function store(i){const m=new Map(Object.entries(i||{}));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(''+k,''+v),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:x=>{const a=[...m.keys()];return x<a.length?a[x]:null},get length(){return m.size}};}
const ctx=new Proxy(function(){return ctx},{get:()=>ctx,set:()=>true,apply:()=>ctx});
const w=new JSDOM(HTML,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  Object.defineProperty(w,'localStorage',{value:store(),configurable:true});
  Object.defineProperty(w,'sessionStorage',{value:store({gym_test_mode:'1'}),configurable:true});
  w.fetch=()=>Promise.reject(new Error('no')); w.HTMLCanvasElement.prototype.getContext=()=>ctx;
}}).window;

function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim(); }
var FILLER={machine:1,seated:1,standing:1,barbell:1,dumbbell:1,db:1,bb:1,cable:1,the:1,a:1,with:1,grip:1,bar:1,rope:1,straight:1,wide:1,close:1,single:1,arm:1,two:1,one:1,assisted:1,attachment:1,low:1,high:1,to:1,'2':1,'3':1};
function core(name){ return norm(name).split(' ').filter(function(t){ return t && !FILLER[t]; }).sort(); }
function coreKey(name){ return core(name).join(' '); }

var catNames=w.EXERCISE_CATALOG.map(function(e){return e.name;});
var model=w.buildExerciseModel();
var builtinNames=Object.keys(model.ex).map(function(k){return model.ex[k].name;}).filter(Boolean);
var builtinUniq=[]; var seenB={}; builtinNames.forEach(function(n){ var k=norm(n); if(!seenB[k]){seenB[k]=1;builtinUniq.push(n);} });

console.log('catalog entries: '+catNames.length+' · built-in exercises: '+builtinUniq.length);

// 1) exact normalized dups WITHIN the catalog → hard fail
var byNorm={}, exactDup=[];
catNames.forEach(function(n){ var k=norm(n); if(byNorm[k]) exactDup.push(n+'  ==  '+byNorm[k]); else byNorm[k]=n; });

// 2) catalog name that EXACTLY matches a built-in (intended alias — informational)
var exactBuiltin=catNames.filter(function(n){ return seenB[norm(n)]; });

// 3) NEAR-dup pairs (same core tokens, or one contains the other) — warnings
function nearPairs(a, b, sameList){
  var out=[];
  a.forEach(function(x){
    b.forEach(function(y){
      if(sameList && norm(x)>=norm(y)) return;        // avoid dup pairs / self
      if(norm(x)===norm(y)) return;                    // exact handled elsewhere
      var cx=coreKey(x), cy=coreKey(y);
      if(!cx||!cy) return;
      var contains=(norm(x).indexOf(norm(y))!==-1)||(norm(y).indexOf(norm(x))!==-1);
      if(cx===cy || contains) out.push(x+'  ~  '+y);
    });
  });
  return out;
}
var nearVsBuiltin=nearPairs(catNames, builtinUniq, false);
var nearInCatalog=nearPairs(catNames, catNames, true);

console.log('\n── EXACT catalog↔built-in matches (intended aliases) ──');
console.log(exactBuiltin.length?('  '+exactBuiltin.join('\n  ')):'  none');
console.log('\n── NEAR-dup: catalog vs built-in (review — maybe redundant) ──');
console.log(nearVsBuiltin.length?('  '+nearVsBuiltin.join('\n  ')):'  none');
console.log('\n── NEAR-dup: within catalog (review) ──');
console.log(nearInCatalog.length?('  '+nearInCatalog.join('\n  ')):'  none');

if(exactDup.length){ console.error('\nEXACT DUPLICATE within catalog (FAIL):\n  '+exactDup.join('\n  ')); process.exit(1); }
console.log('\nNo exact intra-catalog duplicates. (near-dups above are advisory)');
process.exit(0);
