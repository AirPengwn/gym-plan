'use strict';
const fs=require('fs');const{JSDOM}=require('jsdom');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const ctx=new Proxy(function(){return ctx;},{get:()=>ctx,set:()=>true,apply:()=>ctx});
const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://s.test/',pretendToBeVisual:true,beforeParse(w){
 const m=new Map([['x','x']]);
 const mk=init=>{const z=new Map(Object.entries(init||{}));return{getItem:k=>z.has(k)?z.get(k):null,setItem:(k,v)=>z.set(''+k,''+v),removeItem:k=>z.delete(k),clear:()=>z.clear(),key:i=>{const a=[...z.keys()];return i<a.length?a[i]:null;},get length(){return z.size;}};};
 Object.defineProperty(w,'localStorage',{value:mk({}),configurable:true});
 Object.defineProperty(w,'sessionStorage',{value:mk({gym_test_mode:'1'}),configurable:true});
 w.fetch=()=>Promise.reject(new Error('no'));
 w.HTMLCanvasElement.prototype.getContext=()=>ctx;
 w.devicePixelRatio=1;w.scrollTo=()=>{};
 w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
 try{Object.defineProperty(w.location,'reload',{value(){},configurable:true});}catch(e){}
}});
const w=dom.window;
const M={front:['chest','tricep'],back:['lat'],frontLight:['quad'],backLight:[]};
const out=w.buildMuscleMapSVG(M);
const need=['FRONT','BACK','translate(45,18)','translate(205,18)','Strength','Cardio · engaged','Not worked'];
let ok=typeof out==='string'&&need.every(s=>out.indexOf(s)>=0);
w.document.body.classList.add('dark');
const outD=w.buildMuscleMapSVG(M);
const okD=outD.indexOf('#1A1A2E')>=0 && outD.indexOf('#9F97E0')>=0;
// vars present + referenced
const okVars = typeof w.MM_SILHOUETTE==='string' && w.MM_FRONT_REGIONS && w.MM_BACK_REGIONS && out.indexOf(w.MM_SILHOUETTE)>=0;
console.log('light render ok:'+ok+'  dark honored:'+okD+'  shared vars wired:'+okVars+'  len:'+out.length);
process.exit(ok&&okD&&okVars?0:1);
