/* ================================================================
   23. Character builder
   Pick a class, species and level, and get a ready-to-play character: hit points, armour class,
   speed, proficiency, ability scores (standard array by class priority, a background's +2/+1,
   and an Ability Score Improvement at each ASI level), saves, spellcasting and key features,
   following the 2024 rules. Ends with a name generator.
   ================================================================ */

function bdPick(a){return a[Math.floor(Math.random()*a.length)];}
var NG={
  Human:{first:['Aldric','Brenna','Cedric','Dara','Edmund','Fiona','Gareth','Helena','Isolde','Jorin','Kaela','Lucan','Mira','Nolan','Odette','Percival','Quinn','Rowena','Soren','Tamsin','Ulric','Vera','Wystan','Yara','Zane','Bram','Corwin','Elspeth','Hadley','Imogen'],last:['Ashford','Blackwood','Carver','Dunmore','Everhart','Fairweather','Greymantle','Hollis','Kestrel','Lockhart','Marlowe','Northcott','Oakhurst','Pemberton','Ravenscroft','Stormhaven','Thorne','Underhill','Whitlock','Wraithmoor']},
  Elf:{pre:['ae','al','cae','el','fae','ith','lor','mae','nae','syl','thal','vae','ar','il','sael','ori'],mid:['','l','r','th','n','v','ssa'],suf:['rion','dra','wen','indel','ael','iel','anor','thil','asha','ian','ira','elle'],last:['Moonwhisper','Starweaver','Dawnrunner','Silverleaf','Nightbreeze','Brightbough','Duskwalker','Dewsong','Windrider','Sunfall','Mistglade','Thornvale']},
  Dwarf:{pre:['bor','dur','thor','gar','brun','kaz','mor','dain','bal','har','ruk','tor','hild','ogr'],mid:['','a','o','ri'],suf:['in','ak','grim','dur','ik','nar','ra','hild','gard','rik','da','li','mund'],last:['Deepforge','Coalbeard','Oresong','Granitebrow','Hammerdelve','Cairnwright','Bronzeshield','Hearthaxe','Runecarver','Slateheart','Tunnelward','Anvilsong']},
  Halfling:{pre:['pip','mil','tob','ros','bram','lil','fen','mer','per','wil','cor','dol','hob','tam'],mid:['','e','i'],suf:['o','a','wick','bell','by','win','la','ric','dy','kin','ly'],last:['Meadowbrook','Quickthimble','Fernhollow','Honeycrust','Wrenfield','Tuckerbell','Puddleton','Sunnyhedge','Copperkettle','Dandybrook','Lanternfield','Plumtree']},
  Gnome:{pre:['fizz','nim','orin','zan','bim','tink','wren','dab','glim','nob','pock','zib','kel','jin'],mid:['','a','o','ee'],suf:['wick','by','ble','zle','ket','ndle','bin','rig','nix','pop','dle','spin'],last:['Cogsworth','Sparkgrind','Tinkertop','Gearwhistle','Brightwrench','Quickspindle','Dazzlebolt','Fumblecrank','Glimmerpin','Whizzbang','Rivetwhirl','Pennywhistle']},
  Orc:{pre:['gr','th','ur','mog','dor','sh','ru','kro','vol','ug','zug','bar','gn','krag'],mid:['a','o','u','ak','og'],suf:['k','g','zul','ra','dak','gash','mash','thar','nak','ush','rok'],last:['Skullsplitter','Bonegnawer','Ironhide','Bloodtusk','Stormcaller','Doomhowl','Ashwalker','Redfang','Grimjaw','Warbringer','Cragbreaker','Wolfbane']},
  Tiefling:{first:['Ash','Ember','Nyx','Vesper','Lucien','Zeth','Rhea','Azra','Vex','Malek','Seren','Kor','Naia','Dante','Mordai','Siv','Thane','Zara','Cassian','Ilyx'],virtue:['Hope','Mercy','Valor','Solace','Mirth','Grace','Zeal','Reverie','Fervor','Quill','Sorrow','Torment','Ruin','Vigil'],last:['Ashbrand','Nightbloom','Cinderlight','Hollowmere','Thornwick','Duskmantle','Emberfell','Ravenhart','Velvetblade','Gloomwhisper']},
  Dragonborn:{pre:['kri','dra','rhog','bal','sha','tor','medr','naj','vyr','ghe','arj','bhar','sav'],mid:['','a','o','ra','e'],suf:['sh','x','ndar','th','rax','ris','gar','dan','mir','os','zul'],last:['Ashscale','Ironclaw','Stormwing','Emberhide','Frostfang','Skyvault','Thunderkin','Brightscale','Drakemoor','Cindermaw']},
  Goliath:{pre:['kav','mal','gae','ur','nal','tho','vim','lo','og','bru','tav','ro'],mid:['','a','o','e'],suf:['a','an','ath','ak','os','uk','ar','en','ith','or','dun'],last:['Skywatcher','Peakwalker','Stoneheart','Cliffrunner','Thundercall','Frostborn','Boulderback','Cloudspire','Ridgestrider','Emberclimb'],nick:['Bearclaw','Moonbender','Lightfoot','Longstride','Ironlung','Highstep','Stormbrow','Ridgewhistle']}
};
function genName(sp){
  var g=NG[sp]||NG.Human, first;
  if(g.first)first=bdPick(g.first);
  else{first=cap(bdPick(g.pre)+(g.mid?bdPick(g.mid):'')+bdPick(g.suf));}
  if(sp==='Tiefling'&&Math.random()<0.4)first=bdPick(g.virtue);
  if(sp==='Goliath'&&Math.random()<0.5)return first+' \u201c'+bdPick(g.nick)+'\u201d '+bdPick(g.last);
  return first+' '+bdPick(g.last);
}

var STD_ASI=[4,8,12,16,19];
var CLASSES={
  Barbarian:{hd:12,pri:['str','con','dex','wis','cha','int'],sv:['str','con'],asi:STD_ASI,armor:'unarmoredB',shield:false,cast:null},
  Bard:{hd:8,pri:['cha','dex','con','wis','int','str'],sv:['dex','cha'],asi:STD_ASI,armor:'leather',shield:false,cast:'cha'},
  Cleric:{hd:8,pri:['wis','con','str','cha','dex','int'],sv:['wis','cha'],asi:STD_ASI,armor:'scale',shield:true,cast:'wis'},
  Druid:{hd:8,pri:['wis','con','dex','int','cha','str'],sv:['int','wis'],asi:STD_ASI,armor:'leather',shield:true,cast:'wis'},
  Fighter:{hd:10,pri:['str','con','dex','wis','cha','int'],sv:['str','con'],asi:[4,6,8,12,14,16,19],armor:'chain',shield:true,cast:null},
  Monk:{hd:8,pri:['dex','wis','con','str','cha','int'],sv:['str','dex'],asi:STD_ASI,armor:'unarmoredM',shield:false,cast:null},
  Paladin:{hd:10,pri:['str','cha','con','wis','dex','int'],sv:['wis','cha'],asi:STD_ASI,armor:'chain',shield:true,cast:'cha'},
  Ranger:{hd:10,pri:['dex','wis','con','str','int','cha'],sv:['str','dex'],asi:STD_ASI,armor:'studded',shield:false,cast:'wis'},
  Rogue:{hd:8,pri:['dex','con','wis','int','cha','str'],sv:['dex','int'],asi:[4,8,10,12,16,19],armor:'studded',shield:false,cast:null},
  Sorcerer:{hd:6,pri:['cha','con','dex','wis','int','str'],sv:['con','cha'],asi:STD_ASI,armor:'none',shield:false,cast:'cha'},
  Warlock:{hd:8,pri:['cha','con','dex','wis','int','str'],sv:['wis','cha'],asi:STD_ASI,armor:'leather',shield:false,cast:'cha'},
  Wizard:{hd:6,pri:['int','con','dex','wis','cha','str'],sv:['int','wis'],asi:STD_ASI,armor:'none',shield:false,cast:'int'}
};
var ARMORS=[['none','No armor (10 + Dex)',10,'dex'],['leather','Leather (11 + Dex)',11,'dex'],['studded','Studded leather (12 + Dex)',12,'dex'],['chainshirt','Chain shirt (13 + Dex, max 2)',13,'dex2'],['scale','Scale mail (14 + Dex, max 2)',14,'dex2'],['halfplate','Half plate (15 + Dex, max 2)',15,'dex2'],['chain','Chain mail (16)',16,'none'],['splint','Splint (17)',17,'none'],['plate','Plate (18)',18,'none'],['unarmoredB','Unarmored Defense: Barbarian (10 + Dex + Con)',10,'dexcon'],['unarmoredM','Unarmored Defense: Monk (10 + Dex + Wis)',10,'dexwis']];
var SPECIES={
  Dragonborn:{speed:30,opts:['Draconic ancestry',[['Black','acid'],['Blue','lightning'],['Brass','fire'],['Bronze','lightning'],['Copper','acid'],['Gold','fire'],['Green','poison'],['Red','fire'],['Silver','cold'],['White','cold']]],note:'Breath Weapon, Darkvision 60 ft., Draconic Flight (level 5), resistance from ancestry'},
  Dwarf:{speed:30,res:'poison',hp:1,note:'Darkvision 120 ft., Dwarven Resilience (poison resistance), Dwarven Toughness (+1 HP per level), Stonecunning'},
  Elf:{speed:30,opts:['Elven lineage',[['Drow','',30],['High Elf','',30],['Wood Elf','',35]]],note:'Darkvision 60 ft., Fey Ancestry, Keen Senses, Trance, lineage spells'},
  Gnome:{speed:30,opts:['Gnomish lineage',[['Forest Gnome'],['Rock Gnome']]],note:'Darkvision 60 ft., Gnomish Cunning (advantage on Int, Wis and Cha saves)'},
  Goliath:{speed:35,opts:['Giant ancestry',[['Cloud'],['Fire'],['Frost'],['Hill'],['Stone'],['Storm']]],note:'Powerful Build, Large Form (level 5), giant ancestry boon'},
  Halfling:{speed:30,note:'Brave, Halfling Nimbleness, Luck, Naturally Stealthy'},
  Human:{speed:30,note:'Resourceful (Heroic Inspiration), Skillful, Versatile (an origin feat)'},
  Orc:{speed:30,note:'Darkvision 120 ft., Adrenaline Rush, Relentless Endurance'},
  Tiefling:{speed:30,opts:['Fiendish legacy',[['Abyssal','poison'],['Chthonic','necrotic'],['Infernal','fire']]],note:'Darkvision 60 ft., Otherworldly Presence, resistance and spells from legacy'}
};
function bdNew(){return {open:false,name:'',auto:true,player:'',cls:'Fighter',species:'Human',lineage:'',level:1,armor:'auto',shield:'auto',init:'',dest:'party'};}
function bdMod(v){return Math.floor((v-10)/2);}
function bdSgn(n){return (n>=0?'+':'\u2212')+Math.abs(n);}

/* Everything the build produces. */
function bdResult(){
  var B=ui.build, C=CLASSES[B.cls], Sp=SPECIES[B.species], lv=Math.max(1,Math.min(20,parseInt(B.level,10)||1));
  var arr=[15,14,13,12,10,8], sc={}, lin=null;
  if(Sp.opts){lin=Sp.opts[1].filter(function(o){return o[0]===B.lineage;})[0]||Sp.opts[1][0];}
  C.pri.forEach(function(k,i){sc[k]=arr[i];});
  sc[C.pri[0]]+=2; sc[C.pri[1]]+=1;                                  /* a background's +2 and +1 */
  C.asi.filter(function(l){return l<=lv;}).forEach(function(){
    for(var j=0;j<6;j++){var k=C.pri[j]; if(sc[k]<20){sc[k]=Math.min(20,sc[k]+2); break;}}
  });
  var prof=2+Math.floor((lv-1)/4), cm=bdMod(sc.con), dx=bdMod(sc.dex);
  var hp=C.hd+cm+(lv-1)*(Math.floor(C.hd/2)+1+cm)+(Sp.hp?lv*Sp.hp:0); hp=Math.max(lv,hp);
  var ak=B.armor==='auto'?C.armor:B.armor, A=ARMORS.filter(function(a){return a[0]===ak;})[0]||ARMORS[0];
  var shield=B.shield==='auto'?C.shield:(B.shield==='yes');
  var ac=A[2]+({dex:dx,dex2:Math.min(dx,2),none:0,dexcon:dx+cm,dexwis:dx+bdMod(sc.wis)})[A[3]]+(shield?2:0);
  var speed=(lin&&lin[2])||Sp.speed||30;
  if(B.cls==='Monk'&&lv>=2)speed+=lv>=18?30:lv>=14?25:lv>=10?20:lv>=6?15:10;
  if(B.cls==='Barbarian'&&lv>=5)speed+=10;
  var res=[]; if(Sp.res)res.push(Sp.res); if(lin&&lin[1])res.push(lin[1]);
  var saves={}; ABK.forEach(function(k){saves[k]=bdMod(sc[k])+(C.sv.indexOf(k)>=0?prof:0);});
  var feat=[], best=Math.max(bdMod(sc.str),bdMod(sc.dex));
  if(lv>=5&&['Fighter','Barbarian','Monk','Paladin','Ranger'].indexOf(B.cls)>=0)feat.push('Extra Attack ('+(B.cls==='Fighter'&&lv>=20?4:B.cls==='Fighter'&&lv>=11?3:2)+' attacks)');
  if(B.cls==='Rogue')feat.push('Sneak Attack '+Math.ceil(lv/2)+'d6');
  if(B.cls==='Barbarian')feat.push('Rage ('+(lv>=17?6:lv>=12?5:lv>=6?4:lv>=3?3:2)+' uses, +'+(lv>=16?4:lv>=9?3:2)+' damage)');
  if(B.cls==='Monk')feat.push('Martial Arts d'+(lv>=17?12:lv>=11?10:lv>=5?8:6)+(lv>=2?', '+lv+' Focus Points, Focus save DC '+(8+prof+bdMod(sc.wis)):''));
  if(B.cls==='Fighter')feat.push('Second Wind (1d10 + '+lv+')');
  if(B.cls==='Paladin')feat.push('Lay On Hands ('+(lv*5)+' HP pool)');
  if(B.cls==='Bard')feat.push('Bardic Inspiration d'+(lv>=15?12:lv>=10?10:lv>=5?8:6)+' ('+Math.max(1,bdMod(sc.cha))+' uses)');
  if(B.cls==='Sorcerer'&&lv>=2)feat.push(lv+' Sorcery Points');
  var spell=C.cast?{ab:C.cast,dc:8+prof+bdMod(sc[C.cast]),atk:prof+bdMod(sc[C.cast])}:null;
  var sh=blankSheet(); sh.ac=String(ac); sh.speed=speed+' ft.'; sh.initBonus=String(dx); sh.resist=res.join(', ');
  ABK.forEach(function(k){sh.ab[k].score=String(sc[k]); sh.ab[k].save=C.sv.indexOf(k)>=0?String(saves[k]):'';});
  var att=['Weapon attack: '+bdSgn(prof+best)+' to hit (best of Str or Dex + proficiency).'];
  if(spell)att.push('Spell attack: '+bdSgn(spell.atk)+' \u00b7 Spell save DC '+spell.dc+' ('+spell.ab.toUpperCase()+').');
  sh.attacks=att.join('\n');
  sh.notes=['Level '+lv+' '+B.cls+' ('+B.species+(lin&&B.species!==lin[0]?', '+lin[0]:'')+')','Hit dice: '+lv+'d'+C.hd+' \u00b7 Proficiency +'+prof+' \u00b7 Saves: '+C.sv.map(function(k){return k.toUpperCase();}).join(', ')].concat(feat.length?['Features: '+feat.join('; ')]:[]).concat(['Species: '+Sp.note]).join('\n');
  return {lv:lv,sc:sc,prof:prof,hp:hp,ac:ac,speed:speed,res:res,saves:saves,feat:feat,spell:spell,sheet:sh,init:dx,armor:A[1],shield:shield,lin:lin};
}

function bdPreviewHTML(){
  var B=ui.build, r=bdResult(), C=CLASSES[B.cls];
  var tiles=[['hp','HP',r.hp],['ac','AC',r.ac],['speed','Speed',r.speed+' ft.'],['prof','Prof.','+'+r.prof],['init','Init.',bdSgn(r.init)]].map(function(t){return '<div class="bdtile" data-k="'+t[0]+'"><small>'+t[1]+'</small><b>'+t[2]+'</b></div>';}).join('');
  var abs=ABK.map(function(k,i){var p=C.sv.indexOf(k)>=0; return '<div class="bdab'+(p?' prof':'')+'" data-k="'+k+'"><small>'+ABN[i]+'</small><b>'+r.sc[k]+'</b><i>'+bdSgn(bdMod(r.sc[k]))+'</i><em>Save '+bdSgn(r.saves[k])+(p?' \u25cf':'')+'</em></div>';}).join('');
  return '<h3 class="bdtitle">'+esc(B.name||'Unnamed')+'<small>Level '+r.lv+' '+esc(B.species)+(r.lin&&r.lin[0]!==B.species?' ('+esc(r.lin[0])+')':'')+' '+esc(B.cls)+'</small></h3>'+
    '<div class="bdtiles">'+tiles+'</div><div class="bdabs">'+abs+'</div>'+
    '<p class="bdline"><b>Armor.</b> '+esc(r.armor)+(r.shield?' + shield':'')+'</p>'+
    (r.res.length?'<p class="bdline"><b>Resistance.</b> '+esc(r.res.join(', '))+'</p>':'')+
    (r.spell?'<p class="bdline bdspell"><b>Spellcasting.</b> '+r.spell.ab.toUpperCase()+' \u00b7 save DC '+r.spell.dc+' \u00b7 attack '+bdSgn(r.spell.atk)+'</p>':'')+
    (r.feat.length?'<p class="bdline"><b>Features.</b> '+esc(r.feat.join('; '))+'</p>':'')+
    '<p class="bdline"><b>Species.</b> '+esc(SPECIES[B.species].note)+'</p>'+
    '<p class="bdfoot">Standard array by class priority, plus a background\u2019s +2/+1 and an Ability Score Improvement at each ASI level (+2 to your best score under 20). Edit anything afterwards from the party list. Class and species rules follow the SRD 5.2 (CC BY 4.0).</p>';
}
function bdRenderPreview(){var el=document.getElementById('bdprev'); if(el)el.innerHTML=bdPreviewHTML();}
function renderBuild(){
  var el=document.getElementById('buildwrap'); if(!el)return;
  var B=ui.build; if(!B||!B.open){if(el.innerHTML)el.innerHTML=''; if(!(ui.lib&&ui.lib.open)&&!ui.add)ui.addCtx=null; return;}
  var Sp=SPECIES[B.species];
  var opt=function(v,sel,label){return '<option value="'+esc(v)+'"'+(sel?' selected':'')+'>'+esc(label==null?v:label)+'</option>';};
  var lin=Sp.opts?'<label>'+esc(Sp.opts[0])+'<select data-bd="lineage">'+Sp.opts[1].map(function(o){return opt(o[0],(B.lineage||Sp.opts[1][0][0])===o[0]);}).join('')+'</select></label>':'';
  el.innerHTML='<div class="scrim open" data-bdc="close"></div><div class="qrmodal buildmodal" role="dialog" aria-modal="true" aria-label="Character builder"><div class="dhead"><h2>'+(B.dest==='npc'?'Generate an NPC':'Build a character')+'</h2><button type="button" class="btn small" data-bdc="close">Close</button></div>'+
    '<div class="qrbody bdbody">'+(ui.addCtx?addStripHTML(ui.addCtx):'')+'<div class="bdform">'+
      '<label>Name<span class="bdname"><input type="text" data-bd="name" value="'+esc(B.name)+'" autocomplete="off"><button type="button" class="btn small" data-bdc="gen" title="Generate a name for this species" aria-label="Generate a name">\ud83c\udfb2</button></span></label>'+
      (B.dest==='npc'?'':'<label>Player<input type="text" data-bd="player" value="'+esc(B.player)+'" placeholder="Optional" autocomplete="off"></label>')+
      '<div class="bdrow"><label>Class<select data-bd="cls">'+Object.keys(CLASSES).map(function(c){return opt(c,B.cls===c);}).join('')+'</select></label>'+
        '<label>Level<span class="bdlvl"><button type="button" class="btn small" data-bdc="lvl-" aria-label="Lower level">\u2212</button><input type="number" min="1" max="20" data-bd="level" value="'+esc(B.level)+'"><button type="button" class="btn small" data-bdc="lvl+" aria-label="Raise level">+</button></span></label></div>'+
      '<label>Species<select data-bd="species">'+Object.keys(SPECIES).map(function(c){return opt(c,B.species===c);}).join('')+'</select></label>'+lin+
      '<div class="bdrow"><label>Armor<select data-bd="armor">'+opt('auto',B.armor==='auto','Class default')+ARMORS.map(function(a){return opt(a[0],B.armor===a[0],a[1]);}).join('')+'</select></label>'+
        '<label>Shield<select data-bd="shield">'+opt('auto',B.shield==='auto','Class default')+opt('yes',B.shield==='yes','Yes (+2)')+opt('no',B.shield==='no','No')+'</select></label></div>'+
      '<label>Initiative <small>(blank rolls)</small><input type="number" data-bd="init" value="'+esc(B.init)+'" placeholder="Roll for me"></label>'+
    '</div><div class="bdprev" id="bdprev">'+bdPreviewHTML()+'</div>'+
    '<div class="bdfoot"><button type="button" class="btn primary" '+(B.dest==='npc'?'data-bdc="npcsave">Save to Saved NPCs</button><button type="button" class="btn" data-bdc="npcfight">Add to fight</button>':'data-bdc="add">Add to party</button><button type="button" class="btn" data-bdc="addfight">Add to party and fight</button>')+'</div></div></div>';
}
function bdAddNpc(toFight){
  var B=ui.build, r=bdResult(), name=(B.name||'').trim()||genName(B.species);
  var dsel=document.querySelector('#addForm [name=disp]'), disp=dsel?dsel.value:'neutral';
  var init=null; if(toFight){init=num(B.init); if(init==null)init=rollInit(r.sheet).t;}
  B.open=false; renderBuild();
  mutate(function(){
    if(toFight){addCombatant({name:numberedNames(name,1)[0],kind:'npc',disp:disp,init:init,hp:r.hp,maxHp:r.hp,sheet:clone(r.sheet),src:'npc'}); notes.push('Added '+name+' (level '+r.lv+' '+B.species+' '+B.cls+') \u2014 initiative '+init);}
    else notes.push(saveToLibrary(name,r.hp,r.sheet,null,disp,'npc'));
  });
  B.name=''; B.auto=true;
}
function bdAdd(toFight){
  var B=ui.build, r=bdResult(), name=(B.name||'').trim()||genName(B.species);
  var np={id:uid(),name:name,player:(B.player||'').trim(),maxHp:r.hp,hp:r.hp,sheet:r.sheet};
  var init=null; if(toFight){init=num(B.init); if(init==null)init=rollInit(r.sheet).t;}
  B.open=false; renderBuild();
  mutate(function(){
    state.party.push(np);
    if(toFight)addPartyToFight(np,init);
    notes.push('Added '+name+' (level '+r.lv+' '+B.species+' '+B.cls+') to the party'+(toFight?' \u2014 initiative '+init:''));
  });
  B.name=''; B.auto=true;
}
document.addEventListener('click',function(e){
  var t=e.target.closest('[data-bdc]'); if(!t||!ui.build||!ui.build.open)return;
  var B=ui.build, a=t.dataset.bdc;
  if(a==='close'){B.open=false;ui.addCtx=null;ui.add=null;renderBuild();}
  else if(a==='gen'){B.name=genName(B.species);B.auto=true;renderBuild();}
  else if(a==='lvl-'||a==='lvl+'){B.level=Math.max(1,Math.min(20,(parseInt(B.level,10)||1)+(a==='lvl+'?1:-1)));renderBuild();}
  else if(a==='add')bdAdd(false);
  else if(a==='addfight')bdAdd(true);
  else if(a==='npcsave')bdAddNpc(false);
  else if(a==='npcfight')bdAddNpc(true);
});
document.addEventListener('input',function(e){
  var t=e.target; if(!ui.build||!ui.build.open||!t.dataset||!t.dataset.bd)return; var B=ui.build, k=t.dataset.bd;
  if(k==='name'){B.name=t.value;B.auto=false;bdRenderPreview();}
  else if(k==='player')B.player=t.value;
  else if(k==='init')B.init=t.value;
  else if(k==='level'){B.level=t.value;bdRenderPreview();}
});
document.addEventListener('change',function(e){
  var t=e.target; if(!ui.build||!ui.build.open||!t.dataset||!t.dataset.bd)return; var B=ui.build, k=t.dataset.bd;
  if(k==='cls'||k==='armor'||k==='shield'||k==='lineage'){B[k]=t.value;bdRenderPreview();}
  else if(k==='species'){B.species=t.value;B.lineage='';if(B.auto)B.name=genName(B.species);renderBuild();}
  else if(k==='level'){B.level=Math.max(1,Math.min(20,parseInt(t.value,10)||1));renderBuild();}
});

