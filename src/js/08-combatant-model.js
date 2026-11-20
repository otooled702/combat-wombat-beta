/* ================================================================
   8. Combatant model
   Sides, groups, armor class, conditions, death state, adding creatures.
   ================================================================ */

function partyById(id){return state.party.find(function(x){return x.id===id;});}
function libById(id){return state.library.find(function(x){return x.id===id;});}

function isGroup(c){return !!(c.members&&c.members.length);}

function isSide(c){return c.kind==='pc'||c.disp==='ally';}

function sideClass(c){
  if(c.kind==='pc')return 'pc';
  if(c.disp==='ally')return 'pc ally';
  if(c.disp==='neutral')return 'neutral';
  return 'npc';
}

function makeMembers(count,hp){
  var out=[]; for(var i=0;i<count;i++)out.push({id:uid(),n:i+1,hp:hp==null?null:hp,maxHp:hp==null?null:hp,temp:0,rx:false});
  return out;
}

function roleMark(c){return c.kind==='pc'?'\u25c6 Player':(c.disp==='ally'?'\u25c7 Ally':(c.disp==='neutral'?'\u25cb Neutral':'\u25b2 Foe'));}
function isDown(c){
  if(isSide(c))return !!(c.death&&c.death.dead);
  if(!tracks(c))return false;
  if(isGroup(c))return c.members.every(function(m){return m.hp!=null&&m.hp<=0;});
  return c.hp===0;
}

function tracks(c){return isSide(c)?state.settings.trackPC:state.settings.trackNPC;}

function acBase(c){var n=parseInt(c.sheet&&c.sheet.ac,10);return isNaN(n)?null:n;}

function acTotal(c){var b=acBase(c);return b==null?null:b+(c.acMod||0);}

function acShown(c){
  var m=state.settings.acShow;
  if(m==='none')return false; if(m==='all')return true;
  return c.acShow!=null?!!c.acShow:isSide(c);
}

function acVisible(c){return acShown(c)&&acTotal(c)!=null;}

function condInfoText(cd){
  var t=COND_INFO[cd.name]; if(!t)return '';
  if(cd.name==='Exhaustion'&&cd.level)t='Level '+cd.level+': D20 Tests \u2212'+(2*cd.level)+', Speed \u2212'+(5*cd.level)+' ft.'+(cd.level>=6?' This level is fatal.':'')+' '+t;
  return t;
}

function condLabel(cd){return cd.name+(cd.level?' '+cd.level:'');}

function owner(id,c){
  if(id===c.id)return isSide(c)?'their':'its';
  var o=byId(id); return o?o.name+'\u2019s':'someone\u2019s';
}

function durText(cd,c){
  var d=cd.dur;
  if(d.type==='start')return 'until start of '+owner(d.ownerId,c)+' next turn';
  if(d.type==='end')return 'until end of '+owner(d.ownerId,c)+' next turn';
  if(d.type==='rounds')return 'until round '+d.round;
  return '';
}

function endedAdd(c,cd){(c.ended=c.ended||[]).push({id:uid(),label:condLabel(cd),g:state.egen||0,at:Date.now()});}

function liveEnded(c){var g=state.egen||0;return (c.ended||[]).filter(function(e){return e.g===g;});}

function bumpEnded(){state.egen=(state.egen||0)+1;state.combatants.forEach(function(c){if(c.ended)c.ended=c.ended.filter(function(e){return e.g>=state.egen;});});}

function spendLR(c){c.leg.rleft--; notes.push(c.name+' uses Legendary Resistance ('+c.leg.rleft+' left)');}

function resetRx(c){c.rx=false;(c.members||[]).forEach(function(m){m.rx=false;});}

function dropAutoUnconscious(c){c.conditions=c.conditions.filter(function(x){if(x.auto&&x.name==='Unconscious'){endedAdd(c,x);return false;}return true;});}

function goDown(c){
  if(!c.death)c.death={s:0,f:0};
  c.ready=null;
  if(!c.conditions.some(function(x){return x.name==='Unconscious';}))c.conditions.push({id:uid(),name:'Unconscious',level:null,dur:{type:'manual'},auto:true});
}

function ensureDeath(c){
  if(isGroup(c))return;
  if(!isSide(c)){if(c.death){c.death=null;dropAutoUnconscious(c);}return;}
  if(c.hp===0&&!c.death)goDown(c);
  else if(c.hp>0&&c.death){c.death=null;dropAutoUnconscious(c);}
}

function deathApply(c,kind){
  var d=c.death; if(!d)return;
  if(kind==='reset'){c.death={s:0,f:0,hide:d.hide};return;}
  if(d.stable||d.dead)return;
  if(kind==='nat20'){c.hp=1;c.death=null;notes.push(c.name+' rolls a natural 20 and is back up with 1 HP');return;}
  if(kind==='success')d.s=Math.min(3,d.s+1);
  else if(kind==='fail')d.f=Math.min(3,d.f+1);
  else if(kind==='nat1')d.f=Math.min(3,d.f+2);
  if(d.s>=3){d.stable=true;notes.push(c.name+' is stable');}
  if(d.f>=3){d.dead=true;notes.push(c.name+' has died');}
}

function addCombatant(o){
  var c={id:uid(),name:o.name,player:o.player||'',kind:o.kind,init:o.init,seq:state.seq++,
    hp:o.members?null:(o.hp==null?null:o.hp),maxHp:o.members?null:(o.maxHp==null?null:o.maxHp),hidden:!!o.hidden,partyId:o.partyId||null,
    sheet:o.sheet?clone(o.sheet):null,temp:0,conditions:[],rx:false,ready:null,
    leg:o.leg?clone(o.leg):null,members:o.members||null,disp:o.kind==='pc'?null:(o.disp||'enemy'),src:o.src||null};
  state.combatants.push(c); return c;
}

function addPartyToFight(p,init){
  var hp=p.hp!=null?p.hp:(p.maxHp!=null?p.maxHp:null);
  addCombatant({name:p.name,player:p.player,kind:'pc',init:init,hp:hp,maxHp:p.maxHp!=null?p.maxHp:null,partyId:p.id,sheet:p.sheet});
}

function numberedNames(base,qty){
  var re=new RegExp('^'+base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'( \\d+)?$','i');
  var existing=state.combatants.filter(function(c){return c.kind==='npc'&&re.test(c.name);}).length, out=[];
  if(qty===1&&existing===0)return [base];
  for(var i=0;i<qty;i++)out.push(base+' '+(existing+i+1));
  return out;
}

/* A saved entry is a monster when it came from the Book of Beasts, was made as a custom monster, or is named like a Book creature. */
function mmByName(n){var l=baseName(n).trim().toLowerCase(); return mmData().some(function(m){return m.n.toLowerCase()===l;});}
function monSrc(e){return e.src||(mmByName(e.name)?'mm':'npc');}
/* Save to Library from a card: a Book creature just gets starred, unless it was changed, in which case it is kept as Modified. */
function cardToLibrary(c){
  var base=baseName(c.name).trim()||c.name, mh=isGroup(c)?c.members[0].maxHp:c.maxHp, star=function(k){if(state.stars.indexOf(k)<0)state.stars.push(k);};
  var srd=(c.src==='mm'||(!c.src&&mmSrdByName(base)))?mmSrdByName(base):null;
  if(srd){
    if(mh===srd.h&&JSON.stringify(c.sheet)===JSON.stringify(mmSheet(srd))){star('srd:'+srd.n); persist(); return 'Starred '+srd.n+' \u2014 find it in Library \u2192 Saved';}
    var nm=base.toLowerCase()===srd.n.toLowerCase()?base+' (modified)':base, ex=state.library.find(function(x){return (x.src==='mod'||x.src==='custom')&&x.name.toLowerCase()===nm.toLowerCase();});
    if(ex){ex.maxHp=mh; ex.sheet=clone(c.sheet)||ex.sheet; star('hb:'+ex.id); persist(); return 'Updated '+nm+' in your Library';}
    var e={id:uid(),name:nm,maxHp:mh,sheet:clone(c.sheet)||mmSheet(srd),leg:c.leg?{max:c.leg.max,rmax:c.leg.rmax}:mmLeg(srd),disp:c.disp||'enemy',src:'mod',base:srd.n,meta:{type:(srd.z+' '+srd.t.toLowerCase()).trim(),cr:srd.crt}};
    state.library.push(e); star('hb:'+e.id); persist(); return 'Saved '+nm+' as a modified '+srd.n+' (starred)';
  }
  if(c.src==='custom'||c.src==='mod'){
    var own=state.library.find(function(x){return x.name.toLowerCase()===base.toLowerCase()&&(x.src==='custom'||x.src==='mod');});
    if(own){own.maxHp=mh; own.sheet=clone(c.sheet)||own.sheet; star('hb:'+own.id); persist(); return 'Updated '+own.name+' in your Library';}
  }
  return saveToLibrary(c.name,mh,c.sheet,c.leg,c.disp,'npc');
}
function saveToLibrary(name,maxHp,sheet,leg,disp,src){
  var base=baseName(name).trim()||name, lc=base.toLowerCase();
  var ex=state.library.find(function(x){return x.name.toLowerCase()===lc;});
  var lg=leg?{max:leg.max,rmax:leg.rmax}:null;
  if(ex){ex.maxHp=maxHp;ex.sheet=clone(sheet)||ex.sheet;ex.leg=lg||ex.leg||null;ex.disp=disp||ex.disp||'enemy';if(src)ex.src=src;persist();return 'Updated '+base+' in your library';}
  state.library.push({id:uid(),name:base,maxHp:maxHp,sheet:clone(sheet)||blankSheet(),leg:lg,disp:disp||'enemy',src:src||(mmByName(base)?'mm':'npc')}); persist();
  return 'Saved '+base+' to your library';
}

