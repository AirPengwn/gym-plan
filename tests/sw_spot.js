'use strict';
// v3.7 — service worker sanity: sw.js parses, uses network-first for HTML, never
// intercepts non-GET or cross-origin (so JSONbin sync is untouched), and
// index.html registers it with a relative path (works under a Pages subpath).
const fs=require('fs');
const ROOT=(require('path').join(__dirname,'..')+require('path').sep);
let fail=0; const ok=(c,l)=>{console.log((c?'  PASS ':'  FAIL ')+l); if(!c) fail++; };

var sw=fs.readFileSync(ROOT+'sw.js','utf8');
// syntax check (compile without executing — self/caches are never invoked here)
var parsed=true; try{ new Function(sw); }catch(e){ parsed=false; console.log('   parse error:',e.message); }
ok(parsed,'sw.js parses without syntax errors');
ok(/method\s*!==\s*'GET'/.test(sw),'sw.js bails out on non-GET (cloud PUT untouched)');
ok(/url\.origin\s*!==\s*self\.location\.origin/.test(sw),'sw.js passes through cross-origin (JSONbin/YouTube untouched)');
ok(/fetch\(req\)[\s\S]*caches\.match/.test(sw),'sw.js is network-first for HTML (fresh when online, cache fallback offline)');
ok(/caches\.delete/.test(sw) && /CACHE_VERSION/.test(sw),'sw.js purges old caches on activate (versioned)');
ok(/skipWaiting/.test(sw) && /clients\.claim/.test(sw),'sw.js takes over promptly (skipWaiting + clients.claim)');

var html=fs.readFileSync(ROOT+'index.html','utf8');
ok(/serviceWorker\.register\('sw\.js'\)/.test(html),'index.html registers sw.js with a relative path');
ok(/'serviceWorker'\s*in\s*navigator/.test(html),'registration is guarded (skips where unsupported)');

console.log('\n'+(fail?('SW SPOT-CHECK: '+fail+' FAILED'):'SW SPOT-CHECK: ALL PASS'));
process.exit(fail?1:0);
