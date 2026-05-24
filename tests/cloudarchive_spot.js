'use strict';
// v3.8 — cloud archive (rollback) pure-logic checks. The archive bin id travels
// in the sync payload so every device discovers the same archive; reader devices
// never write the archive. (Network paths aren't exercised here — fetch is stubbed.)
const fs=require('fs');const{JSDOM}=require('jsdom');
const HTML=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
function store(i){const m=new Map(Object.entries(i||{}));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(''+k,''+v),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:x=>{const a=[...m.keys()];return x<a.length?a[x]:null},get length(){return m.size}};}
function app(st,sess){
  const ctx=new Proxy(function(){return ctx},{get:()=>ctx,set:()=>true,apply:()=>ctx});
  return new JSDOM(HTML,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
    Object.defineProperty(w,'localStorage',{value:st,configurable:true});
    Object.defineProperty(w,'sessionStorage',{value:store(sess||{}),configurable:true});
    w.fetch=()=>Promise.reject(new Error('no-net'));
    w.HTMLCanvasElement.prototype.getContext=()=>ctx;
    w.confirm=()=>true; w.prompt=()=>'';
  }}).window;
}
let fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };

// ── archive id round-trips + travels in the payload ──
const ST=store(); ST.setItem('gym_primary_device','1');
const w=app(ST,{});
w._setArchiveId('BIN_ABC');
ok(w._archiveId()==='BIN_ABC','archive id persists locally');
ok(w.buildBinPayload()['__archive_bin']==='BIN_ABC','archive id rides the sync/backup payload');

// ── a device with no archive id adopts it from the cloud during merge ──
const ST2=store(); ST2.setItem('gym_primary_device','1');
const w2=app(ST2,{});
ok(!w2._archiveId(),'fresh device has no archive id');
var merged=w2.mergeCloudIntoPayload({ __schema:2, __archive_bin:'BIN_FROM_CLOUD' });
ok(w2._archiveId()==='BIN_FROM_CLOUD','merge adopts the cloud archive id (discovery)');
ok(merged['__archive_bin']==='BIN_FROM_CLOUD','merged payload carries the archive id forward');

// ── reader devices never write the cloud archive ──
const ST3=store(); // NO gym_primary_device → reader
const w3=app(ST3,{});
ok(typeof w3.maybeArchiveToCloud==='function','maybeArchiveToCloud exists');
w3.maybeArchiveToCloud(null); // reader → early return, no throw, no timestamp
ok(!ST3.getItem('jsonbin_archive_last'),'reader device does not archive (no write timestamp)');

// ── test mode never archives ──
const ST4=store(); ST4.setItem('gym_primary_device','1');
const w4=app(ST4,{gym_test_mode:'1'});
w4.maybeArchiveToCloud(null);
ok(!ST4.getItem('jsonbin_archive_last'),'test mode does not archive');

// ── v3.26 self-healing loadCloudArchive: a stale/unreadable local bin id is
//    dropped and re-resolved from the live cloud (this was the iPhone "load
//    failed" — a stored id pointing at a bin that wouldn't read). ──
const delay=()=>new Promise(r=>setTimeout(r,0));
function router(map){
  return function(url){
    url=String(url);
    if(/\/latest$/.test(url)){           // _archiveGET(id) → /v3/b/{id}/latest
      var hit=Object.keys(map.bins||{}).filter(function(b){ return url.indexOf('/'+b+'/latest')!==-1; })[0];
      if(hit) return Promise.resolve({ok:true,json:()=>Promise.resolve(map.bins[hit])});
      return Promise.reject(new Error('Load failed'));      // unknown/stale bin → network reject
    }
    // else the main bin GET (cloudGET hits JBIN_URL, no /latest)
    if(map.cloud==='unreachable') return Promise.reject(new Error('Load failed'));
    return Promise.resolve({ok:true,json:()=>Promise.resolve(map.cloud||{})});
  };
}
(async function(){
  // (a) stale local id rejects → heals to the cloud's good bin → renders snapshots
  const STH=store(); STH.setItem('gym_primary_device','1');
  const wh=app(STH,{});
  wh.fetch=router({ cloud:{__schema:2,__archive_bin:'GOODBIN'}, bins:{ GOODBIN:{snapshots:[{ts:Date.now(),n:5,data:{}}]} } });
  wh._setArchiveId('STALEBIN');           // a bad id that won't read
  wh.loadCloudArchive();
  for(var i=0;i<8;i++){ await delay(); }
  const wrapH=wh.document.getElementById('cloud-archive-wrap');
  ok(/snap-row/.test(wrapH.innerHTML),'self-heal: stale archive id recovers + renders the cloud snapshot');
  ok(wh._archiveId()==='GOODBIN','self-heal: the stale id is replaced with the live cloud bin id');

  // (b) no archive anywhere → friendly soft message, not "load failed"
  const STN=store(); STN.setItem('gym_primary_device','1');
  const wn=app(STN,{});
  wn.fetch=router({ cloud:{__schema:2} });   // cloud has NO __archive_bin
  wn.loadCloudArchive();
  for(var j=0;j<8;j++){ await delay(); }
  const wrapN=wn.document.getElementById('cloud-archive-wrap');
  ok(/No cloud archive yet/.test(wrapN.innerHTML),'no archive yet → clear soft message (no scary error)');
  ok(!/load failed/i.test(wrapN.innerHTML),'no archive yet → never surfaces raw "load failed"');

  // (c) cloud truly unreachable → honest error, other backups noted, no crash
  const STU=store(); STU.setItem('gym_primary_device','1');
  const wu=app(STU,{});
  wu.fetch=router({ cloud:'unreachable' });
  wu.loadCloudArchive();
  for(var k=0;k<8;k++){ await delay(); }
  const wrapU=wu.document.getElementById('cloud-archive-wrap');
  ok(/other backups are unaffected/i.test(wrapU.innerHTML),'cloud unreachable → honest message reassuring other backups are safe');

  console.log('\n'+(fail?('CLOUD-ARCHIVE SPOT-CHECK: '+fail+' FAILED'):'CLOUD-ARCHIVE SPOT-CHECK: ALL PASS'));
  process.exit(fail?1:0);
})();
