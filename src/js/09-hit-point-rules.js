/* ================================================================
   9. Hit point rules
   One implementation shared by the DM controls and by phone requests.
   ================================================================ */

function hpPct(c){return c.maxHp?Math.max(0,Math.min(100,Math.round(100*c.hp/c.maxHp))):0;}

function hpClass(c){
  if(c.hp<=0)return 'zero';
  var p=c.maxHp?c.hp/c.maxHp:1;
  return p>0.75?'ok':p>0.5?'wound':p>=0.1?'mid':'crit';
}

function hpStatus(c){
  if(c.hp<=0)return isSide(c)?'Down':'Defeated';
  var k=hpClass(c); return k==='ok'?'Healthy':k==='wound'?'Wounded':k==='mid'?'Bloodied':'Critical';
}

function hpMode(c){
  if(isSide(c))return state.settings.pcHp;
  var g=state.settings.npcHp;
  var ov=c.hpMode||(c.hpShow===true?'bar':(c.hpShow===false?'status':null));
  if(ov)return ov;
  return g;
}

function memDamage(c,m,am){var tt=m.temp||0,u=Math.min(tt,am); m.temp=tt-u; m.hp=Math.max(0,m.hp-(am-u)); if(m.hp===0)notes.push(c.name+' '+m.n+' is down');}
function memHeal(m,am){m.hp=Math.min(m.maxHp,m.hp+am);}
function memTemp(m,am){if(am>(m.temp||0)){m.temp=am;return true;} notes.push('Kept the higher temp HP'); return false;}

function hpDamage(c,amt){
  var t=c.temp||0, used=Math.min(t,amt), real=amt-used, before=c.hp, side=isSide(c);
  var wasZero=(side&&before===0&&c.death&&!c.death.dead);
  c.temp=t-used; c.hp=Math.max(0,before-real);
  if(side&&c.maxHp!=null&&real>0&&(real-before)>=c.maxHp){goDown(c);c.death.f=3;c.death.dead=true;notes.push(c.name+' is killed outright by massive damage');}
  else if(wasZero&&real>0){
    if(c.death.stable)c.death={s:0,f:1,hide:c.death.hide}; else c.death.f=Math.min(3,c.death.f+1);
    if(c.death.f>=3){c.death.dead=true;notes.push(c.name+' has died');} else notes.push(c.name+' takes a death save failure from the damage');
  }
}
function hpHeal(c,amt){var v=c.hp+amt; if(c.maxHp!=null)v=Math.min(c.maxHp,v); c.hp=v;}
function hpTemp(c,amt){if(amt>(c.temp||0)){c.temp=amt;return true;} notes.push('Kept the higher temp HP ('+c.temp+')'); return false;}

/* Dice and saving throws. A save uses the typed save bonus when there is one, otherwise the
   ability modifier. Conditions are honoured: Paralyzed, Stunned, Unconscious and Petrified
   fail Strength and Dexterity saves outright, and Restrained gives Disadvantage on Dexterity. */
function d20(){return 1+Math.floor(Math.random()*20);}
function sgn(n){return (n>=0?'+':'\u2212')+Math.abs(n);}
function abMod(score){var n=parseInt(score,10); return isNaN(n)?0:Math.floor((n-10)/2);}
function abOf(sheet,key){return (sheet&&sheet.ab&&sheet.ab[key])||{score:'',save:''};}
function dexMod(sheet){return abMod(abOf(sheet,'dex').score);}
function saveBonus(sheet,key){var x=abOf(sheet,key), v=parseInt(x.save,10); return isNaN(v)?abMod(x.score):v;}
function hasCond(c,n){return c.conditions.some(function(x){return x.name===n;});}
function rollInit(sheet,extra){var ib=parseInt(sheet&&sheet.initBonus,10), r=d20(), m=(isNaN(ib)?dexMod(sheet):ib)+(extra||0); return {r:r,m:m,t:r+m};}
function rollSave(c,key,mode){
  var b=saveBonus(c.sheet,key), note='';
  if(key==='str'||key==='dex'){
    var af=['Paralyzed','Stunned','Unconscious','Petrified'].filter(function(n){return hasCond(c,n);})[0];
    if(af)return {auto:true,b:b,t:-1,note:'automatically fails while '+af};
  }
  if(key==='dex'&&hasCond(c,'Restrained')){mode=(mode==='adv')?'n':'dis'; note='Restrained';}
  var r1=d20(), r2=(mode==='adv'||mode==='dis')?d20():null;
  var r=r2==null?r1:(mode==='adv'?Math.max(r1,r2):Math.min(r1,r2));
  return {r:r,r1:r1,r2:r2,mode:mode||'n',b:b,t:r+b,note:note};
}
function saveLine(r,key){
  var k=key.toUpperCase();
  if(r.auto)return k+' '+r.note;
  return k+' '+r.t+' (d20 '+(r.r2==null?r.r:r.r1+' and '+r.r2+', '+(r.mode==='adv'?'Advantage':'Disadvantage')+' \u2192 '+r.r)+' '+sgn(r.b)+')'+(r.note?' \u00b7 '+r.note:'');
}

