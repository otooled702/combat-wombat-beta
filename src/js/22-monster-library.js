/* ================================================================
   22. Monster library
   Every creature in the System Reference Document 5.2 (the 2024 rules), searchable and sortable,
   importable straight into the fight or into your saved NPCs. Creature data: SRD 5.2,
   (c) Wizards of the Coast LLC, licensed CC BY 4.0.
   ================================================================ */

var MM=null, ABK=['str','dex','con','int','wis','cha'], ABN=['STR','DEX','CON','INT','WIS','CHA'];
function crText(c){return c===0.125?'1/8':c===0.25?'1/4':c===0.5?'1/2':String(c);}
/* Older saves kept copies of Book creatures in the library. Now the Book itself holds everything: a copy that matches the
   Book becomes a star, a changed copy becomes a Modified creature, and a custom monster becomes Homebrew (both starred). */
function mmSrdByName(n){var l=baseName(n).trim().toLowerCase(); return mmData().filter(function(m){return m.n.toLowerCase()===l;})[0]||null;}
function libLegacyMeta(e){
  var segs=String((e.sheet&&e.sheet.notes)||'').split(' \u00b7 '), cr='', ty='';
  segs.forEach(function(g,i){var m=/^CR\s+(\S+)/.exec(g.trim()); if(m)cr=m[1]; else if(i===0&&g.trim()&&g.length<60)ty=g.trim();});
  return {type:ty,cr:cr};
}
function libMigrate(o){
  o.stars=o.stars||[]; o.library=o.library||[]; o.folders=o.folders||[]; o.folderOf=o.folderOf||{}; o.spellOpt=o.spellOpt||{}; o.spellRecent=o.spellRecent||[];
  if(o.libV>=2)return;
  var keep=[], star=function(k){if(o.stars.indexOf(k)<0)o.stars.push(k);};
  o.library.forEach(function(e){
    var src=e.src||(mmSrdByName(e.name)?'mm':'npc');
    if(src==='mm'){
      var b=mmSrdByName(e.name);
      if(b){
        var same=(e.maxHp===b.h)&&JSON.stringify(e.sheet)===JSON.stringify(mmSheet(b));
        if(same){star('srd:'+b.n); return;}
        e.src='mod'; e.base=b.n; e.meta={type:(b.z+' '+b.t.toLowerCase()).trim(),cr:b.crt}; keep.push(e); star('hb:'+e.id); return;
      }
      e.src='npc'; keep.push(e); return;
    }
    if(src==='custom'){e.src='custom'; e.meta=e.meta||libLegacyMeta(e); keep.push(e); star('hb:'+e.id); return;}
    e.src=src; keep.push(e);
  });
  o.library=keep; o.libV=2;
}
function mmData(){
  if(MM)return MM;
  try{MM=JSON.parse(document.getElementById('mmdata').textContent);}catch(e){MM=[];}
  MM.forEach(function(m,i){m.ix=i; m.crt=crText(m.c); m.k=(m.n+' '+m.t+' '+m.z+' '+(m.al||'')+' cr '+m.crt).toLowerCase();});
  return MM;
}
function mmIsLegendary(m){return m.ac_.some(function(a){return a[2]==='LEGENDARY_ACTION';})||m.tr.some(function(t){return /Legendary Resistance/.test(t[0]);});}
function libNew(){return {tab:'book',open:false,q:'',sort:'az',dir:1,type:'',crb:'',src:'',leg:false,disp:'enemy',group:false,kind:'cr',opts:{},npcOpen:{},auto:true,fopen:false,folder:'all',fmenu:null,fmenuNew:false,fnew:false,frename:false,fdel:false,init:null,exp:{},qty:{},form:null};}
function mmMod(v){var x=Math.floor((v-10)/2); return (x>=0?'+':'\u2212')+Math.abs(x);}

function mmFiltered(){
  var L=ui.lib, words=L.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  var br={'':[0,99],a:[0,0.5],b:[1,4],c:[5,10],d:[11,16],e:[17,30]}[L.crb]||[0,99];
  var base=mmAll(); if(L.tab==='saved')base=base.filter(function(m){return isStarred(mmKey(m));});
  if(L.tab==='saved'&&L.folder&&L.folder!=='all')base=base.filter(function(m){var f=state.folderOf[mmKey(m)]; return L.folder==='none'?!f:f===L.folder;});
  return base.filter(function(m){
    if(L.src&&(m.hb?m.hb.src:'srd')!==L.src)return false;
    if(L.type&&m.t!==L.type)return false;
    if(m.c<br[0]||m.c>br[1])return false;
    if(L.leg&&!(m.hb?!!(m.hb.leg&&(m.hb.leg.max||m.hb.leg.rmax)):mmIsLegendary(m)))return false;
    for(var i=0;i<words.length;i++)if(m.k.indexOf(words[i])<0)return false;
    return true;
  });
}
function mmSort(arr){
  var L=ui.lib, byName=function(a,b){return a.n.localeCompare(b.n,undefined,{numeric:true,sensitivity:'base'});};
  if(L.sort==='cr')arr.sort(function(a,b){return (a.c-b.c)*L.dir||byName(a,b);});
  else if(L.sort==='type')arr.sort(function(a,b){return a.t.localeCompare(b.t)||byName(a,b);});
  else arr.sort(function(a,b){return byName(a,b)*L.dir;});
  return arr;
}

/* What a creature becomes in the app: a sheet, plus legendary tracking where it applies. */
function mmSheet(m){
  var sh=blankSheet(); sh.ac=String(m.a); sh.speed=m.s; sh.initBonus=String(m.ib||0);
  ABK.forEach(function(k,i){sh.ab[k].score=String(m.ab[i]); if(m.sv&&m.sv[k]!=null)sh.ab[k].save=String(m.sv[k]);});
  sh.resist=m.r||''; sh.immune=m.i||''; sh.vuln=m.v||'';
  var A=[], N=[];
  m.ac_.forEach(function(a){
    if(a[2]==='ACTION')A.push(a[0]+'. '+a[1]);
    else if(a[2]==='BONUS_ACTION')A.push('Bonus Action \u2014 '+a[0]+'. '+a[1]);
    else if(a[2]==='REACTION')A.push('Reaction \u2014 '+a[0]+'. '+a[1]);
  });
  sh.attacks=A.join('\n');
  N.push(m.z+' '+m.t.toLowerCase()+(m.al?', '+m.al:'')+' \u00b7 CR '+m.crt+' ('+m.xp+' XP)');
  N.push(m.d+' hit dice \u00b7 '+m.sn+(m.l?' \u00b7 Languages: '+m.l:''));
  if(m.ci)N.push('Condition immunities: '+m.ci);
  m.tr.forEach(function(t){N.push(t[0]+'. '+t[1]);});
  var la=m.ac_.filter(function(a){return a[2]==='LEGENDARY_ACTION';});
  if(la.length){N.push('Legendary actions (3 per round, one per other creature\u2019s turn):'); la.forEach(function(a){N.push('\u2022 '+a[0]+(a[3]>1?' (costs '+a[3]+')':'')+'. '+a[1]);});}
  sh.notes=N.join('\n');
  return sh;
}
function mmLeg(m){
  var la=m.ac_.some(function(a){return a[2]==='LEGENDARY_ACTION';}), lr=0;
  m.tr.forEach(function(t){var x=/Legendary Resistance \((\d+)\/Day/.exec(t[0]); if(x)lr=parseInt(x[1],10);});
  return (la||lr)?{max:la?3:0,rmax:lr}:null;
}
function mmAdd(m,qty,disp,asGroup,inits){
  var sh=mmSheet(m), lgd=mmLeg(m), q=Math.max(1,Math.min(20,parseInt(qty,10)||1)), rolled=[];
  var iv=function(i){var t=(inits&&inits[i||0]!=null)?inits[i||0]:rollInit(sh).t; rolled.push(t); return t;};
  mutate(function(){
    var names=numberedNames(m.n,q);
    if(asGroup&&q>1)addCombatant({name:names[0],kind:'npc',disp:disp,init:iv(0),members:makeMembers(q,m.h),sheet:clone(sh),src:'mm'});
    else names.forEach(function(nm,ni){addCombatant({name:nm,kind:'npc',disp:disp,init:iv(ni),hp:m.h,maxHp:m.h,src:'mm',sheet:clone(sh),leg:lgd?{max:lgd.max,left:lgd.max,rmax:lgd.rmax,rleft:lgd.rmax}:null});});
    notes.push('Added '+(q>1?q+' \u00d7 ':'')+m.n+' \u2014 initiative '+rolled.join(', '));
  });
}

function mmDetailHTML(m){
  var ab=ABN.map(function(k,i){return '<span><b>'+k+'</b> '+m.ab[i]+' <i>'+mmMod(m.ab[i])+'</i></span>';}).join('');
  var rows=[['Speed',m.s],['Hit points',m.h+' ('+m.d+')'],['Saves',m.sv?Object.keys(m.sv).map(function(k){return k.toUpperCase()+' '+(m.sv[k]>=0?'+':'\u2212')+Math.abs(m.sv[k]);}).join(', '):''],
    ['Resistances',m.r],['Immunities',m.i],['Vulnerabilities',m.v],['Condition immunities',m.ci],['Senses',m.sn],['Languages',m.l]];
  var kv=rows.filter(function(r){return r[1];}).map(function(r){return '<p><b>'+r[0]+'.</b> '+esc(r[1])+'</p>';}).join('');
  var blk=function(title,list){return list.length?'<h4>'+title+'</h4>'+list.map(function(a){return '<p><b>'+esc(a[0])+'.</b> '+esc(a[1])+'</p>';}).join(''):'';};
  var by=function(t){return m.ac_.filter(function(a){return a[2]===t;});};
  return '<div class="mmdetail"><div class="mmabs">'+ab+'</div>'+kv+blk('Traits',m.tr)+blk('Actions',by('ACTION'))+blk('Bonus actions',by('BONUS_ACTION'))+blk('Reactions',by('REACTION'))+blk('Legendary actions',by('LEGENDARY_ACTION'))+'</div>';
}
function addFormsHTML(){
  var pcForm=
    '<div class="addform">'+
      '<form class="stack" id="pcForm" autocomplete="off">'+
        '<label class="full">Character name<input type="text" name="name" required></label>'+
        '<label>Player name<input type="text" name="player"></label>'+
        '<label>Max HP<input type="number" name="maxHp" min="1" placeholder="Optional"></label>'+
        '<label>AC<input type="text" inputmode="numeric" name="ac" placeholder="Optional"></label>'+
        '<label>Speed<input type="text" name="speed" placeholder="30 ft."></label>'+
        '<button class="btn full" type="submit">Add to party</button>'+
      '</form>'+
      '<p class="help">Saved for every session. Add scores, saves and an image later from Party \u2192 pencil \u2192 Stats &amp; notes.</p></div>';
  var npcForm=
    '<div class="addform">'+
      '<form class="stack" id="addForm" autocomplete="off">'+
        '<label class="full">Name<input type="text" name="name" required></label>'+
        '<div class="full initrow"><label>Initiative<input type="number" step="any" name="init" placeholder="Roll for me"></label><label>Bonus<input type="number" name="initmod" placeholder="+0"></label><button type="button" class="btn dice" data-act="rollInitForm" title="Roll a d20 now and fill in the result">\ud83c\udfb2 Roll</button></div>'+
        '<label>Max HP<input type="number" name="hp" min="1" placeholder="Optional"></label>'+
        '<label>AC<input type="text" inputmode="numeric" name="ac" placeholder="Optional"></label>'+
        '<label>How many<input type="number" name="qty" min="1" max="20" value="1"></label>'+
        '<label class="full">Type<select name="disp"><option value="enemy">Enemy</option><option value="neutral">Neutral</option><option value="ally">Ally</option></select></label>'+
        '<label class="check full"><input type="checkbox" class="tgl" name="hidden">Hide from players</label>'+
        '<label class="check full"><input type="checkbox" class="tgl" name="group">Group them on one card</label>'+
        '<label class="check full"><input type="checkbox" class="tgl" name="save">Also save to library</label>'+
        '<button class="btn primary full" type="submit">Add to initiative</button>'+
      '</form>'+
      '<p class="help">Leave initiative empty to roll d20 plus the bonus for each creature (once for a group). With more than one, names are numbered (Goblin 1, Goblin 2\u2026). Grouped, they share one card and one initiative slot, with a separate health bar for each.</p></div>';
  return {player:pcForm,npc:npcForm};
}

/* ---------- Add window: Player / NPC / Creature, and Manual / Generate / Library ---------- */
var ADD_TYPES=[['player','Player'],['npc','NPC'],['creature','Creature']];
var STD_NPCS=[
 ['Town Guard','Guard','Guards & soldiers'],['Guard Captain','Guard Captain','Guards & soldiers'],['Gate Warden','Guard','Guards & soldiers'],['Soldier','Warrior Infantry','Guards & soldiers'],['Veteran Soldier','Warrior Veteran','Guards & soldiers'],['Mercenary','Warrior Veteran','Guards & soldiers'],['Scout','Scout','Guards & soldiers'],['Knight','Knight','Guards & soldiers'],['Gladiator','Gladiator','Guards & soldiers'],
 ['Villager','Commoner','Townsfolk'],['Innkeeper','Commoner','Townsfolk'],['Barkeep','Commoner','Townsfolk'],['Blacksmith','Commoner','Townsfolk'],['Baker','Commoner','Townsfolk'],['Farmer','Commoner','Townsfolk'],['Merchant','Commoner','Townsfolk'],['Stablehand','Commoner','Townsfolk'],['Servant','Commoner','Townsfolk'],['Fisher','Commoner','Townsfolk'],['Beggar','Commoner','Townsfolk'],['Town Crier','Commoner','Townsfolk'],['Ferryman','Commoner','Townsfolk'],
 ['Noble','Noble','Nobles & courts'],['Courtier','Noble','Nobles & courts'],['Steward','Noble','Nobles & courts'],
 ['Acolyte','Priest Acolyte','Priests & scholars'],['Healer','Priest Acolyte','Priests & scholars'],['Priest','Priest','Priests & scholars'],['Sage','Commoner','Priests & scholars'],['Hedge Mage','Mage','Priests & scholars'],['Archmage','Archmage','Priests & scholars'],['Druid','Druid','Priests & scholars'],['Cultist','Cultist','Priests & scholars'],['Cult Fanatic','Cultist Fanatic','Priests & scholars'],
 ['Bandit','Bandit','Criminals & outlaws'],['Bandit Captain','Bandit Captain','Criminals & outlaws'],['Smuggler','Bandit','Criminals & outlaws'],['Thug','Tough','Criminals & outlaws'],['Crime Boss','Tough Boss','Criminals & outlaws'],['Spy','Spy','Criminals & outlaws'],['Assassin','Assassin','Criminals & outlaws'],['Pirate','Pirate','Criminals & outlaws'],['Pirate Captain','Pirate Captain','Criminals & outlaws'],['Berserker','Berserker','Criminals & outlaws']
];
function blankDraft(){return {name:'',type:'',cr:'',ac:'',hp:'',speed:'',dex:'',fav:true};}
function addStripHTML(A){
  var modes=[['manual','Manual'],['generate','Generate'],['library','Library']].filter(function(m){return !(A.type==='creature'&&m[0]==='generate');});
  return '<div class="addstrip"><div class="seg sm" role="radiogroup" aria-label="What to add">'+ADD_TYPES.map(function(o){return '<button type="button" role="radio" aria-checked="'+(A.type===o[0])+'" data-add="go" data-type="'+o[0]+'" data-mode="'+A.mode+'">'+o[1]+'</button>';}).join('')+'</div>'+
    '<div class="seg sm" role="radiogroup" aria-label="How to add it">'+modes.map(function(m){return '<button type="button" role="radio" aria-checked="'+(A.mode===m[0])+'" data-add="go" data-type="'+A.type+'" data-mode="'+m[0]+'">'+m[1]+'</button>';}).join('')+'</div></div>';
}
function renderAdd(){
  var el=document.getElementById('addwrap'); if(!el)return;
  var A=ui.add; if(!A||!(A.mode==='manual'||(A.mode==='library'&&A.type==='player'))){if(el.innerHTML)el.innerHTML='';return;}
  var ae=document.activeElement; if(el.firstChild&&ae&&el.contains(ae)&&ae.tagName&&/INPUT|TEXTAREA|SELECT/.test(ae.tagName))return;
  var body, F=addFormsHTML(), name={player:'a player',npc:'an NPC',creature:'a creature'}[A.type];
  if(A.mode==='manual')body=A.type==='player'?F.player:(A.type==='npc'?F.npc:'<div class="addform">'+mmFormHTML()+'</div>');
  else body='<div class="addform">'+(state.party.length?'<p class="help">Your saved players. Type an initiative and add them to the fight.</p>'+partyListHTML():'<p class="help">No players saved yet. Use Manual to add your first.</p>')+'</div>';
  el.innerHTML='<div class="scrim open" data-add="close"></div><div class="qrmodal addmodal" role="dialog" aria-modal="true" aria-label="Add '+name+'"><div class="dhead"><h2>Add '+name+'</h2><button type="button" class="btn small" data-add="close">Done</button></div><div class="qrbody addbody">'+addStripHTML(A)+body+'</div></div>';
}
function addGo(type,mode){
  if(ui.lib){ui.lib.open=false;ui.lib.init=null;ui.lib.fopen=false;ui.lib.fmenu=null;ui.lib.form=null;} if(ui.build)ui.build.open=false;
  ui.add=null; ui.addCtx=null; renderLib(); renderBuild(); renderAdd();
  if(type==='creature'&&mode==='generate')mode='manual';
  ui.addCtx={type:type,mode:mode};
  if(mode==='generate'){
    ui.build=ui.build||bdNew(); ui.build.dest=type==='npc'?'npc':'party'; ui.build.open=true;
    if(!ui.build.name||ui.build.auto){ui.build.name=genName(ui.build.species);ui.build.auto=true;}
    renderBuild(); return;
  }
  if(mode==='library'&&type!=='player'){ui.lib=ui.lib||libNew(); ui.lib.open=true; libSetTab(ui.lib,type==='npc'?'npcs':'book'); ui.lib.form=null; renderLib(); return;}
  ui.add={type:type,mode:mode};
  if(type==='creature'&&mode==='manual'){ui.lib=ui.lib||libNew(); ui.lib.form={mode:'new',draft:blankDraft()};}
  renderAdd();
  focusEl('#addwrap input[name=name], #addwrap [data-mcf=name]');
}
document.addEventListener('click',function(e){
  var t=e.target.closest&&e.target.closest('[data-add]'); if(!t)return;
  if(t.dataset.add==='close'){ui.add=null;ui.addCtx=null;if(ui.lib)ui.lib.form=null;renderAdd();}
  else if(t.dataset.add==='go')addGo(t.dataset.type,t.dataset.mode);
});
/* standard NPCs: a role name on a Book stat block */
/* Creature tabs and the NPCs tab each remember their own "Add as" and "Group copies".
   NPCs start as Neutral, added as one grouped card; creatures start as Enemy, one card each. */
var LIB_OPT_DEFAULT={cr:{disp:'enemy',group:false},npc:{disp:'neutral',group:true}};
function libSetTab(L,v){
  var k=v==='npcs'?'npc':'cr', ok=L.kind||'cr'; L.tab=v; L.opts=L.opts||{};
  if(k===ok)return;
  L.opts[ok]={disp:L.disp,group:!!L.group};
  var n=L.opts[k]||LIB_OPT_DEFAULT[k]; L.disp=n.disp; L.group=n.group; L.kind=k;
}
function stdIsSaved(i){var r=STD_NPCS[i], lc=r?r[0].toLowerCase():''; return !!r&&state.library.some(function(x){return monSrc(x)==='npc'&&x.name.toLowerCase()===lc;});}
function stdBase(i){var r=STD_NPCS[i]; return r?mmSrdByName(r[1]):null;}
function stdAdd(i,qty,disp,asGroup,inits){
  var r=STD_NPCS[i], b=stdBase(i); if(!r||!b)return;
  var sh=mmSheet(b), q=Math.max(1,Math.min(20,parseInt(qty,10)||1)), rolled=[], iv=function(k){var t=(inits&&inits[k||0]!=null)?inits[k||0]:rollInit(sh).t; rolled.push(t); return t;};
  mutate(function(){
    var names=numberedNames(r[0],asGroup&&q>1?1:q);
    if(asGroup&&q>1)addCombatant({name:names[0],kind:'npc',disp:disp,init:iv(0),members:makeMembers(q,b.h),sheet:clone(sh),src:'npc'});
    else names.forEach(function(nm,ni){addCombatant({name:nm,kind:'npc',disp:disp,init:iv(ni),hp:b.h,maxHp:b.h,sheet:clone(sh),src:'npc'});});
    notes.push('Added '+(q>1?q+' \u00d7 ':'')+r[0]+' \u2014 initiative '+rolled.join(', '));
  });
}
function stdRowHTML(i){
  var L=ui.lib, r=STD_NPCS[i], b=stdBase(i); if(!b)return '';
  var k='std:'+i, q=L.qty[k]||1;
  var st=stdIsSaved(i);
  return '<div class="mmrow stdrow'+(st?' starred':'')+'" data-std="'+i+'"><button type="button" class="icon mmstar'+(st?' on':'')+'" data-mm="stdstar" data-k="'+k+'" aria-pressed="'+st+'" aria-label="'+(st?'Remove '+esc(r[0])+' from your NPCs':'Save '+esc(r[0])+' to your NPCs')+'" title="'+(st?'Saved to your NPCs. Click to remove':'Save to your NPCs')+'">'+(st?ICONS.starOn:ICONS.star)+'</button><span class="mmname static"><span class="mmtitle"><b>'+esc(r[0])+'</b></span><small>Uses the '+esc(b.n)+' stat block</small></span>'+
    '<span class="mmnums"><span class="mmcr">CR '+esc(b.crt)+'</span><span class="mmstat">AC '+b.a+'</span><span class="mmstat">HP '+b.h+'</span></span>'+
    '<span class="mmadd"><span class="mmqty"><button type="button" class="icon" data-mm="qty" data-d="-1" data-k="'+k+'" aria-label="Fewer '+esc(r[0])+'">\u2212</button><input type="number" min="1" max="20" value="'+q+'" data-mmq="'+k+'" aria-label="How many '+esc(r[0])+'"><button type="button" class="icon" data-mm="qty" data-d="1" data-k="'+k+'" aria-label="More '+esc(r[0])+'">+</button></span><button type="button" class="btn small" data-mm="stdadd" data-k="'+k+'">Add</button>'+
      '<button type="button" class="icon mmedit" data-mm="stdedit" data-k="'+k+'" aria-label="Edit a copy of '+esc(r[0])+'" title="Edit a copy: make your own version">'+ICONS.pencil+'</button></span></div>';
}
function renderStdNpcs(){
  var el=document.getElementById('stdnpcs'); if(!el||!ui.lib)return;
  var L=ui.lib, q=(L.sq||'').trim().toLowerCase(), cats=[], by={};
  STD_NPCS.forEach(function(r,i){ if(!stdBase(i))return; if(q&&(r[0]+' '+r[1]+' '+r[2]).toLowerCase().indexOf(q)<0)return; if(!by[r[2]]){by[r[2]]=[];cats.push(r[2]);} by[r[2]].push(i); });
  el.innerHTML='<h4 class="mmsec stdhead"><span>Standard NPCs</span></h4>'+(cats.length?cats.map(function(c){
    var open=!!q||!!L.npcOpen[c];
    return '<button type="button" class="mmsec stdgrp'+(open?' open':'')+'" data-mm="stdgrp" data-v="'+esc(c)+'" aria-expanded="'+open+'"><span class="stdchev" aria-hidden="true">'+(open?'\u25be':'\u25b8')+'</span><span>'+esc(c)+'</span><small>'+by[c].length+'</small></button>'+(open?by[c].map(stdRowHTML).join(''):'');}).join(''):'<p class="help">No standard NPC matches that.</p>');
}

/* ---------- Library: Book | Saved | NPCs ---------- */
var SIZES=['Tiny','Small','Medium','Large','Huge','Gargantuan'];
function parseCR(t){t=String(t==null?'':t).trim(); if(t==='1/2')return .5; if(t==='1/4')return .25; if(t==='1/8')return .125; var n=parseFloat(t); return isNaN(n)?0:n;}
function mmKey(m){return m.hb?'hb:'+m.hb.id:'srd:'+m.n;}
function isStarred(k){return state.stars.indexOf(k)>=0;}
function mmTypes(){var t=[]; mmData().forEach(function(m){if(t.indexOf(m.t)<0)t.push(m.t);}); return t.sort();}
/* The creatures you made or changed, shaped like Book entries so the same rows, filters and Add button work. */
function hbAsMm(e){
  var meta=e.meta||{}, sh=e.sheet||{}, tl=(meta.type||'').trim(), words=tl?tl.split(/\s+/):[], z='';
  if(words.length&&SIZES.indexOf(cap(words[0].toLowerCase()))>=0)z=cap(words.shift().toLowerCase());
  var rest=words.join(' ').toLowerCase(), t=''; mmTypes().forEach(function(x){if(!t&&new RegExp('\\b'+x.toLowerCase()+'\\b').test(rest))t=x;});
  var cr=String(meta.cr==null?'':meta.cr).trim(), ab=ABK.map(function(k){return parseInt(sh.ab&&sh.ab[k]&&sh.ab[k].score,10)||10;});
  return {ix:'h:'+e.id,hb:e,n:e.name,z:z,t:t||'Other',al:'',lbl:tl,c:parseCR(cr),crt:cr||'\u2013',a:parseInt(sh.ac,10)||0,h:e.maxHp||0,ab:ab,s:sh.speed||'',
    k:(e.name+' '+tl+' '+(e.src==='mod'?'modified '+(e.base||''):'homebrew')+' cr '+cr).toLowerCase(),ac_:[],tr:[]};
}
function mmAll(){return mmData().concat(state.library.filter(function(e){return e.src==='custom'||e.src==='mod';}).map(hbAsMm));}
function mmByKey(k){
  if(String(k).indexOf('hb:')===0){var e=state.library.find(function(x){return x.id===k.slice(3);}); return e?hbAsMm(e):null;}
  var n=String(k).slice(4).toLowerCase(); return mmData().filter(function(m){return m.n.toLowerCase()===n;})[0]||null;
}
function mmStarCount(){return mmAll().filter(function(m){return isStarred(mmKey(m));}).length;}
function updateLibCounts(){
  var a=document.getElementById('cntNpc'), b=document.getElementById('cntMon');
  var n=state.library.filter(function(e){return monSrc(e)==='npc';}).length, sc=mmStarCount();
  if(a)a.textContent=n?String(n):''; if(b)b.textContent=sc?String(sc):'';
}
function hbAdd(e,qty,disp,asGroup,inits){
  var sh=hasSheet(e.sheet)?clone(e.sheet):null, lg=e.leg?{max:e.leg.max,left:e.leg.max,rmax:e.leg.rmax,rleft:e.leg.rmax}:null;
  var q=Math.max(1,Math.min(20,parseInt(qty,10)||1)), rolled=[], iv=function(i){var t=(inits&&inits[i||0]!=null)?inits[i||0]:rollInit(e.sheet).t; rolled.push(t); return t;};
  mutate(function(){
    var names=numberedNames(e.name,asGroup&&q>1?1:q);
    if(asGroup&&q>1)addCombatant({name:names[0],kind:'npc',disp:disp,init:iv(0),members:makeMembers(q,e.maxHp),sheet:sh,src:e.src});
    else names.forEach(function(nm,ni){addCombatant({name:nm,kind:'npc',disp:disp,init:iv(ni),hp:e.maxHp,maxHp:e.maxHp,sheet:sh,leg:lg,src:e.src});});
    notes.push('Added '+(q>1?q+' \u00d7 ':'')+e.name+' \u2014 initiative '+rolled.join(', '));
  });
}
function hbDetailHTML(e){
  var sh=e.sheet||{}, ab=ABN.map(function(k,i){var sc=sh.ab&&sh.ab[ABK[i]]&&sh.ab[ABK[i]].score; return '<span><b>'+k+'</b> '+(sc||'\u2013')+(sc?' <i>'+mmMod(parseInt(sc,10))+'</i>':'')+'</span>';}).join('');
  var kv=[['Based on',e.base],['Speed',sh.speed],['Hit points',e.maxHp],['Resistances',sh.resist],['Immunities',sh.immune],['Vulnerabilities',sh.vuln]].filter(function(r){return r[1];}).map(function(r){return '<p><b>'+r[0]+'.</b> '+esc(r[1])+'</p>';}).join('');
  var att=sh.attacks?'<h4>Actions</h4><p class="prewrap">'+esc(sh.attacks)+'</p>':'', nt=sh.notes?'<h4>Features</h4><p class="prewrap">'+esc(sh.notes)+'</p>':'';
  return '<div class="mmdetail"><div class="mmabs">'+ab+'</div>'+kv+att+nt+
    '<div class="mmown"><button type="button" class="btn small" data-act="sheetToggle">'+(sheetOpen('l',e.id)?'Hide editor':'Edit stats')+'</button><button type="button" class="btn small ghost danger" data-act="libDel">Delete</button></div>'+(sheetOpen('l',e.id)?sheetPanel('l',e):'')+'</div>';
}
function folderMenuHTML(key){
  var L=ui.lib, cur=state.folderOf[key]||'';
  var opt=function(id,label){return '<button type="button" role="menuitemradio" aria-checked="'+(cur===id)+'" data-mm="tofolder" data-k="'+esc(key)+'" data-f="'+esc(id)+'">'+esc(label)+'</button>';};
  return '<div class="mmfmenu" role="menu" aria-label="Move to a folder">'+opt('','No folder')+state.folders.map(function(f){return opt(f.id,f.name);}).join('')+
    (L.fmenuNew?'<form class="mmfmform" data-mmfmenuform data-k="'+esc(key)+'"><input data-mmfm placeholder="Folder name" autocomplete="off" required aria-label="New folder name"><button type="submit" class="btn small primary">Create</button></form>':'<button type="button" class="mmfnewbtn" data-mm="fmenunew">+ New folder\u2026</button>')+'</div>';
}
function mmRowHTML(m){
  var L=ui.lib, key=mmKey(m), open=!!L.exp[key], q=L.qty[key]||1, own=!!m.hb, st=isStarred(key), k=esc(key), saved=L.tab==='saved';
  var tag=own?'<span class="mmtag '+(m.hb.src==='mod'?'mod':'hb')+'">'+(m.hb.src==='mod'?'Modified':'Homebrew')+'</span>':'';
  var fn=(saved&&state.folders.length&&state.folderOf[key])?folderNameOf(state.folderOf[key]):'';
  var sub=own?(m.lbl||(m.hb.src==='mod'&&m.hb.base?'Based on '+m.hb.base:'Homebrew creature')):(m.z+' '+m.t.toLowerCase()+(m.al?', '+m.al:''));
  return '<div class="mmrow'+(open?' open':'')+(st?' starred':'')+'" data-mi="'+k+'"'+(own?' data-lid="'+m.hb.id+'"':'')+'>'+
    '<button type="button" class="icon mmstar'+(st?' on':'')+'" data-mm="star" data-k="'+k+'" aria-pressed="'+st+'" aria-label="'+(st?'Remove '+esc(m.n)+' from Saved':'Save '+esc(m.n)+' to Saved')+'" title="'+(st?'Saved. Click to remove':'Save to your favourites')+'">'+(st?ICONS.starOn:ICONS.star)+'</button>'+
    '<button type="button" class="mmname" data-mm="exp" data-k="'+k+'" aria-expanded="'+open+'"><span class="mmtitle"><b>'+esc(m.n)+'</b>'+tag+'</span><small>'+esc(sub)+(fn?' \u00b7 '+esc(fn):'')+'</small></button>'+
    '<span class="mmnums"><span class="mmcr" title="Challenge rating">CR '+esc(m.crt)+'</span><span class="mmstat">AC '+(m.a||'\u2013')+'</span><span class="mmstat">HP '+(m.h||'\u2013')+'</span></span>'+
    '<span class="mmadd"><span class="mmqty"><button type="button" class="icon" data-mm="qty" data-d="-1" data-k="'+k+'" aria-label="Fewer '+esc(m.n)+'">\u2212</button><input type="number" min="1" max="20" value="'+q+'" data-mmq="'+k+'" aria-label="How many '+esc(m.n)+'"><button type="button" class="icon" data-mm="qty" data-d="1" data-k="'+k+'" aria-label="More '+esc(m.n)+'">+</button></span>'+
      '<button type="button" class="btn small" data-mm="add" data-k="'+k+'">Add</button>'+
      (saved?'<span class="mmfwrap"><button type="button" class="icon mmfold'+(state.folderOf[key]?' on':'')+'" data-mm="fmenu" data-k="'+k+'" aria-haspopup="menu" aria-expanded="'+(L.fmenu===key)+'" aria-label="Move '+esc(m.n)+' to a folder" title="Move to a folder">'+ICONS.folder+'</button>'+(L.fmenu===key?folderMenuHTML(key):'')+'</span>':'')+
      '<button type="button" class="icon mmedit" data-mm="edit" data-k="'+k+'" aria-label="'+(own?'Edit '+esc(m.n):'Edit a copy of '+esc(m.n))+'" title="'+(own?'Edit this creature':'Edit a copy: make your own version')+'">'+ICONS.pencil+'</button></span>'+
    (open?(own?hbDetailHTML(m.hb):mmDetailHTML(m)):'')+'</div>';
}
function folderNameOf(id){var f=state.folders.find(function(x){return x.id===id;}); return f?f.name:'';}
function mmListHTML(arr){
  var L=ui.lib, out='', last=null, cnt={};
  if(L.sort==='type')arr.forEach(function(m){cnt[m.t]=(cnt[m.t]||0)+1;});
  arr.forEach(function(m){
    var key=L.sort==='cr'?'CR '+m.crt:(L.sort==='type'?m.t:m.n.charAt(0).toUpperCase());
    if(key!==last){last=key; out+='<div class="mmsec"><span>'+esc(key)+'</span>'+(L.sort==='type'?'<small>'+cnt[m.t]+'</small>':'')+'</div>';}
    out+=mmRowHTML(m);
  });
  if(out)return out;
  return L.tab==='saved'&&!mmStarCount()?'<p class="help">Nothing saved yet. Press the star on a creature in Creatures to keep it here.</p>':'<p class="help">No creatures match. Try fewer words, or clear the filters.</p>';
}
function mmRenderList(keepScroll){
  var list=document.getElementById('mmlist'); if(!list||!ui.lib)return;
  var top=list.scrollTop, arr=mmSort(mmFiltered());
  list.innerHTML=mmListHTML(arr);
  var L=ui.lib, c=document.getElementById('mmcount'); if(c)c.textContent=arr.length+' of '+(L.tab==='saved'?mmStarCount():mmAll().length)+' creatures';
  list.scrollTop=keepScroll?top:0;
}
function mmTabsHTML(L){
  return '<div class="mmtabs"><div class="seg sm" role="radiogroup" aria-label="Library section">'+[['book','Creatures',''],['saved','Saved','cntMon'],['npcs','NPCs','cntNpc'],['spells','Spells','']].map(function(o){
    return '<button type="button" role="radio" aria-checked="'+((L.tab||'book')===o[0])+'" data-mm="tab" data-v="'+o[0]+'">'+o[1]+(o[2]?'<span class="mmcnt" id="'+o[2]+'"></span>':'')+'</button>';}).join('')+'</div></div>';
}
function mmFormHTML(){
  var L=ui.lib, F=L.form; if(!F)return '';
  var d=F.draft, f=function(k,label,attrs,cls){return '<label'+(cls?' class="'+cls+'"':'')+'>'+label+'<input data-mcf="'+k+'" value="'+esc(d[k])+'" autocomplete="off"'+(attrs||'')+'></label>';};
  return '<form class="stack mmcform" data-cform autocomplete="off"><h3 class="full mmfhead">'+(F.mode==='copy'?'Edit a copy of '+esc(F.baseName):'New homebrew creature')+'</h3>'+
    (F.npc?'<p class="help full">Traits and actions come across with it. It is saved to your NPCs; use Stats on its row there for the rest.</p>':F.mode==='copy'?'<p class="help full">Traits and actions come across with it. Change what you like here, then use Edit stats on its row for the rest. It is marked Modified.</p>':'<p class="help full">It is marked Homebrew. Add abilities, attacks and notes afterwards with Edit stats on its row.</p>')+
    f('name','Name',' required','full')+f('type','Size and type',' placeholder="Large beast"','full')+f('cr','CR',' placeholder="1/2"')+f('ac','AC',' inputmode="numeric"')+f('hp','Hit points',' type="number" min="1"')+f('speed','Speed',' placeholder="30 ft."')+f('dex','Dexterity',' type="number" min="1" max="30" placeholder="10"')+
    (F.npc?'':'<label class="check full"><input type="checkbox" class="tgl" data-mcf="fav"'+(d.fav!==false?' checked':'')+'>Add to Saved</label>')+
    '<div class="full mmcbtns"><button type="submit" class="btn primary" data-cfgo="save">Save</button><button type="submit" class="btn" data-cfgo="fight">Save and add to fight</button><button type="button" class="btn ghost" data-mm="fcancel">Cancel</button></div></form>';
}
function renderLibForm(){var f=document.getElementById('mmform'); if(f)f.innerHTML=mmFormHTML();}
/* typing an initiative instead of rolling it */
function mmInitHTML(){
  var L=ui.lib, I=L.init; if(!I)return '';
  var m=String(I.k).indexOf('std:')===0?{n:(STD_NPCS[parseInt(String(I.k).slice(4),10)]||['?'])[0]}:mmByKey(I.k); if(!m)return '';
  var cnt=I.group?1:I.qty, many=cnt>6, boxes=many?1:cnt;
  var inputs='';
  for(var i=0;i<boxes;i++)inputs+='<label><span>'+(many?'All '+cnt:(cnt>1?'#'+(i+1):'Initiative'))+'</span><input type="number" step="any" data-mmi="'+i+'" value="'+esc(I.vals[i]==null?'':I.vals[i])+'" aria-label="Initiative'+(cnt>1&&!many?' for number '+(i+1):'')+'" required></label>';
  return '<form class="mminit" data-mminitform><b>Initiative for '+esc(m.n)+(I.qty>1?' \u00d7 '+I.qty:'')+'</b><div class="mminitf">'+inputs+'</div><div class="mmcbtns"><button type="submit" class="btn primary small">Add</button><button type="button" class="btn ghost small" data-mm="initcancel">Cancel</button></div></form>';
}
function renderLibInit(){var f=document.getElementById('mminit'); if(f)f.innerHTML=mmInitHTML();}
/* folders in the Saved tab */
function renderFolderBar(){
  var el=document.getElementById('mmfolders'); if(!el)return;
  var L=ui.lib; if(L.tab!=='saved'){el.innerHTML='';return;}
  var cnt=function(id){return mmAll().filter(function(m){var k=mmKey(m); if(!isStarred(k))return false; var f=state.folderOf[k]; return id==='all'?true:(id==='none'?!f:f===id);}).length;};
  var chip=function(id,label){return '<button type="button" class="chipbtn mmfchip'+(L.folder===id?' on':'')+'" role="tab" aria-selected="'+(L.folder===id)+'" aria-pressed="'+(L.folder===id)+'" data-mm="folder" data-v="'+esc(id)+'">'+esc(label)+'<span class="mmcnt2">'+cnt(id)+'</span></button>';};
  var custom=state.folders.some(function(f){return f.id===L.folder;});
  var html='<div class="mmfolders" role="tablist" aria-label="Folders">'+chip('all','All saved')+chip('none','Unfiled')+state.folders.map(function(f){return chip(f.id,f.name);}).join('');
  html+=L.fnew?'<form class="mmfnew" data-mmfnewform><input data-mmfname placeholder="Folder name" autocomplete="off" required aria-label="New folder name"><button type="submit" class="btn small primary">Create</button><button type="button" class="btn small ghost" data-mm="fnewcancel">Cancel</button></form>'
    :'<button type="button" class="chipbtn mmfadd" data-mm="fnew">'+ICONS.folder+'<span>New folder</span></button>';
  html+='</div>';
  if(custom){
    html+=L.frename?'<form class="mmfnew" data-mmfrenform><input data-mmfrname value="'+esc(folderNameOf(L.folder))+'" autocomplete="off" required aria-label="Folder name"><button type="submit" class="btn small primary">Save</button><button type="button" class="btn small ghost" data-mm="frenamecancel">Cancel</button></form>'
      :'<div class="mmfops"><button type="button" class="btn small ghost" data-mm="frename">Rename folder</button><button type="button" class="btn small ghost danger" data-mm="fdel">'+(L.fdel?'Really delete? Creatures stay saved':'Delete folder')+'</button></div>';
  }
  el.innerHTML=html;
}
function filterSummary(L){
  var out=[], nm={srd:'SRD',custom:'Homebrew',mod:'Modified'}, crs={a:'CR 0 \u2013 1/2',b:'CR 1 \u2013 4',c:'CR 5 \u2013 10',d:'CR 11 \u2013 16',e:'CR 17 \u2013 30'};
  if(L.src)out.push(['src',nm[L.src]]); if(L.type)out.push(['type',L.type]); if(L.crb)out.push(['crb',crs[L.crb]]); if(L.leg)out.push(['leg','Legendary']);
  return out;
}
function renderLib(){
  var el=document.getElementById('libwrap'); if(!el)return;
  var L=ui.lib; if(!L||!L.open){if(el.innerHTML)el.innerHTML='';document.body.classList.remove('libopen');return;}
  if(['book','saved','npcs','spells'].indexOf(L.tab)<0)L.tab='book';
  var head='<div class="scrim open" data-mm="close"></div><div class="qrmodal libmodal" role="dialog" aria-modal="true" aria-label="Library"><div class="dhead"><h2>Library</h2><span class="aoegn" id="mmcount"></span><button type="button" class="btn small" data-mm="close">Close</button></div><div class="qrbody mmbody">'+(ui.addCtx?addStripHTML(ui.addCtx):'')+mmTabsHTML(L);
  if(L.tab==='spells'){renderSpellsTab(el,head); return;}
  if(L.tab==='npcs'){
    var chip0=function(act_,on,label,title){return '<button type="button" class="chipbtn mmopt'+(on?' on':'')+'" data-mm="'+act_+'" aria-pressed="'+!!on+'" title="'+title+'">'+(on?'<span class="mmck" aria-hidden="true">\u2713</span>':'')+label+'</button>';};
    el.innerHTML=head+'<div class="mmctl"><input type="search" class="mmsearch" data-stdq placeholder="Search standard NPCs\u2026" value="'+esc(L.sq||'')+'" aria-label="Search standard NPCs" autocomplete="off">'+(ui.addCtx?'':'<button type="button" class="btn small libbrowse" data-act="buildOpenNpc">'+ICONS.build+'<span class="btxt">Generate an NPC\u2026</span></button>')+
      '<div class="mmbar"><div class="mmisland mmadding" role="group" aria-label="When adding"><span class="mmilab">When adding</span><span class="mmas">Add as <select data-mmf="disp" aria-label="Add as"><option value="enemy"'+(L.disp==='enemy'?' selected':'')+'>Enemy</option><option value="neutral"'+(L.disp==='neutral'?' selected':'')+'>Neutral</option><option value="ally"'+(L.disp==='ally'?' selected':'')+'>Ally</option></select></span>'+chip0('auto',L.auto!==false,'Auto-roll initiative','Roll initiative for each one you add. Turn off to type it in instead')+chip0('group',!!L.group,'Group copies','When adding several, put them on one card')+'</div></div></div>'+
      '<div id="mmform"></div><div id="mminit"></div><div class="mmlist" id="npclist"><div id="library"></div><div id="stdnpcs"></div></div></div></div>';
    renderLibrary(); renderStdNpcs(); renderLibInit(); return;
  }
  var types=mmTypes();
  var seg=function(act,cur,opts,label){return '<div class="seg sm" role="radiogroup" aria-label="'+label+'">'+opts.map(function(o){return '<button type="button" role="radio" aria-checked="'+(cur===o[0])+'" data-mm="'+act+'" data-v="'+o[0]+'">'+o[1]+'</button>';}).join('')+'</div>';};
  var opt=function(v,sel,label){return '<option value="'+esc(v)+'"'+(sel?' selected':'')+'>'+esc(label==null?v:label)+'</option>';};
  var crs=[['','Any CR'],['a','CR 0 \u2013 1/2'],['b','CR 1 \u2013 4'],['c','CR 5 \u2013 10'],['d','CR 11 \u2013 16'],['e','CR 17 \u2013 30']];
  var srcs=[['','All sources'],['srd','SRD'],['custom','Homebrew'],['mod','Modified']];
  var act=filterSummary(L);
  var pop=L.fopen?'<div class="mmfpop" role="dialog" aria-label="Filters"><label>Source<select data-mmf="src" aria-label="Filter by source">'+srcs.map(function(c){return opt(c[0],(L.src||'')===c[0],c[1]);}).join('')+'</select></label>'+
      '<label>Type<select data-mmf="type" aria-label="Filter by type">'+opt('',!L.type,'All types')+types.map(function(t){return opt(t,L.type===t);}).join('')+'</select></label>'+
      '<label>Challenge rating<select data-mmf="crb" aria-label="Filter by challenge rating">'+crs.map(function(c){return opt(c[0],L.crb===c[0],c[1]);}).join('')+'</select></label>'+
      '<label class="check"><input type="checkbox" class="tgl" data-mmf="leg"'+(L.leg?' checked':'')+'>Legendary only</label>'+
      '<div class="mmfbtns"><button type="button" class="btn small ghost" data-mm="fclear"'+(act.length?'':' disabled')+'>Clear all</button><button type="button" class="btn small" data-mm="filters">Done</button></div></div>':'';
  var chip=function(act_,on,label,title){return '<button type="button" class="chipbtn mmopt'+(on?' on':'')+'" data-mm="'+act_+'" aria-pressed="'+!!on+'" title="'+title+'">'+(on?'<span class="mmck" aria-hidden="true">\u2713</span>':'')+label+'</button>';};
  el.innerHTML=head+'<div class="mmctl"><input type="search" class="mmsearch" data-mmsearch placeholder="Search name, type, size or CR\u2026" value="'+esc(L.q)+'" aria-label="Search creatures" autocomplete="off">'+(L.tab==='book'?'<button type="button" class="btn small mmnew" data-mm="new">+ New creature</button>':'')+
      '<div class="mmbar">'+
        '<div class="mmisland mmfisl"><span class="mmfwrap"><button type="button" class="btn small mmfbtn'+(act.length?' on':'')+'" data-mm="filters" aria-expanded="'+!!L.fopen+'" aria-haspopup="dialog">'+ICONS.filter+'<span>Filters</span>'+(act.length?'<span class="mmcnt">'+act.length+'</span>':'')+'</button>'+pop+'</span>'+
          act.map(function(a){return '<button type="button" class="mmfsum" data-mm="unf" data-v="'+a[0]+'" aria-label="Remove filter '+esc(a[1])+'" title="Remove this filter">'+esc(a[1])+' <span aria-hidden="true">\u00d7</span></button>';}).join('')+'</div>'+
        '<div class="mmisland mmsort" role="group" aria-label="Sort"><span class="mmilab">Sort</span>'+seg('sort',L.sort,[['az','A\u2013Z'],['cr','CR'],['type','Type']],'Sort by')+
          (L.sort==='type'?'':'<button type="button" class="btn small ghost mmdir" data-mm="dir" aria-label="Order: '+(L.dir===1?'ascending':'descending')+'. Click to reverse" title="'+(L.dir===1?'Ascending. Click to reverse':'Descending. Click to reverse')+'">'+(L.dir===1?'\u2191':'\u2193')+'</button>')+'</div>'+
        '<div class="mmisland mmadding" role="group" aria-label="When adding"><span class="mmilab">When adding</span><span class="mmas">Add as <select data-mmf="disp" aria-label="Add as"><option value="enemy"'+(L.disp==='enemy'?' selected':'')+'>Enemy</option><option value="neutral"'+(L.disp==='neutral'?' selected':'')+'>Neutral</option><option value="ally"'+(L.disp==='ally'?' selected':'')+'>Ally</option></select></span>'+
          chip('auto',L.auto!==false,'Auto-roll initiative','Roll initiative for each creature you add. Turn off to type it in instead')+chip('group',!!L.group,'Group copies','When adding several, put them on one card')+'</div>'+
        '</div></div>'+
    '<div id="mmfolders"></div><div id="mmform"></div><div id="mminit"></div><div class="mmlist" id="mmlist"></div>'+
    '<p class="mmfoot">Creature data from the System Reference Document 5.2 \u00a9 Wizards of the Coast LLC, licensed under <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noopener">CC BY 4.0</a>. Not affiliated with or endorsed by Wizards of the Coast.</p></div></div>';
  renderFolderBar(); renderLibForm(); renderLibInit(); mmRenderList(false); updateLibCounts();
}

function libAddNow(k,inits){
  var L=ui.lib; if(String(k).indexOf('std:')===0){var si=parseInt(String(k).slice(4),10), sin=document.querySelector('[data-mmq="'+k+'"]'); stdAdd(si,sin?sin.value:(L.qty[k]||1),L.disp,L.group,inits); return;}
  var m=mmByKey(k); if(!m)return; var inp=document.querySelector('[data-mmq="'+String(k).replace(/"/g,'\\"')+'"]'), q=inp?inp.value:(L.qty[k]||1);
  if(m.hb)hbAdd(m.hb,q,L.disp,L.group,inits); else mmAdd(m,q,L.disp,L.group,inits);
}
function folderCreate(name){
  name=(name||'').trim(); if(!name)return null;
  var ex=state.folders.find(function(f){return f.name.toLowerCase()===name.toLowerCase();}); if(ex)return ex.id;
  var f={id:uid(),name:name}; state.folders.push(f); persist(); return f.id;
}
document.addEventListener('click',function(e){
  var t=e.target.closest('[data-mm]'); if(!t||!ui.lib||!(ui.lib.open||ui.add))return;
  var L=ui.lib, a=t.dataset.mm, k=t.dataset.k, m=k?mmByKey(k):null;
  switch(a){
    case 'close':L.open=false;L.form=null;L.init=null;L.fopen=false;L.fmenu=null;ui.addCtx=null;ui.add=null;renderLib();return;
    case 'tab':libSetTab(L,t.dataset.v); L.form=null; L.init=null; L.fmenu=null; L.fopen=false; renderLib(); return;
    case 'new':L.form={mode:'new',draft:{name:'',type:'',cr:'',ac:'',hp:'',speed:'',dex:'',fav:true}}; renderLibForm(); focusEl('[data-mcf=name]'); return;
    case 'edit':if(m){
      if(m.hb){var open=!!L.exp[k]&&sheetOpen('l',m.hb.id); if(open){L.exp[k]=false; ui.sheet=null;} else {L.exp[k]=true; ui.sheet={kind:'l',id:m.hb.id};} render(); return;}
      L.form={mode:'copy',baseKey:k,baseName:m.n,draft:{name:m.n+' (modified)',type:(m.z+' '+m.t.toLowerCase()).trim(),cr:m.crt==='\u2013'?'':m.crt,ac:m.a?String(m.a):'',hp:m.h?String(m.h):'',speed:m.s||'',dex:m.ab&&m.ab[1]?String(m.ab[1]):'',fav:true}};
      renderLibForm(); {var cf=document.querySelector('[data-mcf=name]'); if(cf){cf.focus(); cf.select();}} var ml=document.getElementById('mmlist'); if(ml)ml.scrollTop=0;} return;
    case 'fcancel':if(ui.add){L.form={mode:'new',draft:blankDraft()}; renderAdd(); return;} L.form=null; renderLibForm(); return;
    case 'sort':L.sort=t.dataset.v;renderLib();return;
    case 'dir':L.dir=-L.dir;renderLib();return;
    case 'group':L.group=!L.group;renderLib();return;
    case 'auto':L.auto=(L.auto===false); if(L.auto)L.init=null; renderLib(); return;
    case 'filters':L.fopen=!L.fopen; renderLib(); return;
    case 'fclear':L.src='';L.type='';L.crb='';L.leg=false; renderLib(); return;
    case 'unf':{var v=t.dataset.v; if(v==='leg')L.leg=false; else L[v]=''; renderLib(); return;}
    case 'exp':L.exp[k]=!L.exp[k];mmRenderList(true);return;
    case 'qty':{var q0=parseInt(L.qty[k]||1,10)||1, q1=Math.max(1,Math.min(20,q0+parseInt(t.dataset.d,10))); L.qty[k]=q1; var qi=document.querySelector('[data-mmq="'+String(k).replace(/"/g,'\\"')+'"]'); if(qi)qi.value=q1; return;}
    case 'star':if(m){var ix=state.stars.indexOf(k); if(ix>=0){state.stars.splice(ix,1); delete state.folderOf[k];} else state.stars.push(k); persist(); mmRenderList(true); renderFolderBar(); updateLibCounts();} return;
    case 'spshow':L.spshow=t.dataset.v; renderLib(); return;
    case 'spinc':case 'spexc':{
      var shown=SPELLS.filter(function(x){var q2=(L.spq||'').trim().toLowerCase(), lv2=L.splv==null?'':L.splv, cl2=L.spcl||''; if(q2&&x.n.toLowerCase().indexOf(q2)<0)return false; if(lv2!==''&&String(x.l)!==String(lv2))return false; if(cl2&&(x.cl||[]).indexOf(cl2)<0)return false; var inc=spellIncluded(x); return !L.spshow||L.spshow==='all'||(L.spshow==='in'?inc:!inc);});
      shown.forEach(function(x){var want=(a==='spinc'); if(want===!!x.df)delete state.spellOpt[x.n]; else state.spellOpt[x.n]=want;}); persist(); renderLib(); return;}
    case 'sprst':state.spellOpt={}; persist(); renderLib(); return;
    case 'stdgrp':{var gv=t.dataset.v; L.npcOpen[gv]=!L.npcOpen[gv]; renderStdNpcs(); var gb=document.querySelector('.stdgrp[data-v="'+gv.replace(/"/g,'\\"')+'"]'); if(gb)gb.focus(); return;}
    case 'stdstar':{var si2=parseInt(String(k).slice(4),10), r2=STD_NPCS[si2], b2=stdBase(si2); if(!r2||!b2)return;
      if(stdIsSaved(si2)){var lc2=r2[0].toLowerCase(); toast('Removed '+r2[0]+' from your NPCs',true); mutate(function(){var gone=state.library.filter(function(x){return monSrc(x)==='npc'&&x.name.toLowerCase()===lc2;}).map(function(x){return x.id;}); state.library=state.library.filter(function(x){return gone.indexOf(x.id)<0;}); state.stars=state.stars.filter(function(s3){return gone.indexOf(s3.slice(3))<0;});});}
      else mutate(function(){notes.push(saveToLibrary(r2[0],b2.h,mmSheet(b2),mmLeg(b2),L.disp,'npc'));});
      renderLibrary(); renderStdNpcs(); return;}
    case 'stdedit':{var si3=parseInt(String(k).slice(4),10), r3=STD_NPCS[si3], b3=stdBase(si3); if(!r3||!b3)return;
      L.form={mode:'copy',npc:true,baseKey:'srd:'+b3.n,baseName:r3[0],draft:{name:r3[0]+' (custom)',type:(b3.z+' '+b3.t.toLowerCase()).trim(),cr:b3.crt==='\u2013'?'':b3.crt,ac:b3.a?String(b3.a):'',hp:b3.h?String(b3.h):'',speed:b3.s||'',dex:b3.ab&&b3.ab[1]?String(b3.ab[1]):'',fav:true}};
      renderLibForm(); {var cf2=document.querySelector('[data-mcf=name]'); if(cf2){cf2.focus(); cf2.select();}} var nl=document.getElementById('npclist'); if(nl)nl.scrollTop=0; return;}
    case 'stdadd':{var sq=Math.max(1,Math.min(20,parseInt((document.querySelector('[data-mmq="'+k+'"]')||{}).value,10)||1)); if(L.auto===false){L.init={k:k,qty:sq,group:!!(L.group&&sq>1),vals:[]}; renderLibInit(); focusEl('[data-mmi]'); return;} libAddNow(k,null); return;}
    case 'add':{if(!m)return; var inp=document.querySelector('[data-mmq="'+String(k).replace(/"/g,'\\"')+'"]'), q=Math.max(1,Math.min(20,parseInt(inp?inp.value:1,10)||1));
      if(L.auto===false){L.init={k:k,qty:q,group:!!(L.group&&q>1),vals:[]}; renderLibInit(); focusEl('[data-mmi]'); return;}
      libAddNow(k,null); return;}
    case 'initcancel':L.init=null; renderLibInit(); return;
    case 'folder':L.folder=t.dataset.v; L.fdel=false; L.frename=false; L.fnew=false; renderFolderBar(); mmRenderList(false); return;
    case 'fnew':L.fnew=true; renderFolderBar(); focusEl('[data-mmfname]'); return;
    case 'fnewcancel':L.fnew=false; renderFolderBar(); return;
    case 'frename':L.frename=true; L.fdel=false; renderFolderBar(); {var frn=document.querySelector('[data-mmfrname]'); if(frn){frn.focus(); frn.select();}} return;
    case 'frenamecancel':L.frename=false; renderFolderBar(); return;
    case 'fdel':{if(!L.fdel){L.fdel=true; renderFolderBar(); return;} var fid=L.folder; state.folders=state.folders.filter(function(f){return f.id!==fid;}); Object.keys(state.folderOf).forEach(function(kk){if(state.folderOf[kk]===fid)delete state.folderOf[kk];}); L.folder='all'; L.fdel=false; persist(); renderFolderBar(); mmRenderList(true); toast('Folder deleted. Its creatures are still saved.'); return;}
    case 'fmenu':L.fmenu=(L.fmenu===k)?null:k; L.fmenuNew=false; mmRenderList(true); return;
    case 'fmenunew':L.fmenuNew=true; mmRenderList(true); focusEl('[data-mmfm]'); return;
    case 'tofolder':{var fv=t.dataset.f; if(fv)state.folderOf[k]=fv; else delete state.folderOf[k]; persist(); L.fmenu=null; mmRenderList(true); renderFolderBar(); return;}
  }
});
document.addEventListener('click',function(e){
  var L=ui.lib; if(!L||!L.open)return;
  if(L.fopen&&!(e.target.closest&&e.target.closest('.mmfwrap'))){L.fopen=false; var p=document.querySelector('.mmfpop'); if(p)p.remove(); var fb=document.querySelector('.mmfbtn'); if(fb)fb.setAttribute('aria-expanded','false');}
  if(L.fmenu&&!(e.target.closest&&e.target.closest('.mmfwrap'))){L.fmenu=null; L.fmenuNew=false; mmRenderList(true);}
},true);
document.addEventListener('change',function(e){
  var t=e.target; if(t.dataset&&t.dataset.spinc!==undefined){
    var x=SPELL_BY[t.dataset.spinc]; if(x){ if(t.checked===!!x.df)delete state.spellOpt[x.n]; else state.spellOpt[x.n]=t.checked; persist(); var ce=document.getElementById('spcount'); if(ce)ce.textContent=SPELLS.filter(spellIncluded).length; if(ui.lib&&ui.lib.spshow&&ui.lib.spshow!=='all')renderLib(); }
    return;
  }
  if(t.dataset&&t.dataset.spf!==undefined&&ui.lib){var L2=ui.lib; if(t.dataset.spf==='lv')L2.splv=t.value; else if(t.dataset.spf==='cl')L2.spcl=t.value; renderLib(); return;}
  if(t.dataset&&t.dataset.spin!==undefined&&ui.aoe){ spellInput(t,'change'); return; }
  if(!t.dataset||t.dataset.rck===undefined)return;
  var sh=t.closest('.sheet'), o=ui.resOpen; if(!sh||!o)return;
  var kind=sh.dataset.skind, obj=sheetTarget(kind,sh.dataset.sid); if(!obj)return;
  var s=ensureSheet(obj), p=resParse(s[o.k],o.k), v=t.dataset.rck, arr=(t.dataset.rg==='t')?p.types:p.conds, ix=arr.indexOf(v);
  if(t.checked&&ix<0)arr.push(v); else if(!t.checked&&ix>=0)arr.splice(ix,1);
  s[o.k]=resCompose(p); syncSheet(kind,obj); persist(); refreshSummary(kind,obj); render();
});
document.addEventListener('submit',function(e){
  var f=e.target; if(!f.hasAttribute||!ui.lib||!(ui.lib.open||ui.add))return; var L=ui.lib;
  if(f.hasAttribute('data-mminitform')){
    e.preventDefault(); var I=L.init; if(!I)return; var cnt=I.group?1:I.qty, many=cnt>6, vals=[];
    var boxes=f.querySelectorAll('[data-mmi]'); for(var i=0;i<boxes.length;i++){var n=parseFloat(boxes[i].value); if(isNaN(n)){toast('Type an initiative first'); boxes[i].focus(); return;} vals.push(n);}
    var inits=[]; for(var j=0;j<cnt;j++)inits.push(many?vals[0]:vals[j]);
    L.init=null; libAddNow(I.k,inits); renderLibInit(); return;
  }
  if(f.hasAttribute('data-mmfnewform')){e.preventDefault(); var nm=(f.querySelector('[data-mmfname]').value||'').trim(); if(!nm)return; folderCreate(nm); L.fnew=false; renderFolderBar(); return;}
  if(f.hasAttribute('data-mmfrenform')){e.preventDefault(); var rn=(f.querySelector('[data-mmfrname]').value||'').trim(); if(!rn)return; var fo=state.folders.find(function(x){return x.id===L.folder;}); if(fo){fo.name=rn; persist();} L.frename=false; renderFolderBar(); mmRenderList(true); return;}
  if(f.hasAttribute('data-mmfmenuform')){e.preventDefault(); var key=f.dataset.k, fnm=(f.querySelector('[data-mmfm]').value||'').trim(); if(!fnm)return; var fid2=folderCreate(fnm); if(fid2){state.folderOf[key]=fid2; persist();} L.fmenu=null; L.fmenuNew=false; mmRenderList(true); renderFolderBar(); return;}
  if(!f.hasAttribute('data-cform')||!L.form)return; e.preventDefault();
  var F=L.form, d=F.draft, name=(d.name||'').trim(); if(!name){toast('Give the creature a name');return;}
  var fight=e.submitter&&e.submitter.dataset.cfgo==='fight';
  if(F.npc){
    if(state.library.some(function(x){return monSrc(x)==='npc'&&x.name.toLowerCase()===name.toLowerCase();})){toast('You already have an NPC called '+name);return;}
    var nb=mmByKey(F.baseKey); if(!nb)return; var nsh=mmSheet(nb);
    if((d.ac||'').trim()!=='')nsh.ac=d.ac.trim(); if((d.speed||'').trim()!=='')nsh.speed=d.speed.trim(); if(d.dex)nsh.ab.dex.score=String(d.dex);
    var nhp=parseInt(d.hp,10), nent={id:uid(),name:name,maxHp:isNaN(nhp)?nb.h:nhp,sheet:nsh,leg:mmLeg(nb),disp:L.disp,src:'npc'};
    mutate(function(){state.library.push(nent);}); L.form=null;
    if(fight)hbAdd(nent,1,L.disp,false); else toast('Saved '+name+' to your NPCs');
    render(); renderLib(); return;
  }
  if(state.library.some(function(x){return (x.src==='custom'||x.src==='mod')&&x.name.toLowerCase()===name.toLowerCase();})){toast('You already have a homebrew or modified creature called '+name);return;}
  var sheet, leg=null, base=null, isCopy=F.mode==='copy', bm=isCopy?mmByKey(F.baseKey):null;
  if(isCopy&&bm){sheet=bm.hb?clone(bm.hb.sheet):mmSheet(bm); leg=bm.hb?(bm.hb.leg?{max:bm.hb.leg.max,rmax:bm.hb.leg.rmax}:null):mmLeg(bm); base=bm.hb?(bm.hb.base||bm.n):bm.n;} else {sheet=blankSheet(); isCopy=false;}
  if((d.ac||'').trim()!=='')sheet.ac=d.ac.trim(); if((d.speed||'').trim()!=='')sheet.speed=d.speed.trim(); if(d.dex)sheet.ab.dex.score=String(d.dex);
  var cr=(d.cr||'').trim(), tl=(d.type||'').trim(), hp=parseInt(d.hp,10);
  if(!isCopy)sheet.notes=((tl?cap(tl):'')+(cr?(tl?' \u00b7 ':'')+'CR '+cr:'')).trim();
  var ent={id:uid(),name:name,maxHp:isNaN(hp)?(bm&&bm.h?bm.h:null):hp,sheet:sheet,leg:leg,disp:'enemy',src:isCopy?'mod':'custom',meta:{type:tl,cr:cr}}; if(isCopy)ent.base=base;
  state.library.push(ent); if(d.fav!==false)state.stars.push('hb:'+ent.id); persist();
  L.form=null; L.src=''; L.type=''; L.crb=''; L.leg=false; L.q=name; if(L.tab==='saved'&&d.fav===false)libSetTab(L,'book');
  if(fight)hbAdd(ent,1,'enemy',false); else toast('Saved '+name+' as '+(isCopy?'Modified':'Homebrew')+(d.fav!==false?' and starred it':''));
  render(); renderLib();
  if(ui.add&&ui.add.mode==='manual'&&ui.add.type==='creature'){L.form={mode:'new',draft:blankDraft()}; renderAdd();}
});
document.addEventListener('input',function(e){
  var t0=e.target;
  if(t0.dataset&&t0.dataset.spin!==undefined&&ui.aoe){spellInput(t0,'input'); return;}
  if(t0.dataset&&t0.dataset.spf==='q'&&ui.lib){ui.lib.spq=t0.value; var pos=t0.selectionStart; renderLib(); var ni=document.querySelector('[data-spf=q]'); if(ni){ni.focus(); try{ni.setSelectionRange(pos,pos);}catch(e2){}} return;}
  var t=e.target; if(!ui.lib||!(ui.lib.open||ui.add)||!t.dataset)return;
  if(t.dataset.mcf!==undefined&&ui.lib.form){ui.lib.form.draft[t.dataset.mcf]=(t.type==='checkbox')?t.checked:t.value;}
  else if(t.dataset.mmsearch!==undefined){ui.lib.q=t.value; mmRenderList(false);}
  else if(t.dataset.mmq!==undefined)ui.lib.qty[t.dataset.mmq]=t.value;
  else if(t.dataset.mmi!==undefined&&ui.lib.init)ui.lib.init.vals[parseInt(t.dataset.mmi,10)]=t.value;
  else if(t.dataset.stdq!==undefined){ui.lib.sq=t.value; renderStdNpcs();}
});
document.addEventListener('change',function(e){
  var t=e.target; if(!ui.lib||!ui.lib.open||!t.dataset||!t.dataset.mmf)return;
  var f=t.dataset.mmf; ui.lib[f]=(t.type==='checkbox')?t.checked:t.value;
  if(f==='disp')return;
  renderLib();
});

