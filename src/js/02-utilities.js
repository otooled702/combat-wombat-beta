/* ================================================================
   2. Utilities
   Small helpers with no knowledge of the app.
   ================================================================ */

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});}

function uid(){return 'x'+Date.now().toString(36)+Math.floor(Math.random()*46656).toString(36);}

function clone(o){return o==null?o:JSON.parse(JSON.stringify(o));}

function num(v){var n=parseFloat(v);return isNaN(n)?null:n;}

function fmt(s){
  var h=Math.floor(s/3600), m=Math.floor((s%3600)/60), x=s%60;
  return (h?h+':'+(m<10?'0':''):'')+m+':'+(x<10?'0':'')+x;
}

function cap(s){return s.charAt(0).toUpperCase()+s.slice(1);}

/* "Goblin 3" -> "Goblin": the name a numbered creature was made from. */
function baseName(n){return String(n||'').replace(/\s+\d+$/,'');}

/* localStorage can be missing or blocked (private windows, previews), so every read and write goes through these. */
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}
function lsDel(k){try{localStorage.removeItem(k);}catch(e){}}

function focusEl(sel){var el=document.querySelector(sel); if(el)el.focus(); return el;}
