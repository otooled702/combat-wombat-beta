/* ================================================================
   5. Stat sheets and images
   Per-creature stat sheets (DM only) and uploaded art.
   ================================================================ */

/* ---------- stat sheets (DM only) ---------- */

function blankSheet(){
  var ab={}; ABIL.forEach(function(a){ab[a[0]]={score:'',save:''};});
  return {ac:'',speed:'',ab:ab,resist:'',immune:'',vuln:'',attacks:'',notes:'',img:'',imgShow:true,initBonus:''};
}

function ensureSheet(obj){
  var b=blankSheet(); if(!obj.sheet)obj.sheet=b;
  var s=obj.sheet; Object.keys(b).forEach(function(k){if(s[k]==null)s[k]=b[k];});
  ABIL.forEach(function(a){if(!s.ab[a[0]])s.ab[a[0]]={score:'',save:''};});
  return s;
}

function hasSheet(s){
  if(!s)return false;
  if(s.ac||s.speed||s.resist||s.immune||s.vuln||s.attacks||s.notes||s.img)return true;
  return ABIL.some(function(a){var x=s.ab&&s.ab[a[0]];return x&&(x.score||x.save);});
}

function sheetSummary(s){
  if(!s)return ''; var p=[];
  if(s.speed)p.push(s.speed);
  if(s.resist)p.push('Resist: '+s.resist); if(s.immune)p.push('Immune: '+s.immune); if(s.vuln)p.push('Vuln: '+s.vuln);
  return p.join(' \u00b7 ');
}

function modText(v){var n=parseInt(v,10); if(isNaN(n))return '\u2013'; var m=Math.floor((n-10)/2); return (m>=0?'+':'')+m;}

function sheetTarget(kind,id){
  if(kind==='c')return byId(id);
  if(kind==='l')return libById(id);
  return partyById(id);
}

function syncSheet(kind,obj){
  if(kind==='c'&&obj.partyId){var p=partyById(obj.partyId); if(p)p.sheet=clone(obj.sheet);}
  if(kind==='p'){state.combatants.forEach(function(c){if(c.partyId===obj.id)c.sheet=clone(obj.sheet);});}
}

function autoSheet(c){
  if(!state.settings.autoStats)return;
  ui.sheet=(c&&hasSheet(c.sheet))?{kind:'c',id:c.id}:null;
}

function imgSrc(c){
  var sh=c.sheet; if(!sh||!sh.img)return null;
  if(sh.imgShow===false||state.settings.imgShow==='off')return null;
  return state.images[sh.img]||null;
}

