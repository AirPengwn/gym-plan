'use strict';
// Structural sanity for Phase 2b buildCardHTML: extract the 4 helpers from
// the live index.html and assert generated cards carry every hook the
// existing handlers/IIFEs depend on.
const fs=require('fs');
const idx=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
function grab(name){
  var i=idx.indexOf('function '+name+'(');
  if(i<0) throw new Error('not found: '+name);
  // brace-match
  var s=idx.indexOf('{',i), depth=0, j=s;
  for(;j<idx.length;j++){ if(idx[j]==='{')depth++; else if(idx[j]==='}'){depth--; if(depth===0){j++;break;}} }
  return idx.slice(i,j);
}
const src=[grab('_esc'),grab('_dash'),grab('_ytSearch'),grab('buildCardHTML')].join('\n');
const buildCardHTML=new Function(src+'\nreturn buildCardHTML;')();

function chk(label,html,musts){
  var bad=musts.filter(function(m){ return html.indexOf(m)<0; });
  console.log((bad.length?'FAIL':'ok  ')+' '+label+(bad.length?(' missing: '+bad.join(' | ')):''));
  return bad.length===0;
}
let ok=true;
var s=buildCardHTML({day:'a',domId:'ux1',type:'strength',name:'Test Press',histEx:'Test Press',sub:'3 × 12',loc:'rack',video:'http://v',badge:{cls:'bo',text:'new'},sets:3,notesPlaceholder:'np'});
ok&=chk('strength', s, ['<div class="item" id="ux1">','onclick="tog(\'ux1\',\'a\',9)"','class="ex-name">Test Press <span class="badge bo">new</span>','class="rep-input" oninput=','data-ex="Test Press" data-set="1"','data-ex="Test Press" data-set="3"','id="unit-Test-Press-s1"','class="last-time" id="lt-Test-Press"','data-ex="Test Press-notes"','class="ex-link" href="http://v"']);
ok&=chk('strength sets=3 → 3 rep-singles', s, []);
if((s.match(/class="rep-single"/g)||[]).length!==3){ console.log('FAIL rep-single count'); ok=false; } else console.log('ok   rep-single count=3');
var n=buildCardHTML({day:'c',domId:'ux2',type:'notes',name:'Plank',histEx:'Plank',sub:'3 holds',loc:'mat',video:'',badge:null,notesPlaceholder:'np2'});
ok&=chk('notes-only', n, ['<div class="item" id="ux2">','class="ex-name">Plank</div>','class="notes-input" data-ex="Plank"']);
if(n.indexOf('rep-row')>=0){ console.log('FAIL notes card has rep-row'); ok=false; } else console.log('ok   notes card has no rep-row');
// escaping
var e=buildCardHTML({day:'a',domId:'ux3',type:'notes',name:'A & "B" <x>',histEx:'A & "B" <x>',sub:'',loc:'',video:'',notesPlaceholder:''});
ok&=chk('escaping', e, ['ex-name">A &amp; &quot;B&quot; &lt;x&gt;</div>']);
console.log(ok?'\nBUILDCARD PASS':'\nBUILDCARD FAIL');
process.exit(ok?0:1);
