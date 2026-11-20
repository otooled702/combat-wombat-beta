/* ================================================================
   26. Target
   One dialog for area effects: tick who is hit, choose Full or Half for each, and
   optionally roll a saving throw for the monsters (players are marked by hand).
   A pass becomes Half or No damage (your choice), a fail stays Full. Everything
   lands as one step, so a single Undo takes it back.
   ================================================================ */

var AOE_KINDS=[['dmg','Damage'],['spell','Spells'],['cond','Condition'],['heal','Heal']];
var DMG_TYPES=['untyped','bludgeoning','piercing','slashing','acid','cold','fire','force','lightning','necrotic','poison','psychic','radiant','thunder'];
function dmgTypeLabel(ty){return ty==='untyped'?'Unspecified':cap(ty);}

/* ---------- Spells (SRD 5.2) ---------- */
var SPELLS=[]; try{SPELLS=JSON.parse(document.getElementById('spdata').textContent);}catch(e){}
var SPELL_BY={}; SPELLS.forEach(function(x){SPELL_BY[x.n]=x;});
var SP_CLASS={Bd:'Bard',Cl:'Cleric',Dr:'Druid',Pa:'Paladin',Rn:'Ranger',So:'Sorcerer',Wl:'Warlock',Wz:'Wizard'};
var SP_CLASS_AB={Bd:'cha',Pa:'cha',So:'cha',Wl:'cha',Cl:'wis',Dr:'wis',Rn:'wis',Wz:'int'};
var SP_SCHOOL={Abj:'Abjuration',Con:'Conjuration',Div:'Divination',Enc:'Enchantment',Evo:'Evocation',Ill:'Illusion',Nec:'Necromancy',Tra:'Transmutation'};
function spellIncluded(x){var o=state.spellOpt&&state.spellOpt[x.n]; return o===undefined?!!x.df:!!o;}
function spLv(x){return x.l===0?'Cantrip':'Level '+x.l;}
function spCastTime(x){return {A:'Action',BA:'Bonus action',R:'Reaction'}[x.t]||x.t;}
function spEffect(x){
  var bits=[];
  if(x.at)bits.push((x.at==='m'?'Melee':'Ranged')+' attack');
  if(x.sv)bits.push(x.sv.toUpperCase()+' save');
  if(x.dm){var d=x.dp?x.dp.map(function(p){return p[0]+' '+p[1];}).join(' + '):x.dm+(x.dt&&x.dt.length===1?' '+x.dt[0]:''); bits.push(d+(x.ok==='half'?' (half on save)':''));}
  if(x.cd&&x.cd.length)bits.push(x.cd.join(' / '));
  if(x.hf==='full')bits.push('Heals to full');
  else if(x.hl)bits.push('Heals '+x.hl+(x.hm?' + modifier':'')+(x.hx?', divided':''));
  return bits.join(' \u00b7 ');
}
function spMeta(x){return [spLv(x)+' '+(SP_SCHOOL[x.s]||x.s).toLowerCase(),spCastTime(x),x.r,x.sh,x.du,x.co?'Concentration':''].filter(Boolean).join(' \u00b7 ');}
function rollDice(expr){
  var tot=0, bits=[];
  String(expr||'').replace(/\s+/g,'').replace(/([+-]?)(\d+)(?:d(\d+))?/g,function(m,sg,a,b){
    var sign=sg==='-'?-1:1;
    if(b){var n=Math.min(100,parseInt(a,10)), f=Math.max(1,parseInt(b,10)), rs=[], sum=0; for(var i=0;i<n;i++){var r=1+Math.floor(Math.random()*f); rs.push(r); sum+=r;} tot+=sign*sum; bits.push((sign<0?'\u2212 ':'')+a+'d'+b+' ['+rs.join(', ')+']');}
    else{tot+=sign*parseInt(a,10); bits.push((sign<0?'\u2212 ':'+ ')+a);}
    return m;});
  return {total:Math.max(0,tot),text:bits.join(' ').replace(/^\+ /,'')};
}
function spParts(x,q){
  if(!x.dm)return [];
  if(x.dp)return x.dp.map(function(p){return {dice:p[0],type:p[1],sv:p[2]!==0};});
  var dice=x.dm;
  if(x.l===0&&!x.xt&&x.cu)dice=([x.dm].concat(x.cu))[q.tier||0]||x.dm;
  else if(x.l>0&&x.up&&x.up[String(q.slot)])dice=x.up[String(q.slot)];
  return [{dice:dice,type:q.type||(x.dt&&x.dt[0])||'untyped',sv:true}];
}
function spCount(x,q){
  if(x.xt)return x.xt[q.tier||0]||1;
  if(x.x)return x.x+(x.xl||0)*Math.max(0,(q.slot||x.l)-(x.xb||x.l));
  return 1;
}
function spCastInfo(x,casterId){
  var c=casterId?byId(casterId):null; if(!c)return null;
  var sh=c.sheet||{}, txt=(sh.notes||'')+'\n'+(sh.attacks||''), info={name:c.name};
  var m=txt.match(/spell save DC\s*(\d+)/i), m2=txt.match(/([+\u2212-]\s?\d+)\s*to hit with spell attacks/i);
  if(m){info.dc=parseInt(m[1],10); info.how='from '+c.name+'\u2019s stat block';}
  if(m2)info.atk=parseInt(m2[1].replace('\u2212','-').replace(/\s/g,''),10);
  if(info.dc==null||info.atk==null||x.hm){
    var mm=txt.match(/using (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) as the spellcasting ability/i), keys=[];
    if(mm)keys=[mm[1].slice(0,3).toLowerCase()]; else (x.cl||[]).forEach(function(k){var a=SP_CLASS_AB[k]; if(a&&keys.indexOf(a)<0)keys.push(a);});
    var best=null, bk=null;
    keys.forEach(function(k){var sc=sh.ab&&sh.ab[k]?parseInt(sh.ab[k].score,10):NaN; if(!isNaN(sc)){var md=Math.floor((sc-10)/2); if(best==null||md>best){best=md;bk=k;}}});
    if(best!=null){info.mod=best; info.modAb=bk.toUpperCase();}
    if(best!=null){
      var cr=txt.match(/\bCR\s+(\d+(?:\/\d+)?)/), crv=cr?(cr[1].indexOf('/')>0?0.5:parseInt(cr[1],10)):null;
      var prof=crv==null?2:(crv<5?2:crv<9?3:crv<13?4:crv<17?5:crv<21?6:crv<25?7:crv<29?8:9);
      if(info.dc==null){info.dc=8+prof+best; info.how='8 + '+prof+' proficiency + '+best+' '+bk.toUpperCase()+(crv==null?' (assumes +2 proficiency)':'');}
      if(info.atk==null)info.atk=prof+best;
    }
  }
  return (info.dc==null&&info.atk==null&&info.mod==null)?null:info;
}
function spDurRounds(du){
  var m=String(du||'').match(/(\d+)\s*(round|minute|hour)/i); if(!m)return null;
  var n=parseInt(m[1],10), u=m[2].toLowerCase(), r=u==='round'?n:(u==='minute'?n*10:n*600); return r<=100?r:null;
}
function spellSyncCast(){
  var A=ui.aoe; if(!A.sp)return; var x=SPELL_BY[A.sp.n], info=spCastInfo(x,A.sp.caster);
  A.sp.how=info&&info.how||'';
  if(A.sp.dcAuto&&x.sv)A.dc=(info&&info.dc!=null)?String(info.dc):'';
  if(A.sp.atkAuto&&x.at)A.att.mod=(info&&info.atk!=null)?String(info.atk):'0';
}
function spellConfigure(){
  var A=ui.aoe, q=A.sp, x=SPELL_BY[q.n], at=A.att, parts=spParts(x,q);
  if(spIsHeal(x)){A.kind='heal'; A.lastHeal='heal'; at.use=false; A.sv=false; A.amt=''; q.info=''; spellSyncCast(); return;}
  A.kind=(x.dm||!(x.cd&&x.cd.length))?'dmg':'cond';
  at.use=!!x.at; at.roll=''; at.hit={}; at.info='';
  at.lines=parts.length?parts.map(function(p){return {amt:'',type:p.type,sv:p.sv};}):[{amt:'',type:'untyped',sv:true}];
  A.sv=!!x.sv; if(x.sv)A.ab=x.sv; A.onSave=x.ok||'half'; A.res={}; A.eff={}; A.lr={}; A.sel=A.sel||{};
  if(x.cd&&x.cd.length){
    var rounds=spDurRounds(x.du);
    A.cond=Object.assign({},A.cond,{name:x.cd[0],custom:'',level:1,dur:rounds?'rounds':'manual',n:rounds||1,owner:'self'}); A.condOp='add';
  }
  spellSyncCast();
}
function spellInput(t,kind){
  var A=ui.aoe, k=t.dataset.spin;
  if(k==='q'){if(kind!=='input')return; A.spq=t.value; var lst=document.getElementById('splist'); if(lst)lst.innerHTML=spellPickList(A); return;}
  if(k==='lv'){A.splv=t.value; var l2=document.getElementById('splist'); if(l2)l2.innerHTML=spellPickList(A); return;}
  if(!A.sp||kind!=='change')return;
  var q=A.sp, x=SPELL_BY[q.n];
  if(k==='caster'){q.caster=t.value; A.lastCaster=t.value; if(!t.value)q.conc=false; spellSyncCast();}
  else if(k==='conc')q.conc=t.checked;
  else if(k==='slot'){q.slot=parseInt(t.value,10); q.cnt=spCount(x,q); spellConfigure();}
  else if(k==='tier'){q.tier=parseInt(t.value,10); q.cnt=spCount(x,q); spellConfigure();}
  else if(k==='cnt')q.cnt=Math.max(1,Math.min(20,parseInt(t.value,10)||1));
  else if(k==='type'){q.type=t.value; if(A.att.lines[0])A.att.lines[0].type=t.value;}
  else if(k==='cond'){A.cond.name=t.value;}
  renderAoe();
}

/* Healing spells: dice (or a fixed number) plus the caster's spellcasting modifier, more with a higher slot. */
function spIsHeal(x){return !!(x&&(x.hl||x.hf));}
function spHealFull(){var A=ui.aoe, x=A&&A.spellTab&&A.sp?SPELL_BY[A.sp.n]:null; return !!(x&&x.hf==='full'&&A.kind==='heal');}
function spHealDice(x,q){return (x.hu&&x.hu[String(q.slot)])||x.hl||'';}
function spHealText(x,q){
  if(x.hf==='full')return 'Back to full hit points';
  var d=spHealDice(x,q); if(!x.hm)return d+(x.hx?' hit points, divided between the targets':' hit points');
  var info=spCastInfo(x,q.caster), md=info&&info.mod!=null?info.mod:null;
  return d+(md==null?' + spellcasting modifier':(md<0?' \u2212 '+(-md):' + '+md)+' '+info.modAb);
}
function spellRollHeal(){
  var A=ui.aoe, q=A.sp, x=SPELL_BY[q.n]; if(x.hf==='full')return;
  var d=spHealDice(x,q);
  if(x.hx){var n=Math.max(1,aoeSelCount()); A.amt=String(Math.floor(parseInt(d,10)/n)); q.info=d+' divided between '+n+(n===1?' target':' targets')+' = '+A.amt+' each'; return;}
  var info=x.hm?spCastInfo(x,q.caster):null, md=info&&info.mod!=null?info.mod:0;
  var r=rollDice(d+(md<0?'-'+(-md):'+'+md)); A.amt=String(Math.max(1,r.total));
  q.info=d+(x.hm?' + '+(info&&info.mod!=null?'mod':'0 (no caster: add the modifier yourself)'):'')+': '+r.text+' = '+A.amt;
}
function spellSelect(name){
  var A=ui.aoe, x=SPELL_BY[name]; if(!x)return; var prev=A.sp||{};
  A.sp={n:name,slot:x.l||0,tier:0,cnt:1,caster:prev.caster||A.lastCaster||'',conc:false,dcAuto:true,atkAuto:true,type:(x.dt&&x.dt[0])||'untyped',info:'',how:''};
  A.sp.cnt=spCount(x,A.sp);
  state.spellRecent=[name].concat((state.spellRecent||[]).filter(function(y){return y!==name;})).slice(0,8); persist();
  spellConfigure();
}
function spellRoll(){
  var A=ui.aoe, q=A.sp; if(!q)return; var x=SPELL_BY[q.n];
  if(spIsHeal(x)){spellRollHeal(); return;}
  var parts=spParts(x,q); if(!parts.length)return;
  var lines=[];
  parts.forEach(function(p,i){
    var tot=0, tx=[]; for(var k=0;k<Math.max(1,q.cnt||1);k++){var r=rollDice(p.dice); tot+=r.total; tx.push(r.text);}
    if(A.att.lines[i])A.att.lines[i].amt=String(tot);
    lines.push(p.dice+(q.cnt>1?' \u00d7 '+q.cnt:'')+(p.type!=='untyped'?' '+p.type:'')+': '+tx.join(' | ')+' = '+tot);
  });
  q.info=lines.join('; ');
}
function spellPickList(A){
  var q=(A.spq||'').trim().toLowerCase(), lv=A.splv==null?'':A.splv, rec=state.spellRecent||[];
  var list=SPELLS.filter(function(x){return spellIncluded(x)&&(lv===''||String(x.l)===String(lv))&&(!q||x.n.toLowerCase().indexOf(q)>=0||(x.cd||[]).join(' ').toLowerCase().indexOf(q)>=0||(x.dt||[]).join(' ').indexOf(q)>=0);});
  if(!q&&lv===''){var r=rec.map(function(n){return SPELL_BY[n];}).filter(function(x){return x&&spellIncluded(x);}); list=r.concat(list.filter(function(x){return r.indexOf(x)<0;}));}
  var row=function(x,i){return '<button type="button" class="sprowbtn" data-aoe="spPick" data-n="'+esc(x.n)+'"><span class="spn"><b>'+esc(x.n)+'</b>'+((!q&&lv===''&&i<rec.length&&rec.indexOf(x.n)>=0)?'<em class="sprec">recent</em>':'')+'</span><small>'+esc(spLv(x))+' \u00b7 '+esc(spEffect(x)||(SP_SCHOOL[x.s]||x.s))+'</small></button>';};
  return list.length?list.slice(0,80).map(row).join('')+(list.length>80?'<p class="help">Showing 80 of '+list.length+'. Type to narrow it down.</p>':''):'<p class="help">No spell matches. Spells are chosen for combat in the Library, under Spells.</p>';
}
function spellPaneHTML(A){
  var q=A.sp, opt=function(v,on,l){return '<option value="'+esc(v)+'"'+(on?' selected':'')+'>'+esc(l)+'</option>';};
  if(!q){
    return '<div class="sppane"><div class="spsearch"><input type="search" data-spin="q" placeholder="Search spells\u2026" value="'+esc(A.spq||'')+'" aria-label="Search spells" autocomplete="off"><select data-spin="lv" aria-label="Spell level">'+opt('',(A.splv==null||A.splv==='') ,'All levels')+opt('0',A.splv==='0','Cantrips')+[1,2,3,4,5,6,7,8,9].map(function(l){return opt(String(l),A.splv===String(l),'Level '+l);}).join('')+'</select></div><div class="splist" id="splist">'+spellPickList(A)+'</div></div>';
  }
  var x=SPELL_BY[q.n], parts=spParts(x,q), hasUp=x.l>0&&((x.up&&Object.keys(x.up).length)||x.x||(x.hu&&Object.keys(x.hu).length)), hasTier=x.l===0&&((x.cu&&x.cu.length)||x.xt);
  var casters='<option value="">No caster</option>'+state.combatants.map(function(c){return opt(c.id,q.caster===c.id,c.name);}).join('');
  var diceTxt=parts.map(function(p){return p.dice+(p.type!=='untyped'?' '+p.type:'');}).join(' + ')+(q.cnt>1?' \u00d7 '+q.cnt:'');
  var tiers=hasTier?[1,5,11,17].map(function(l,i){return [String(i),'Level '+l+(i<3?'\u2013'+([4,10,16][i]):'+')];}):[];
  var slots=''; if(hasUp){for(var l=x.l;l<=9;l++)slots+=opt(String(l),q.slot===l,'Level '+l+(l===x.l?' (base)':''));}
  var cntLabel=x.xt?'Beams':(x.n==='Magic Missile'?'Darts':'Rays');
  var typeSel=(x.dt&&x.dt.length>1&&!x.dp)?'<label class="spctl">Damage type<select data-spin="type">'+x.dt.map(function(t){return opt(t,q.type===t,cap(t));}).join('')+'</select></label>':'';
  var condSel=(x.cd&&x.cd.length>1)?'<label class="spctl">Condition<select data-spin="cond">'+x.cd.map(function(c){return opt(c,A.cond.name===c,c);}).join('')+'</select></label>':'';
  return '<div class="sppane"><div class="spcard"><div class="sphead"><b>'+esc(x.n)+'</b><button type="button" class="btn small ghost" data-aoe="spChange">Change spell</button></div><p class="spmeta">'+esc(spMeta(x))+'</p>'+
    '<div class="sprow"><label class="spctl">Caster<select data-spin="caster" aria-label="Caster">'+casters+'</select></label>'+(x.co&&q.caster?'<label class="spck"><input type="checkbox" data-spin="conc"'+(q.conc?' checked':'')+'><span>Concentrating</span></label>':'')+
    ((hasUp||hasTier||x.x||x.xt||typeSel||condSel)?(hasUp?'<label class="spctl">Cast at<select data-spin="slot">'+slots+'</select></label>':'')+(hasTier?'<label class="spctl">Caster level<select data-spin="tier">'+tiers.map(function(t){return opt(t[0],String(q.tier||0)===t[0],t[1]);}).join('')+'</select></label>':'')+((x.x||x.xt)?'<label class="spctl">'+cntLabel+'<input type="number" min="1" max="20" data-spin="cnt" value="'+esc(q.cnt)+'"></label>':'')+typeSel+condSel:'')+'</div>'+
    (spIsHeal(x)?'<div class="sprow spdice"><span class="spdt">'+esc(spHealText(x,q))+'</span>'+(x.hf==='full'?'':'<button type="button" class="btn small" data-aoe="spRoll">'+(x.hx?'Split between the targets':'\ud83c\udfb2 Roll healing')+'</button><span class="sphint">or type the amount below</span>')+'</div>'+(q.info?'<p class="help spinfo">'+esc(q.info)+'</p>':'')+(x.n==='Power Word Heal'?'<p class="help spwhy">It also ends Charmed, Frightened, Paralyzed, Poisoned and Stunned: remove those with the Condition tab.</p>':''):'')+
    (x.dm?'<div class="sprow spdice"><span class="spdt">'+esc(diceTxt)+'</span><button type="button" class="btn small" data-aoe="spRoll">\ud83c\udfb2 Roll damage</button><span class="sphint">or type the damage below</span></div>'+(q.info?'<p class="help spinfo">'+esc(q.info)+'</p>':''):'')+
    (x.sv&&q.how?'<p class="help spwhy">Save DC '+esc(A.dc||'?')+' \u2014 '+esc(q.how)+'. Change it below if it\u2019s different.</p>':'')+
    (x.cd&&x.cd.length&&x.dm?'<p class="help spwhy">Anyone who fails the save also gets '+esc(A.cond.name)+'.</p>':'')+'</div></div>';
}
function spellAfter(A,fails){
  var x=A.spellTab&&A.sp?SPELL_BY[A.sp.n]:null; if(!x)return;
  if(x.cd&&x.cd.length&&A.kind==='dmg'&&A.cond&&A.cond.name){
    (fails||[]).forEach(function(t){var cd=makeCond(t.c,A.cond,A.cond.name); t.c.conditions=t.c.conditions.filter(function(y){return y.name!==A.cond.name;}); t.c.conditions.push(cd); notes.push(t.name+' is '+A.cond.name);});
  }
  if(A.sp.conc&&A.sp.caster){
    var c=byId(A.sp.caster); if(c){var had=c.conditions.filter(function(y){return y.name==='Concentrating';})[0];
      c.conditions=c.conditions.filter(function(y){return y.name!=='Concentrating';}); var cd2=makeCond(c,{dur:'manual'},'Concentrating'); cd2.note=x.n; c.conditions.push(cd2);
      notes.push(c.name+' concentrates on '+x.n+(had&&had.note&&had.note!==x.n?' (no longer on '+had.note+')':''));}
  }
}
function renderSpellsTab(el,head){
  var L=ui.lib, q=(L.spq||'').trim().toLowerCase(), show=L.spshow||'all', lv=L.splv==null?'':L.splv, cl=L.spcl||'';
  var list=SPELLS.filter(function(x){
    if(q&&x.n.toLowerCase().indexOf(q)<0)return false; if(lv!==''&&String(x.l)!==String(lv))return false; if(cl&&(x.cl||[]).indexOf(cl)<0)return false;
    var inc=spellIncluded(x); return show==='all'||(show==='in'?inc:!inc);});
  var inAll=SPELLS.filter(spellIncluded).length, opt=function(v,on,l){return '<option value="'+esc(v)+'"'+(on?' selected':'')+'>'+esc(l)+'</option>';};
  var rows=list.map(function(x){var inc=spellIncluded(x);
    return '<label class="mmrow sprow2" data-spn="'+esc(x.n)+'"><input type="checkbox" data-spinc="'+esc(x.n)+'"'+(inc?' checked':'')+' aria-label="Include '+esc(x.n)+' in combat"><span class="mmname static"><span class="mmtitle"><b>'+esc(x.n)+'</b>'+(x.co?'<em class="sprec">concentration</em>':'')+'</span><small>'+esc(spLv(x))+' \u00b7 '+esc(SP_SCHOOL[x.s]||x.s)+' \u00b7 '+esc((x.cl||[]).map(function(k){return SP_CLASS[k];}).join(', '))+'</small></span><span class="spsum">'+esc(spEffect(x)||'No damage or condition')+'</span></label>';}).join('');
  el.innerHTML=head+'<div class="mmctl"><input type="search" class="mmsearch" data-spf="q" placeholder="Search spells\u2026" value="'+esc(L.spq||'')+'" aria-label="Search spells" autocomplete="off">'+
    '<div class="mmbar"><div class="mmisland spisl" role="group" aria-label="Show"><span class="mmilab">Show</span><div class="seg sm" role="radiogroup" aria-label="Which spells">'+[['all','All'],['in','In combat'],['out','Not in combat']].map(function(o){return '<button type="button" role="radio" aria-checked="'+(show===o[0])+'" data-mm="spshow" data-v="'+o[0]+'">'+o[1]+'</button>';}).join('')+'</div></div>'+
    '<div class="mmisland spisl" role="group" aria-label="Filter"><span class="mmilab">Filter</span><select data-spf="lv" aria-label="Level">'+opt('',lv==='','All levels')+opt('0',lv==='0','Cantrips')+[1,2,3,4,5,6,7,8,9].map(function(l){return opt(String(l),lv===String(l),'Level '+l);}).join('')+'</select><select data-spf="cl" aria-label="Class">'+opt('',cl==='','All classes')+Object.keys(SP_CLASS).map(function(k){return opt(k,cl===k,SP_CLASS[k]);}).join('')+'</select></div>'+
    '<div class="mmisland spisl" role="group" aria-label="Choose in bulk"><span class="mmilab">In combat</span><button type="button" class="btn small" data-mm="spinc">Include these</button><button type="button" class="btn small" data-mm="spexc">Remove these</button><button type="button" class="btn small ghost" data-mm="sprst">Reset to default</button></div></div></div>'+
    '<p class="help spintro"><b id="spcount">'+inAll+'</b> of '+SPELLS.length+' spells are in combat. Tick the spells you want in the Target window\u2019s Spells tab. By default that\u2019s the ones that do damage, heal, or put a condition on a creature.</p>'+
    '<div class="mmlist" id="splibList">'+(rows||'<p class="help">No spell matches.</p>')+'</div>'+
    '<p class="mmfoot">Spell data from the System Reference Document 5.2 \u00a9 Wizards of the Coast LLC, licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>. Not affiliated with or endorsed by Wizards of the Coast.</p></div></div>';
}

function aoeNew(){return {amt:'',kind:'dmg',sel:{},eff:{},res:{},lr:{},dc:'',ab:'dex',adv:'n',onSave:'half',sv:false,
  cond:{name:'',level:1,custom:'',dur:'manual',n:1,owner:'self'},condOp:'add',
  att:{use:false,roll:'',mod:'0',adv:'n',info:'',lines:[{amt:'',type:'untyped'}],res:true,hit:{}}};}

/* Damage, healing, temp HP and attacks act on individual creatures (group members are separate rows).
   Conditions live on the card, so in Condition mode a group is one row. */
function aoeTargets(){
  var out=[], cardMode=ui.aoe&&ui.aoe.kind==='cond';
  state.combatants.forEach(function(c){
    if(cardMode)out.push({k:c.id,c:c,m:null,card:true,name:c.name+(isGroup(c)?' \u00d7'+c.members.length:''),hp:null,max:null,temp:0});
    else if(isGroup(c))c.members.forEach(function(m){out.push({k:m.id,c:c,m:m,name:c.name+' '+m.n,hp:m.hp,max:m.maxHp,temp:m.temp||0});});
    else out.push({k:c.id,c:c,m:null,name:c.name,hp:c.hp,max:c.maxHp,temp:c.temp||0});
  });
  return out;
}
function aoeUsable(t){return ui.aoe.kind==='cond'||t.hp!=null;}
function aoeRole(t){return t.c.kind==='pc'?'pc':(t.c.disp||'enemy');}
function aoeAmt(){var n=parseInt(ui.aoe.amt,10); return (isNaN(n)||n<=0)?0:n;}
function aoeCondName(){var f=ui.aoe.cond; return f.name==='Custom'?(f.custom||'').trim():f.name;}
function aoeCondText(){var n=aoeCondName(); return n==='Exhaustion'&&ui.aoe.condOp==='add'?'Exhaustion '+(parseInt(ui.aoe.cond.level,10)||1):n;}
function aoeSaveable(){var A=ui.aoe; return A.kind==='dmg'||(A.kind==='cond'&&A.condOp==='add');}

/* ----- attacks: does it hit, and what does it do to this creature? ----- */
function aoeAttTotal(){var at=ui.aoe.att, r=parseInt(at.roll,10); return isNaN(r)?null:r+(parseInt(at.mod,10)||0);}
function aoeHit(t){
  var at=ui.aoe.att, ov=at.hit[t.k];
  if(!at.use)return {hit:true,why:'no attack roll'};
  if(ov!=null)return {hit:ov,why:'set by hand',manual:true};
  var d=parseInt(at.roll,10);
  if(isNaN(d))return {hit:null,why:'enter the attack roll'};
  if(d===20)return {hit:true,why:'natural 20'};
  if(d===1)return {hit:false,why:'natural 1'};
  var tot=aoeAttTotal(), ac=acTotal(t.c);
  if(ac==null)return {hit:null,why:'no AC set \u2014 tap to choose'};
  return {hit:tot>=ac,why:tot+' vs AC '+ac};
}
function aoeHitChip(t){
  var h=aoeHit(t);
  return {cls:h.hit==null?'none':(h.hit?'pass':'fail'),text:h.hit==null?'Hit?':(h.hit?'Hit \u2713':'Miss \u2717'),title:h.why+(h.manual?'':' (tap to override)')};
}
/* Resistance, immunity and vulnerability are read from the creature's stats text, word by word. */
function aoeTypeMult(c,type){
  if(!ui.aoe.att.res||!type||type==='untyped')return 1;
  var sh=c.sheet||{}, re=new RegExp('\\b'+type+'\\b','i');
  if(re.test(sh.immune||''))return 0;
  var m=1; if(re.test(sh.resist||''))m*=0.5; if(re.test(sh.vuln||''))m*=2;
  return m;
}
function aoeAttDamage(t){
  var parts=[], total=0;
  ui.aoe.att.lines.forEach(function(l){
    var amt=parseInt(l.amt,10); if(isNaN(amt)||amt<=0)return;
    var m=aoeTypeMult(t.c,l.type), r=ui.aoe.sv?ui.aoe.res[t.k]:null, sm=(r&&r.p&&l.sv!==false)?(ui.aoe.onSave==='none'?0:0.5):1, adj=Math.floor(amt*m*sm);
    parts.push({amt:amt,type:l.type,adj:adj,m:m,saved:sm!==1}); total+=adj;
  });
  return {total:total,parts:parts};
}

function aoePrev(t){
  var A=ui.aoe;
  if(A.kind==='dmg'){
    if(!A.sel[t.k])return '';
    var h=aoeHit(t); if(h.hit==null)return h.why; if(!h.hit)return 'miss ('+h.why+')';
    var d=aoeAttDamage(t); if(!d.parts.length)return A.att.use?'hit \u2014 enter damage':'enter the damage';
    if(t.hp==null)return 'hit \u2014 '+d.total+' damage (HP not tracked)';
    var u=Math.min(t.temp,d.total), hp=Math.max(0,t.hp-(d.total-u));
    var nt=d.parts.filter(function(p){return p.m!==1;}).map(function(p){return (p.m===0?'immune to ':p.m<1?'resists ':'vulnerable to ')+p.type;});
    if(d.parts.some(function(p){return p.saved;}))nt.push('save passed: '+(A.onSave==='none'?'no':'half')+' damage');
    if(u>0)nt.push('temp absorbs '+u);
    return t.hp+' \u2192 '+hp+(nt.length?' ('+nt.join(', ')+')':'');
  }
  if(A.kind==='cond'){
    var nm=aoeCondName(); if(!A.sel[t.k]||!nm)return '';
    var has=t.c.conditions.some(function(x){return x.name===nm;});
    if(A.condOp==='remove')return has?'\u2212 '+nm:'doesn\u2019t have '+nm;
    if((A.eff[t.k]||'full')==='none')return 'saved \u2014 no effect';
    return has?'refreshes '+nm:'+ '+aoeCondText();
  }
  var v=aoeAmt();
  if(t.hp==null)return 'HP not tracked';
  if(A.sel[t.k]&&spHealFull())return t.max!=null?t.hp+' \u2192 '+Math.max(t.hp,t.max):'no max HP';
  if(!A.sel[t.k]||!aoeAmt())return '';
  if(A.kind==='heal')return t.hp+' \u2192 '+Math.min(t.max!=null?t.max:Infinity,t.hp+v);
  return 'Temp HP '+Math.max(t.temp,v);
}
/* A passed save halves (or cancels) damage, and always cancels a condition. */
function aoePassEff(){var A=ui.aoe; return (A.kind==='cond'||A.onSave==='none')?'none':'half';}
function aoeSetRes(k,pass,txt,tip){
  var A=ui.aoe; delete A.lr[k];
  if(pass==null){delete A.res[k]; A.eff[k]='full'; return;}
  A.res[k]={p:pass,txt:txt||'',tip:tip||''}; A.eff[k]=pass?aoePassEff():'full';
}
function aoeSelCount(){var A=ui.aoe; return aoeTargets().filter(function(t){return A.sel[t.k]&&aoeUsable(t);}).length;}
function aoeReadyCount(){
  var A=ui.aoe; if(A.kind!=='dmg'||!A.att.use)return aoeSelCount();
  return aoeTargets().filter(function(t){return A.sel[t.k]&&t.hp!=null&&aoeHit(t).hit===true;}).length;
}
function aoeApplyLabel(n){
  var A=ui.aoe, cnt=n+' '+(n===1?'creature':'creatures');
  if(A.kind==='dmg')return A.att.use?(n?'Apply damage to '+n+(n===1?' hit':' hits'):'No hits to apply'):'Apply damage to '+cnt;
  if(A.kind==='cond'){var nm=aoeCondText(); return !nm?'Choose a condition':(A.condOp==='remove'?'Remove '+nm+' from ':'Apply '+nm+' to ')+cnt;}
  return (A.kind==='heal'?'Heal ':'Give temp HP to ')+cnt;
}
function aoeRefresh(){
  var A=ui.aoe; if(!A||!ui.aoeOpen)return; var m={}; aoeTargets().forEach(function(t){m[t.k]=t;});
  document.querySelectorAll('#aoepanel [data-prev]').forEach(function(n){var t=m[n.dataset.prev]; if(t)n.textContent=aoePrev(t);});
  document.querySelectorAll('#aoepanel [data-hitchip]').forEach(function(n){var t=m[n.dataset.hitchip]; if(!t)return; var c=aoeHitChip(t); n.className='svchip '+c.cls; n.textContent=c.text; n.title=c.title;});
  var inf=document.querySelector('#aoepanel .aoeinfo'); if(inf&&!A.att.info)inf.remove();
  var atn=document.querySelector('#aoepanel [data-atotal] b'); if(atn){var att0=aoeAttTotal(); atn.textContent=att0==null?'\u2014':att0;}
  var ab=document.querySelector('#aoepanel .aoeapply'); if(ab){var rn=aoeReadyCount(); ab.textContent=aoeApplyLabel(rn); ab.disabled=!rn;}
}

function aoeRowHTML(t){
  var A=ui.aoe, cond=A.kind==='cond', att=A.kind==='dmg', atk=att&&A.att.use, usable=aoeUsable(t), on=!!A.sel[t.k]&&usable, r=A.res[t.k], eff=A.eff[t.k]||'full', nm=esc(t.name);
  var sm=(cond||att)?'':sheetSummary(t.c.sheet), chip='';
  if(aoeSaveable()&&usable&&(!att||A.sv)){
    chip='<button type="button" class="svchip '+(r?(r.p?'pass':'fail'):'none')+'" data-aoe="saveCycle" data-k="'+t.k+'" title="'+esc(r&&r.tip?r.tip:'Click to mark this save as passed or failed')+'">'+
      (r?esc(A.ab.toUpperCase()+' '+r.txt)+(r.p?' \u2713':' \u2717'):'Save \u2014')+'</button>'+
      (r&&!r.p&&t.c.leg&&t.c.leg.rleft>0&&!A.lr[t.k]?'<button type="button" class="svchip lr" data-aoe="lr" data-k="'+t.k+'" title="Spend one Legendary Resistance to turn this into a success">Use LR ('+t.c.leg.rleft+')</button>':'');
  }
  if(atk&&usable){var hc=aoeHitChip(t); chip='<button type="button" class="svchip '+hc.cls+'" data-aoe="hitcycle" data-k="'+t.k+'" data-hitchip="'+t.k+'" title="'+esc(hc.title)+'">'+hc.text+'</button>'+chip;}
  var effOpts=cond&&A.condOp==='add'?[['full','Apply'],['none','Skip']]:null;
  var effSeg=(effOpts&&usable)?'<div class="seg sm aoeeff" role="radiogroup" aria-label="Effect on '+nm+'">'+effOpts.map(function(o){
    return '<button type="button" role="radio" aria-checked="'+(eff===o[0])+'" data-aoe="eff" data-k="'+t.k+'" data-v="'+o[0]+'">'+o[1]+'</button>';}).join('')+'</div>':'';
  var cs=t.c.conditions, ac=acTotal(t.c);
  var side=cond?(cs.length?cs.slice(0,2).map(condLabel).join(', ')+(cs.length>2?' +'+(cs.length-2):''):'no conditions'):
    (t.hp==null?'\u2014':t.hp+(t.max!=null?' / '+t.max:'')+(t.temp?' +'+t.temp:'')+(atk?' \u00b7 AC '+(ac==null?'?':ac):''));
  return '<div class="aoerow'+(on?' on':' off')+(usable?'':' untracked')+'" data-k="'+t.k+'">'+
    '<input type="checkbox" data-aoe="tog" data-k="'+t.k+'"'+(on?' checked':'')+(usable?'':' disabled')+' aria-label="'+nm+'">'+
    '<div class="aoename" data-aoe="togname" data-k="'+t.k+'"><span class="tdot k-'+aoeRole(t)+'" title="'+({pc:'Player',enemy:'Enemy',ally:'Ally',neutral:'Neutral'})[aoeRole(t)]+'"></span><b>'+nm+'</b>'+(sm?'<small>'+esc(sm)+'</small>':'')+'</div>'+
    '<div class="aoehp">'+esc(side)+'</div>'+
    '<div class="aoeline2">'+effSeg+'<span class="aoechips">'+chip+'</span><span class="aoeprev" data-prev="'+t.k+'">'+esc(aoePrev(t))+'</span></div></div>';
}

/* Who is affected: Players first, then NPCs, each in natural alphabetical order (Wolf 2 before Wolf 10). */
function aoeNameCmp(a,b){return a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'});}
function aoeListHTML(T){
  var A=ui.aoe, out='';
  [['Players','pc',T.filter(function(t){return t.c.kind==='pc';})],['NPCs','npc',T.filter(function(t){return t.c.kind!=='pc';})]].forEach(function(g){
    var arr=g[2].slice().sort(aoeNameCmp); if(!arr.length)return;
    var use=arr.filter(aoeUsable), all=use.length&&use.every(function(t){return A.sel[t.k];});
    out+='<div class="aoesec"><span>'+g[0]+'</span><small>'+arr.length+'</small>'+(use.length?'<button type="button" class="chipbtn" data-aoe="secsel" data-v="'+g[1]+'">'+(all?'None':'All')+'</button>':'')+'</div>'+arr.map(aoeRowHTML).join('');
  });
  return out;
}

/* The Target window opens from the round bar. */
function renderAoe(soft){
  var el=document.getElementById('aoepanel'); if(!el)return;
  var A=ui.aoe; if(!A)return;
  if(!ui.aoeOpen){if(el.innerHTML)el.innerHTML='';return;}
  var ae=document.activeElement;
  if(soft&&ae&&(ae.tagName==='INPUT'||ae.tagName==='SELECT')&&ae.type!=='checkbox'&&el.contains(ae))return;   /* never rebuild under a typing cursor */
  var T=aoeTargets(), condMode=A.kind==='cond', attMode=A.kind==='dmg', n=aoeReadyCount(), sel=aoeSelCount(), f=A.cond, at=A.att;
  var nSel=Object.keys(A.sel||{}).filter(function(k){return A.sel[k];}).length, pickBtns='<button type="button" class="chipbtn pickall" data-aoe="pick" data-v="all">'+ICONS.selall+'<span>Select all</span></button><button type="button" class="chipbtn pickclear" data-aoe="pick" data-v="none"'+(nSel?'':' disabled')+'>'+ICONS.close+'<span>Clear</span></button>';
  var kinds='<div class="seg kseg" role="radiogroup" aria-label="What to do">'+AOE_KINDS.map(function(k){return '<button type="button" role="radio" aria-checked="'+((k[0]==='spell')?!!A.spellTab:(!A.spellTab&&(A.kind===k[0]||(k[0]==='heal'&&A.kind==='temp'))))+'" data-aoe="kind" data-v="'+k[0]+'" data-kind="'+k[0]+'">'+k[1]+'</button>';}).join('')+'</div>';
  var segOf=function(act,cur,opts,label){return '<div class="seg sm" role="radiogroup" aria-label="'+label+'">'+opts.map(function(o){return '<button type="button" role="radio" aria-checked="'+(cur===o[0])+'" data-aoe="'+act+'" data-v="'+o[0]+'">'+o[1]+'</button>';}).join('')+'</div>';};
  var opt=function(v,s2,label){return '<option value="'+esc(v)+'"'+(s2?' selected':'')+'>'+esc(label==null?v:label)+'</option>';};
  var top2;
  if(condMode){
    var adding=A.condOp==='add';
    var durs=[['manual','Until removed'],['start','Until start of turn'],['end','Until end of turn'],['rounds','For rounds']].map(function(d){return opt(d[0],f.dur===d[0],d[1]);}).join('');
    var owners=opt('self',f.owner==='self'||!f.owner,'Their own turn')+state.combatants.map(function(o){return opt(o.id,f.owner===o.id,o.name);}).join('');
    top2='<div class="aoecond">'+segOf('condop',A.condOp,[['add','Add'],['remove','Remove']],'Add or remove')+
      '<select data-aoein="cname" aria-label="Condition"><option value="">Choose a condition\u2026</option><optgroup label="Effects">'+EXTRA_CONDS.map(function(c){return opt(c,f.name===c);}).join('')+'</optgroup><optgroup label="Conditions">'+CONDITIONS.map(function(c){return opt(c,f.name===c);}).join('')+'</optgroup>'+opt('Custom',f.name==='Custom','Custom\u2026')+'</select>'+
      (f.name==='Custom'?'<input type="text" data-aoein="ccustom" value="'+esc(f.custom)+'" placeholder="Hexed, Hasted\u2026" aria-label="Custom condition name">':'')+
      (adding&&f.name==='Exhaustion'?'<label class="aoecl">Level<select data-aoein="clevel">'+[1,2,3,4,5,6].map(function(x){return opt(String(x),String(f.level)===String(x));}).join('')+'</select></label>':'')+
      (adding?'<div class="aoecrow"><label>Lasts<select data-aoein="cdur">'+durs+'</select></label>'+
        (f.dur==='rounds'?'<label>Rounds<input type="number" min="1" value="'+esc(f.n)+'" data-aoein="cn" style="width:72px"></label>':'')+
        ((f.dur==='start'||f.dur==='end')?'<label>Whose turn<select data-aoein="cowner">'+owners+'</select></label>':'')+'</div>':'')+
      (f.name&&COND_INFO[f.name]?'<p class="help">'+esc(COND_INFO[f.name])+'</p>':'')+'</div>';
  }else if(attMode){
    var atkTot=aoeAttTotal();
    var atkSection='<div class="aoesv aoeatk"><button type="button" class="aoesvhead" data-aoe="attoggle" aria-expanded="'+!!at.use+'"><span>Attack roll</span><small>optional</small><i aria-hidden="true">'+(at.use?'\u25be':'\u25b8')+'</i></button>'+
      (at.use?'<div class="aoesvbody"><div class="aoesvrow aoeroll2"><label>d20<input type="number" min="1" max="20" data-aoein="aroll" value="'+esc(at.roll)+'" placeholder="\u2014"></label><span class="aoeplus" aria-hidden="true">+</span><label>Modifier<input type="number" data-aoein="amod" value="'+esc(at.mod)+'"></label><span class="aoetotal" data-atotal>Total <b>'+(atkTot==null?'\u2014':atkTot)+'</b></span></div>'+
        '<div class="aoesvrow">'+segOf('aadv',at.adv,[['n','Normal'],['adv','Adv'],['dis','Dis']],'Advantage or disadvantage on the attack')+'<button type="button" class="btn small" data-aoe="rolld20">\ud83c\udfb2 Roll d20</button></div>'+
        (at.info?'<p class="help aoeinfo">'+esc(at.info)+'</p>':'')+'</div>':'')+'</div>';
    top2='<div class="aoeatt">'+
      '<div class="aoelines" role="group" aria-label="Damage"><div class="aoedlh"><span>Damage</span><span>Damage type</span></div>'+at.lines.map(function(l,i){
        return '<div class="aoedl"><input type="number" min="0" data-aoein="aamt" data-i="'+i+'" value="'+esc(l.amt)+'" placeholder="Damage" aria-label="Damage amount '+(i+1)+'"><select data-aoein="atype" data-i="'+i+'" aria-label="Damage type '+(i+1)+'">'+
        DMG_TYPES.map(function(ty){return opt(ty,l.type===ty,dmgTypeLabel(ty));}).join('')+'</select>'+
        (A.sv?'<button type="button" class="chipbtn aoelsv'+(l.sv===false?'':' on')+'" data-aoe="lsave" data-i="'+i+'" aria-pressed="'+(l.sv!==false)+'" title="A passed save reduces this damage">'+(l.sv===false?'':'<span class="mmck" aria-hidden="true">\u2713</span>')+'Save</button>':'')+
        (at.lines.length>1?'<button type="button" class="icon" data-aoe="rmline" data-i="'+i+'" aria-label="Remove this damage">\u00d7</button>':'')+'</div>';}).join('')+
        '<button type="button" class="btn small ghost" data-aoe="addline">+ Add damage</button></div>'+
      '<label class="aoechk"><input type="checkbox" data-aoein="ares"'+(at.res?' checked':'')+'> Apply resistances, immunities and vulnerabilities from stats</label>'+atkSection+'</div>';
  }else if(spHealFull())top2='<p class="help aoefull">Each selected creature goes back to its full hit points.</p>';
  else top2='<div class="aoeamt">'+segOf('healmode',A.kind,[['heal','Heal'],['temp','Temp HP']],'Healing or temporary hit points')+'<input type="number" min="1" data-aoein="amt" placeholder="Amount" value="'+esc(A.amt)+'" aria-label="Amount"></div>';
  var saves='';
  if(aoeSaveable()){
    saves='<div class="aoesv"><button type="button" class="aoesvhead" data-aoe="svtoggle" aria-expanded="'+!!A.sv+'"><span>Saving throw</span><small>'+(condMode?'a pass skips it':'optional')+'</small><i aria-hidden="true">'+(A.sv?'\u25be':'\u25b8')+'</i></button>'+
      (A.sv?'<div class="aoesvbody"><div class="aoesvrow"><label>DC<input type="number" min="1" max="40" data-aoein="dc" value="'+esc(A.dc)+'"></label>'+segOf('adv',A.adv,[['n','Normal'],['adv','Adv'],['dis','Dis']],'Advantage or disadvantage')+'</div>'+
        segOf('ab',A.ab,ABIL,'Ability')+
        '<div class="aoesvrow"><button type="button" class="btn small" data-aoe="roll">\ud83c\udfb2 Roll for NPCs</button>'+(attMode?'<span class="aoeon">Success\u2192'+segOf('onsave',A.onSave,[['half','Half'],['none','None']],'Damage on a success')+'</span>':'')+'</div></div>':'')+'</div>';
  }
  var cls=A.kind==='dmg'?'dmg':A.kind==='heal'?'heal':A.kind==='temp'?'temp':'cond';
  el.innerHTML='<div class="scrim open" data-aoe="close"></div><div class="qrmodal aoemodal" role="dialog" aria-modal="true" aria-label="Target"><div class="dhead"><h2>Target</h2><span class="aoegn">'+(sel?sel+' selected':'')+'</span><button type="button" class="btn small" data-aoe="close">Close</button></div>'+
    '<div class="qrbody aoebody"><div class="aoectl"><div class="aoetop">'+kinds+'</div>'+(A.spellTab?spellPaneHTML(A):'')+((A.spellTab&&!A.sp)?'':top2+saves)+
    '<div class="aoefoot"><button type="button" class="btn aoeapply '+cls+'" data-aoe="apply"'+((n&&!(A.spellTab&&!A.sp))?'':' disabled')+'>'+esc(aoeApplyLabel(n))+'</button>'+
    '<p class="help">'+(attMode?(at.use?'Tap Hit or Miss on a row to override it. ':'')+(A.sv?'A passed save reduces the damage marked Save. ':''):'')+'One Undo reverses all of it.</p></div></div>'+
    '<div class="aoeright"><div class="aoepicks">'+pickBtns+'</div>'+
    '<div class="aoelist">'+(T.length?aoeListHTML(T):'<p class="help">No one is in the fight yet.</p>')+'</div></div></div></div>';
}

function aoeApply(){
  var A=ui.aoe;
  if(A.kind==='cond'){aoeApplyCond();return;}
  if(A.kind==='dmg'){aoeApplyAtt();return;}
  var amt=aoeAmt(), full=spHealFull();
  if(!amt&&!full){toast('Enter an amount first');return;}
  var T=aoeTargets().filter(function(t){return A.sel[t.k]&&t.hp!=null;});
  if(!T.length){toast('Select at least one creature');return;}
  var kind=A.kind, hit=0, label=kind==='heal'?'Healing':'Temp HP';
  aoeReset();
  mutate(function(){
    T.forEach(function(t){
      var v=full?(t.max!=null?Math.max(0,t.max-t.hp):0):amt;
      if(full&&!v)return;
      hit++;
      if(kind==='heal'){if(t.m)memHeal(t.m,v); else hpHeal(t.c,v);}
      else {if(t.m)memTemp(t.m,v); else hpTemp(t.c,v);}
    });
    notes.unshift((full?label+' to full':label+' '+amt)+': '+hit+' of '+T.length+' affected');
  });
}

/* After applying: keep the options, clear the selection and numbers, and close the window. */
function aoeReset(){
  var A=ui.aoe;
  ui.aoe=Object.assign(aoeNew(),{kind:A.kind,spellTab:A.spellTab,sp:A.sp?Object.assign({},A.sp,{conc:false,info:''}):null,lastCaster:A.lastCaster,dc:A.sp?A.dc:'',spq:A.spq,splv:A.splv,lastHeal:A.lastHeal,ab:A.ab,adv:A.adv,onSave:A.onSave,sv:A.sv,cond:A.cond,condOp:A.condOp,
    att:{use:A.att.use,roll:'',mod:A.att.mod,adv:A.att.adv,info:'',lines:A.att.lines.map(function(l){return {amt:'',type:l.type,sv:l.sv};}),res:A.att.res,hit:{}}});
  ui.aoeOpen=false; renderAoe();
}

function aoeApplyCond(){
  var A=ui.aoe, f=A.cond, nm=aoeCondName();
  if(!nm){toast('Choose a condition first');return;}
  var T=aoeTargets().filter(function(t){return A.sel[t.k];});
  if(!T.length){toast('Select at least one creature');return;}
  var add=A.condOp!=='remove', done=0;
  aoeReset();
  mutate(function(){
    T.forEach(function(t){
      var c=t.c, e=A.eff[t.k]||'full';
      if(A.lr[t.k]&&c.leg&&c.leg.rleft>0)spendLR(c);
      if(add){
        if(e==='none')return;
        var cd=makeCond(c,f,nm);
        c.conditions=c.conditions.filter(function(x){return x.name!==nm;}); c.conditions.push(cd); done++;
      }else{
        var before=c.conditions.length; c.conditions=c.conditions.filter(function(x){return x.name!==nm;}); if(c.conditions.length<before)done++;
      }
    });
    spellAfter(A,[]);
    notes.unshift((add?nm+' applied':nm+' removed')+': '+done+' of '+T.length+(add?' affected':''));
  });
}

function aoeApplyAtt(){
  var A=ui.aoe, at=A.att;
  var T=aoeTargets().filter(function(t){return A.sel[t.k]&&t.hp!=null;});
  if(!T.length){toast('Select at least one target');return;}
  var hits=T.filter(function(t){return aoeHit(t).hit===true;});
  if(!hits.length){toast('That attack misses everyone selected');return;}
  var plan=hits.map(function(t){return {t:t,d:aoeAttDamage(t)};});
  if(!plan.some(function(p){return p.d.parts.length;})){toast('Enter the damage first');return;}
  var tot=aoeAttTotal(), d20v=parseInt(at.roll,10), roll=d20v===20?'natural 20':(d20v===1?'natural 1':(tot==null?'by hand':'total '+tot)), misses=T.length-hits.length;
  aoeReset();
  mutate(function(){
    T.forEach(function(t){if(A.lr[t.k]&&t.c.leg&&t.c.leg.rleft>0)spendLR(t.c);});
    plan.forEach(function(p){
      if(p.d.total>0){if(p.t.m)memDamage(p.t.c,p.t.m,p.d.total); else hpDamage(p.t.c,p.d.total);}
    });
    spellAfter(A,plan.filter(function(p){return !(A.sv&&A.res[p.t.k]&&A.res[p.t.k].p);}).map(function(p){return p.t;}));
    notes.unshift(at.use?'Attack '+roll+': '+hits.length+' hit'+(hits.length===1?'':'s')+(misses?', '+misses+' missed':''):'Damage: '+hits.length+' of '+T.length+' affected');
    plan.forEach(function(p){notes.push(p.t.name+' takes '+p.d.total+' ('+p.d.parts.map(function(x){return x.adj+' '+x.type;}).join(', ')+')');});
  });
}

/* Switching between Condition (rows are cards) and the HP kinds (rows are individual creatures)
   carries the selection across: a group is selected if any member was, and the other way round. */
function aoeConvertSel(toCond){
  var A=ui.aoe, ns={};
  state.combatants.forEach(function(c){
    if(isGroup(c)){
      var ids=c.members.map(function(m){return m.id;});
      if(toCond){if(ids.some(function(id){return A.sel[id];}))ns[c.id]=true;}
      else if(A.sel[c.id])ids.forEach(function(id){ns[id]=true;});
    }else if(A.sel[c.id])ns[c.id]=true;
  });
  A.sel=ns; A.eff={}; A.res={}; A.lr={}; A.att.hit={};
}

document.addEventListener('click',function(e){
  var t=e.target.closest('[data-aoe]'); if(!t||!ui.aoe)return;
  if(t.type==='checkbox'&&t.dataset.aoe==='tog'&&t.disabled)return;
  var A=ui.aoe, a=t.dataset.aoe, k=t.dataset.k, v=t.dataset.v, T;
  switch(a){
    case 'close':ui.aoeOpen=false;break;
    case 'svtoggle':A.sv=!A.sv;break;
    case 'kind':
      if(v==='spell'){A.spellTab=true; break;}
      A.spellTab=false;
      if(A.kind==='heal'||A.kind==='temp')A.lastHeal=A.kind;
      var nk=(v==='heal'&&A.lastHeal==='temp')?'temp':v;
      if((A.kind==='cond')!==(nk==='cond'))aoeConvertSel(nk==='cond');
      A.kind=nk;break;
    case 'healmode':A.kind=v;A.lastHeal=v;break;
    case 'spPick':spellSelect(t.dataset.n); break;
    case 'spChange':A.lastCaster=A.sp?A.sp.caster:''; A.sp=null; A.spq=''; A.splv=''; A.sel=A.sel||{}; break;
    case 'spRoll':spellRoll(); break;
    case 'condop':A.condOp=v;A.eff={};A.res={};A.lr={};break;
    case 'ab':A.ab=v;break;
    case 'adv':A.adv=v;break;
    case 'onsave':A.onSave=v; Object.keys(A.res).forEach(function(x){if(A.res[x].p)A.eff[x]=(v==='none'?'none':'half');});break;
    case 'attoggle':A.att.use=!A.att.use; break;
    case 'aadv':A.att.adv=v; break;
    case 'rolld20':{
      var r1=d20(), r2=(A.att.adv==='adv'||A.att.adv==='dis')?d20():null, pk=r2==null?r1:(A.att.adv==='adv'?Math.max(r1,r2):Math.min(r1,r2)), md=parseInt(A.att.mod,10)||0;
      A.att.roll=String(pk); A.att.hit={};
      A.att.info='d20 '+(r2==null?r1:r1+' and '+r2+' ('+(A.att.adv==='adv'?'advantage':'disadvantage')+', '+pk+')')+(md?(md>0?' + ':' \u2212 ')+Math.abs(md):'')+' = '+(pk+md)+(pk===20?' \u00b7 natural 20, a hit':(pk===1?' \u00b7 natural 1, a miss':''));
      break;}
    case 'addline':A.att.lines.push({amt:'',type:A.att.lines[A.att.lines.length-1].type});break;
    case 'lsave':{var lsi=parseInt(t.dataset.i,10), lsl=A.att.lines[lsi]; if(lsl)lsl.sv=(lsl.sv===false); break;}
    case 'rmline':if(A.att.lines.length>1)A.att.lines.splice(parseInt(t.dataset.i,10),1);break;
    case 'hitcycle':{var cur=A.att.hit[k]; if(cur==null)A.att.hit[k]=true; else if(cur===true)A.att.hit[k]=false; else delete A.att.hit[k]; break;}
    case 'tog':case 'togname':
      if(a==='tog'&&t.disabled)return;
      A.sel[k]=!A.sel[k]; if(A.sel[k]&&!A.eff[k])A.eff[k]='full'; break;
    case 'secsel':{
      var sec=aoeTargets().filter(function(x){return (v==='pc')===(x.c.kind==='pc')&&aoeUsable(x);});
      var allOn=sec.length&&sec.every(function(x){return A.sel[x.k];});
      sec.forEach(function(x){if(allOn)delete A.sel[x.k]; else {A.sel[x.k]=true; if(!A.eff[x.k])A.eff[x.k]='full';}});
      break;}
    case 'pick':
      T=aoeTargets(); A.sel={};
      T.forEach(function(x){
        if(!aoeUsable(x))return; var r=aoeRole(x);
        if(v==='all'||v===r){A.sel[x.k]=true; if(!A.eff[x.k])A.eff[x.k]='full';}
      }); break;
    case 'eff':A.eff[k]=v;break;
    case 'saveCycle':{var r=A.res[k]; if(!r)aoeSetRes(k,true,'\u2014','Marked as passed by hand'); else if(r.p)aoeSetRes(k,false,'\u2014','Marked as failed by hand'); else aoeSetRes(k,null); break;}
    case 'lr':A.lr[k]=true; A.res[k]={p:true,txt:'LR',tip:'Legendary Resistance'}; A.eff[k]=aoePassEff(); break;
    case 'roll':{
      var dc=parseInt(A.dc,10); if(isNaN(dc)){toast('Enter the save DC first');return;}
      var rs=aoeTargets().filter(function(x){return A.sel[x.k]&&aoeUsable(x)&&x.c.kind!=='pc';});
      if(!rs.length){toast('Tick some NPCs first. Players are marked by hand.');return;}
      rs.forEach(function(x){var r=rollSave(x.c,A.ab,A.adv); aoeSetRes(x.k,r.auto?false:r.t>=dc,r.auto?'auto':String(r.t),saveLine(r,A.ab)+' vs DC '+dc);});
      break;}
    case 'apply':aoeApply();return;
    default:return;
  }
  renderAoe();
});
document.addEventListener('input',function(e){
  var t=e.target; if(!ui.aoe||!t.dataset)return; var k=t.dataset.aoein, A=ui.aoe;
  if(k==='amt'){A.amt=t.value; aoeRefresh();}
  else if(k==='dc'){A.dc=t.value; if(A.sp)A.sp.dcAuto=false;}
  else if(k==='ccustom'){A.cond.custom=t.value; aoeRefresh();}
  else if(k==='cn')A.cond.n=t.value;
  else if(k==='aroll'){A.att.roll=t.value; A.att.info=''; aoeRefresh();}
  else if(k==='amod'){A.att.mod=t.value; A.att.info=''; if(A.sp)A.sp.atkAuto=false; aoeRefresh();}
  else if(k==='aamt'){A.att.lines[parseInt(t.dataset.i,10)].amt=t.value; aoeRefresh();}
});
document.addEventListener('change',function(e){
  var t=e.target; if(!ui.aoe||!t.dataset||!t.dataset.aoein)return; var k=t.dataset.aoein, A=ui.aoe, f=A.cond;
  if(k==='cname'){f.name=t.value; if(SPELL_ROUNDS[f.name]&&f.dur==='manual'){f.dur='rounds';f.n=SPELL_ROUNDS[f.name];} renderAoe();}
  else if(k==='clevel'){f.level=t.value; aoeRefresh();}
  else if(k==='cdur'){f.dur=t.value; renderAoe();}
  else if(k==='cowner')f.owner=t.value;
  else if(k==='ccustom'){f.custom=t.value; renderAoe();}
  else if(k==='atype'){A.att.lines[parseInt(t.dataset.i,10)].type=t.value; renderAoe();}
  else if(k==='ares'){A.att.res=t.checked; aoeRefresh();}
});
document.addEventListener('keydown',function(e){
  var t=e.target; if(!ui.aoe||!t.dataset)return;
  if(e.key==='Enter'&&(t.dataset.aoein==='amt'||t.dataset.aoein==='aroll'||t.dataset.aoein==='amod'||t.dataset.aoein==='aamt')){e.preventDefault();aoeApply();}
});

