/* ================================================================
   12. DM screen
   Shell, top bar, settings drawer, party, library and the creature rows.
   ================================================================ */

function nGroup(key,icon,label,body,badge){
  return '<div class="ngrp" data-ngrp="'+key+'"><button type="button" class="nitem" data-act="navItem" data-nav="'+key+'" aria-expanded="false" aria-controls="nsub-'+key+'" title="'+label+'">'+icon+'<span class="nl">'+label+'</span>'+(badge||'')+'<span class="chev" aria-hidden="true">'+ICONS.chev+'</span></button><div class="nsub" id="nsub-'+key+'" hidden>'+body+'</div></div>';
}
function buildNavHTML(){
  var manage=
    '<button type="button" class="nsubi" id="navStart" data-act="combatToggle">Start combat</button><small class="nhint" id="navStartHint"></small>'+
    '<button type="button" class="nsubi" data-act="endCombat">End combat</button>'+
    '<small class="nhint" id="navEncName"></small>'+
    '<button type="button" class="nsubi" id="navEncSave" data-act="encSave">Save</button>'+
    '<button type="button" class="nsubi" id="navEncSaveAs" data-act="encSaveAs">Save as\u2026</button>'+
    '<button type="button" class="nsubi" data-act="encOpen">Open\u2026</button>'+
    '<button type="button" class="nsubi danger" data-act="clearAll" title="End combat and remove everyone to begin again">Start new</button>';
  var add='<button type="button" class="nsubi" data-act="addOpen" data-type="player">Player</button><button type="button" class="nsubi" data-act="addOpen" data-type="npc">NPC</button><button type="button" class="nsubi" data-act="addOpen" data-type="creature">Creature</button>';
  return '<div class="nhead"><span class="brand"><span class="bmark">'+logoSVG('',"Combat Wombat")+'</span><span class="bword">combat wombat</span></span>'+
      '<button type="button" class="btn iconbtn navtoggle" data-act="navCollapse" aria-pressed="false" aria-label="Collapse the menu" title="Collapse the menu">'+ICONS.side+'</button><button type="button" class="btn iconbtn navx" data-act="navMobileClose" aria-label="Close menu" title="Close menu">'+ICONS.close+'</button></div>'+
    '<div class="nsp" aria-hidden="true"></div>'+
    nGroup('monitor',ICONS.monitor,'Combat monitor','<button type="button" class="nsubi nsubext" data-act="openMonitor" title="Open the Combat Monitor in a new window"><span>Open new window</span><span class="next" aria-hidden="true">'+ICONS.ext+'</span></button><div class="nsubi nsubsw">'+swHTML('monPreview',!!state.settings.monPreview,'Preview',false,'Show a small copy of the Combat Monitor above the round bar')+'</div>')+
    nGroup('manage',ICONS.manage,'Manage encounter',manage)+
    '<div class="nsep" role="separator"></div>'+
    nGroup('add',ICONS.plus,'Add new',add)+
    nGroup('party',ICONS.users,'Party','<section id="party"></section>','<span class="nbadge" id="navPartyBadge" hidden></span>')+
    '<button type="button" class="nitem" data-act="libOpen" data-preset="book" title="Library: every creature, your favourites and your NPCs">'+ICONS.book+'<span class="nl">Library</span></button>'+
    '<div class="nsep mob" role="separator"></div><div class="nbottom">'+
    '<button type="button" class="nitem" data-act="qrOpen" title="QR codes for players and the monitor">'+ICONS.qr+'<span class="nl">QR codes</span></button>'+
    '<button type="button" class="nitem" data-act="settingsOpen" aria-haspopup="dialog" title="Settings">'+ICONS.gear+'<span class="nl">Settings</span></button>'+(BETA?'<div class="betaacct" id="betaacct"></div>':'')+'</div>';
}
function buildDMShell(){
  if(!ui.aoe)ui.aoe=aoeNew();
  app.innerHTML=
  '<div class="main">'+
    '<div class="navcol"><nav class="lnav" id="lnav" aria-label="Main menu">'+buildNavHTML()+'</nav></div>'+
    '<div class="listwrap"><div class="ctlstack"><div class="demobar" id="demobar" hidden></div><div class="monmini" id="monmini" hidden></div><div class="ctl" id="ctl"><div class="ctlgrid" id="ctlmain"></div><div class="tpop" id="tpop" hidden></div></div></div><div id="list"></div></div>'+
  '</div>'+
  '<div class="mnavscrim" id="mnavscrim" data-act="navMobileClose" hidden></div>'+
  '<div class="dock" id="dock" role="toolbar" aria-label="Turn controls"></div>'+
  '<div id="qrwrap"></div><div id="cloudwrap"></div><div id="clonewrap"></div><div id="aoepanel"></div><div id="confirmwrap"></div><div id="encwrap"></div><div id="libwrap"></div><div id="addwrap"></div><div id="pedwrap"></div><div id="buildwrap"></div>'+
  '<div class="scrim" id="scrim" data-act="settingsClose"></div>'+
  '<aside class="drawer" id="drawer" role="dialog" aria-label="Settings"></aside>';
}
function narrowNav(){return !!(window.matchMedia&&matchMedia('(max-width:900px)').matches);}
function closeNav(){if(ui.navOpen||ui.navMob){ui.navOpen=null;ui.navMob=false;renderNav();}}
function navTimerHTML(){
  var t=state.timer;
  return '<div class="ntimer"><div class="nlabrow"><span class="nlab">Turn timer</span><button type="button" class="btn small iconbtn timereye" data-act="swtimer" aria-pressed="'+(t.showPlayers?'true':'false')+'" aria-label="'+(t.showPlayers?'Showing the timer on the table view. Tap to hide it.':'Timer hidden from the table view. Tap to show it.')+'" title="'+(t.showPlayers?'Shown on the table view':'Hidden from the table view')+'">'+(t.showPlayers?ICONS.eye:ICONS.eyeoff)+'</button></div><span class="tbox">'+segHTML('tset','mode',t.mode,[['off','Off'],['up','Up'],['down','Down']],'sm')+'</span>'+
    (t.mode==='down'?'<span class="tbox"><input type="number" min="5" step="5" value="'+esc(t.secs)+'" data-tset="secs" aria-label="Countdown length in seconds"> sec</span>':'')+
    (t.mode!=='off'&&state.started?'<span class="tbox"><span class="timer" data-timer>0:00</span><button type="button" class="btn small iconbtn" data-act="timerPause" aria-label="'+(t.running?'Pause timer':'Resume timer')+'" title="'+(t.running?'Pause':'Play')+'">'+(t.running?ICONS.pause:ICONS.play)+'</button><button type="button" class="btn small iconbtn" data-act="timerReset" aria-label="Reset timer" title="Reset">'+ICONS.reset+'</button></span>':'')+
    (t.mode!=='off'&&state.paused?'<small class="nhint">Held while combat is paused.</small>':'')+'</div>';
}
function renderNav(){
  var n=document.getElementById('lnav'); if(!n)return;
  document.body.classList.toggle('nav-min',!!ui.navMin&&!narrowNav());
  n.classList.toggle('mobopen',!!(ui.navMob&&narrowNav()));
  var msc=document.getElementById('mnavscrim'); if(msc)msc.hidden=!(ui.navMob&&narrowNav());
  var hbt=document.querySelector('.hambtn'); if(hbt)hbt.setAttribute('aria-expanded',ui.navMob?'true':'false');
  n.classList.toggle('open',!!ui.navOpen);
  var tg=n.querySelector('.navtoggle');
  if(tg){var lb=ui.navMin?'Expand the menu':'Collapse the menu'; tg.setAttribute('aria-pressed',ui.navMin?'true':'false'); tg.setAttribute('aria-label',lb); tg.title=lb;}
  n.querySelectorAll('[data-nav]').forEach(function(b){
    var on=b.dataset.nav===ui.navOpen; b.setAttribute('aria-expanded',on?'true':'false'); b.parentNode.classList.toggle('on',on);
    var sb=document.getElementById('nsub-'+b.dataset.nav); if(sb)sb.hidden=!on;
  });
  var sb2=document.getElementById('navStart');
  if(sb2){
    var lab=!state.started?'Start combat':(state.paused?'Resume':'Pause');
    if(sb2.textContent!==lab)sb2.textContent=lab;
    sb2.disabled=!state.started&&!state.combatants.length;
    sb2.title=sb2.disabled?'Add someone to the fight first':(state.started&&!state.paused?'Pause: hides the cards from the Combat Monitor and player phones':'');
    var hn=document.getElementById('navStartHint'); if(hn)hn.textContent=!state.started?'':(state.paused?'Players can\u2019t see the cards right now.':'Pausing hides the cards from players.');
  }
  var eb=n.querySelector('[data-act=endCombat]'); if(eb)eb.disabled=!state.started;
  var cb=n.querySelector('[data-act=clearAll]'); if(cb)cb.disabled=!state.combatants.length;
  var es=document.getElementById('navEncSave'), esa=document.getElementById('navEncSaveAs'); if(es)es.disabled=!state.combatants.length; if(esa)esa.disabled=!state.combatants.length;
  var en=document.getElementById('navEncName'); if(en)en.textContent=state.encName?'Encounter: '+(state.encCamp?state.encCamp+' \u203a ':'')+state.encName:'';
  n.classList.toggle('wide',ui.navOpen==='party');
  var pb=document.getElementById('navPartyBadge'), pc=Link.phoneCount();
  if(pb){pb.hidden=!pc; pb.innerHTML=pc?ICONS.phone+'<b>'+pc+'</b>':''; pb.title=pc+' player screen'+(pc===1?'':'s')+' connected';}
}

/* ---------- Settings: a window with categories, like System Settings ---------- */
var SET_CATS=[['general','General','gear'],['appearance','Appearance','palette'],['table','Table view','monitor'],['sound','Sound & effects','sound'],['players','Players','users'],['about','About','info']];
function setTile(key,cur,opts,label){
  return '<div class="tiles" role="radiogroup" aria-label="'+label+'">'+opts.map(function(o){
    return '<button type="button" class="tile" role="radio" aria-checked="'+(String(cur)===String(o[0]))+'" data-act="seg" data-grp="set" data-key="'+key+'" data-val="'+o[0]+'"><span class="tpic">'+o[2]+'</span><span class="tlab">'+o[1]+'</span></button>';}).join('')+'</div>';
}
/* What the table sees, drawn with the real card styles and the real rules for what is shown. */
function setPreviewHTML(){
  var s=state.settings, t=state.timer;
  try{
    var base={temp:0,conditions:[],rx:false,ready:null,death:null,hidden:false,members:null,leg:null,acMod:0,seq:0,init:0};
    var pc=Object.assign({},base,{id:'pv1',name:'Rowan',player:'Brian',kind:'pc',hp:17,maxHp:24,partyId:'pv-p',sheet:Object.assign(blankSheet(),{ac:'17'}),conditions:[{id:'pvc',name:'Poisoned',level:null,dur:{type:'manual'}}]});
    var foe=Object.assign({},base,{id:'pv2',name:'Goblin',kind:'npc',disp:'enemy',hp:3,maxHp:7,sheet:Object.assign(blankSheet(),{ac:'15'})});
    var sn={tid:'pv1',np:'pv2',nx:'pv2',cb:s.cbMarks===true?1:0,rs:s.rxShow||'pc',r:3,tm:t.showPlayers?{m:'up',s:0,e:42000,r:0}:null};
    var cards=[pc,foe].map(function(c){
      var h=phMonCard(pubC(c),sn);
      if(c.id==='pv1'&&s.showNames===false)h=h.replace(/<p class="player">[^<]*<\/p>/,'');
      h=h.replace('data-ptimer>0:00','>0:42');
      if(s.imgShow!=='off')h=h.replace(/<\/section>$/,'<div class="pimg prevart" aria-hidden="true"></div></section>');
      return h;
    }).join('');
    return '<div class="prevbox'+(s.fontSize==='large'?' large':'')+'" role="img" aria-label="Preview of the cards the table sees"><div class="prevrow">'+cards+'</div><p class="prevcap">Preview: this is what the table sees. It follows your choices.</p></div>';
  }catch(e){return '';}
}
function renderDrawer(){
  var s=state.settings, t=state.timer, open=!!ui.settingsOpen;
  var scrim=document.getElementById('scrim'), d=document.getElementById('drawer'); if(!d)return;
  scrim.classList.toggle('open',open); d.classList.toggle('open',open); d.setAttribute('aria-hidden',open?'false':'true');
  if(!open)return;
  var cat=ui.setCat||'general'; if(!SET_CATS.some(function(c){return c[0]===cat;}))cat='general';
  var oldMain=d.querySelector('.dmain'), keepTop=(oldMain&&ui.setCatShown===cat)?oldMain.scrollTop:0, oldSide=d.querySelector('.dside'), keepSide=oldSide?oldSide.scrollLeft:0;
  function row(label,desc,ctl,stack){return '<div class="setrow'+(stack?' stack':'')+'"><div class="setlab"><b>'+label+'</b>'+(desc?'<small>'+desc+'</small>':'')+'</div><div class="setctl">'+ctl+'</div></div>';}
  function group(title,rows,cls){return '<section class="dsec">'+(title?'<h4 class="sgh">'+title+'</h4>':'')+'<div class="sgroup'+(cls?' '+cls:'')+'">'+rows+'</div></section>';}
  var sw=function(act,on,key){return swHTML(act,on,'On',false,'',' data-key="'+key+'"');};
  var skinBtn=function(k){return '<button type="button" class="skinbtn" role="radio" aria-checked="'+(s.skin===k.id)+'" data-act="seg" data-grp="set" data-key="skin" data-val="'+k.id+'">'+skinPicHTML(k)+'<span>'+k.name+'</span></button>';};
  var skins='<div class="skins" role="radiogroup" aria-label="Skin">'+['light','dark'].map(function(m){return '<div class="skincol"><h4>'+(m==='light'?'Light':'Dark')+'</h4>'+SKINS.filter(function(k){return k.mode===m;}).map(skinBtn).join('')+'</div>';}).join('')+'</div>';
  var hpTiles=function(key,cur,label){return setTile(key,cur,[['status','Word','<span class="tp-word">Wounded</span>'],['bar','Bar','<i class="tp-bar"><u></u></i>'],['exact','Numbers','<span class="tp-num">17<small> / 24</small></span>']],label);};
  var pane={};
  pane.general=
    group('This device',row('Shows','Remembered on this device',segHTML('view','',currentView(),[['dm','DM screen'],['monitor','Combat Monitor'],['player','Player screen']]),true)+
      '<p class="help spad">For a second monitor, open this page there, sign in as yourself, and choose <b>Combat Monitor</b>. It remembers the choice.</p>')+
    group('Your account',(Cloud?Cloud.statusHTML():'')+(ui.isEditor?'<p class="help">You are an Editor on this page, so you are working in the owner\u2019s saved party, encounters and library. If you and the owner change things at the same moment, the app asks which version to keep.</p>':''),'spad')+
    group('Tracking',row('Hit points for players','',sw('swset',s.trackPC,'trackPC'))+row('Hit points for enemies &amp; NPCs','',sw('swset',s.trackNPC,'trackNPC'))+
      row('Reactions refresh','',segHTML('set','reactionReset',s.reactionReset,[['turn','Own turn'],['round','New round']]))+
      row('Open stats on a creature\u2019s turn','',sw('swset',s.autoStats,'autoStats')))+
    group('Keyboard shortcuts',row('Next turn','','<kbd>\u2192</kbd>')+row('Previous turn','','<kbd>\u2190</kbd>')+row('Undo','','<kbd>Ctrl</kbd> <kbd>Z</kbd> or <kbd>\u2318</kbd> <kbd>Z</kbd>'));
  pane.appearance=setPreviewHTML()+
    group('Skin',skins,'spad')+
    group('Text',row('Text size on the Combat Monitor','',setTile('fontSize',s.fontSize,[['normal','Normal','<span class="tp-aa">Aa</span>'],['large','Large','<span class="tp-aa big">Aa</span>']],'Text size'),true)+
      row('Colour-blind markers','Shapes, labels and bar patterns on the Combat Monitor and player screens',sw('swset',s.cbMarks===true,'cbMarks')));
  pane.table=setPreviewHTML()+
    group('On each card',row('Player names','Under each character\u2019s name, on the DM screen and the Combat Monitor',sw('swset',s.showNames!==false,'showNames'))+
      row('Images','Creature art at the bottom of each card',sw('swset',s.imgShow!=='off','imgShow'))+
      row('Turn timer','On the current card',sw('swtimer',t.showPlayers,'showPlayers'))+
      row('Armor class','The first option lets you flip each creature on its own',segHTML('set','acShow',s.acShow,[['default','Players + chosen'],['all','Everyone'],['none','Nobody']]),true)+
      row('Reactions','',segHTML('set','rxShow',s.rxShow,[['pc','Players'],['all','Everyone'],['none','Hidden']])))+
    group('Health shown',row('Player health','',hpTiles('pcHp',s.pcHp,'Player health'),true)+row('Enemy health','Each enemy also has its own Word / Bar / Numbers control',hpTiles('npcHp',s.npcHp,'Enemy health'),true))+
    group('Layout',row('Card layout','Scrolling keeps the current turn first. Static keeps turn order.',setTile('cardMode',s.cardMode,[['scroll','Scrolling','<span class="tp-lay"><i class="on"></i><i></i><i></i><i></i></span>'],['static','Static','<span class="tp-lay"><i></i><i class="on"></i><i></i><i></i></span>']],'Card layout'),true)+
      row('When there are many creatures','Shrink the extra cards to fit, or keep them full size and let them run off the screen',setTile('crowd',s.crowd||'shrink',[['shrink','Shrink the rest','<span class="tp-crowd shrink"><i></i><i></i><i></i><i></i><i></i><i></i></span>'],['off','Run off screen','<span class="tp-crowd off"><i></i><i></i><i></i><i></i></span>']],'When there are many creatures'),true));
  pane.sound=
    group('Sound',row('Combat Monitor','Needs one tap on that screen to start',sw('swset',s.sfxTv!==false,'sfxTv'))+row('This screen','',sw('swset',s.sfxDm===true,'sfxDm'))+row('Volume','',segHTML('set','sfxVol',s.sfxVol,[['low','Low'],['med','Medium'],['high','High']])))+
    group('What makes a sound',row('Turns and rounds','',sw('swset',s.sfxTurn!==false,'sfxTurn'))+row('Hits and healing','',sw('swset',s.sfxHit!==false,'sfxHit'))+row('Defeats and death saves','',sw('swset',s.sfxEnd!==false,'sfxEnd'))+row('Conditions','',sw('swset',s.sfxCond!==false,'sfxCond'))+row('Timer ticks','',sw('swset',s.sfxTimer!==false,'sfxTimer')))+
    group('Effects on the Combat Monitor',row('Flash cards when hit or healed','',sw('swset',s.fxFlash!==false,'fxFlash'))+row('Damage numbers','Floating numbers',segHTML('set','fxNums',s.fxNums,[['off','Off'],['pc','Players'],['all','Everyone']])))+
    group('Try them',row('Preview','Plays here whatever the switches say','<div class="sfxprev">'+[['turnPc','Player turn'],['turnFoe','Enemy turn'],['round','New round'],['hitSmall','Hit'],['hitBig','Big hit'],['heal','Heal'],['defeat','Defeat'],['down','Player down'],['nat20','Nat 20'],['dead','Death'],['condOn','Condition'],['tick','Tick']].map(function(x){return '<button type="button" class="btn small" data-act="sfxTest" data-s="'+x[0]+'">'+x[1]+'</button>';}).join('')+'</div>',true));
  pane.players=
    group('Player screens',row('Players can edit their own character','HP, reaction, conditions and death saves. Never the turn order.',sw('swset',s.phoneEdit!==false,'phoneEdit'))+
      row('QR code on the Combat Monitor','A small code players can scan to join',sw('swset',s.tvQr===true,'tvQr'))+
      row('Connected now',Link.phoneCount()+' phone'+(Link.phoneCount()===1?'':'s')+(Link.hasRoom()?'':' (this browser only)'),''))+
    group('Who gets what','<p class="help spad"><b>Viewers and Contributors</b> only ever get the Player screen. They cannot read your party, notes or library.</p><p class="help spad"><b>Editors</b> get the whole app: the DM screen, the Combat Monitor, your saved party, encounters and library. To bring in a co-DM or a tester, share this page with them as an Editor in the page\u2019s Share menu. Only do that for people you trust with your campaign.</p>')+
    group('How players join','<p class="help spad">Share this page with your players, then send them the same link with <code>#phone</code> on the end. They pick their character and get an alert when they should get ready and on their turn.</p><p class="help spad">Player screens only stay in sync while a DM screen is open.</p>');
  pane.about=
    group('Good to know','<p class="help spad">Health words: Healthy above 75%, Wounded 51\u201375%, Bloodied 10\u201350%, Critical below 10%, Down at 0.</p><p class="help spad">Stats, saves, attacks and notes are never shown to players.</p>')+
    group('Credits','<p class="help">The monster library, the spell list and the character builder use material from the System Reference Document 5.2 (\u201cSRD 5.2\u201d) by Wizards of the Coast LLC, available at <a href="https://www.dndbeyond.com/srd" target="_blank" rel="noopener">dndbeyond.com/srd</a>. The SRD 5.2 is licensed under the <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noopener">Creative Commons Attribution 4.0 International License</a>. This tool is not affiliated with or endorsed by Wizards of the Coast.</p>','spad');
  var cats=SET_CATS.map(function(c){return '<button type="button" class="dcat" data-act="setCat" data-cat="'+c[0]+'" aria-current="'+(c[0]===cat?'page':'false')+'">'+ICONS[c[2]]+'<span>'+c[1]+'</span></button>';}).join('');
  var title=SET_CATS.filter(function(c){return c[0]===cat;})[0][1];
  d.innerHTML='<div class="dhead"><h2>Settings</h2><button type="button" class="btn small" id="drawerClose" data-act="settingsClose">Done</button></div>'+
    '<div class="dsplit"><nav class="dside" aria-label="Settings categories">'+cats+'</nav><div class="dmain" id="dmain" tabindex="-1"><h3 class="dtitle">'+title+'</h3>'+pane[cat]+'</div></div>';
  var nm=d.querySelector('.dmain'), ns=d.querySelector('.dside'); if(nm)nm.scrollTop=keepTop; if(ns)ns.scrollLeft=keepSide; ui.setCatShown=cat;
}

/* Combat Wombat mark: the octopus. Parts are classed so each skin can colour them. */
var LOGO_PATHS='<path class="lg-k" d="M70.69,98.73l-3.05,4.72c.33,1.73-1.01,2.7-2.34,4.14-.41.45-.93.32-1.38.24l-2.21,2.04c-.08.48.1,1.24-.41,1.7-1.17,1.04-2.95,2.4-3.77,1.42l-2.37,1.87c.2.29.4.69.21,1.04-.73,1.36-2.27,3.05-3.42,2.15l-1.64,2.23c1.1.67.38,1.52.03,2.73-.25.83-.86,1.34-1.79,1.33-.17.76-.22,1.5-.19,2.28.69.17,1.01.64,1.1,1.28l.26,1.88c.05.39-.46.73-.82.99l1.27,1.79c.41-.43.98-.5,1.42-.15l1.23,1c.43.35.31.81.27,1.26.33.35,1.4.54,1.86.32.36-.64.73-.97,1.49-1.14.68-.16,1.4-.34,1.88.46.49-.28.91-.57,1.28-.93-.41-3.2,3.07-2.17,1.44-4.6-.3-.8.1-1.74-.03-2.48l-2.71-1.63-2.5.57-.81,3.21-1.34-1.84.96-3.5,5.21-1.95,5.7,3.97.86,8.2-5.96,7.67-11.41.42-8.6-9.37-.24-12.25,5.6-8.94,5.04-5.51,6.32-7.3,3.84-13.06c.06-.19.23-.49.1-.76-.22.23-.21.42-.28.57l-5.25,12-5.44,3.69c.06.47.1.84.05,1.2l-2.42,1.66c-.29.2-.56.48-.92.33-.25-.1-.51-.32-.71-.62l-2.43,1.38c.72,1.44-.86,2.36-2.39,3.31-.44-.17-.76-.33-1.14-.37l-1.43,2.04c.28.28.68.68.56,1.11-.22.79-.57,1.54-.98,2.25-.22.38-.74.48-1.15.54l-.42,2.18c.45.12,1.02.36,1.14.83.19.8.35,1.64.37,2.5,0,.44-.47.79-.76,1.08l1.19,3.97v8.74s1.96,2.24,1.96,2.24l-3.47,6.49-6.3,1.25-3.24-1.12-2.84-3.59.04-3.36,1.67-2.03.09,3.37,3.79,2.87,4.07-2.1.58-4.13-7.94-18.05,1.17-7.66,3.75-7.27,15.29-11.71.72-.47,3.29-6.19-4.05,4.76-7.52,5.15-4.65-.38c-.26.65-.65,1.24-1.37,1.19l-2.9-.2c-.58-.04-.59-.81-.69-1.24l-2.69-.53c-.26.72-.8,1.05-1.53.91l-1.71-.32c-.72-.14-1.16-.67-1.17-1.47l-2.61-.41c-.1.84-.71,1.14-1.48,1.17-1.31.05-2.21.44-2.54-.93-.81.2-1.53.36-2.28.71.1.43.21,1.04-.15,1.28l-1.74,1.14c-.49.32-.96-.05-1.3-.29-.68.28-1.1,1.18-1.6,1.72.35.34.49.6.53.91.04.38-.3.67-.4.98-.27.87-.76,1.54-1.75,1.4l-.33,2.2c.46.07.91.29,1.02.76.28,1.23.43,2.14-.49,2.71l.99,1.79c.39-.2.79-.16,1.07.1l1.05,1.01c.28.27.38.63.22,1.05l1.49.76c.93-.93,2.28-.81,3.35.16l2.81-2.24,1.05-2.86c-.58-.76-.97-1.87-1.81-2.34l-2.73-.58,2.4-1.43,3.51,1c.42,1.34,1.47,2.51,1.69,3.92.23,1.52-.52,3.11-.48,4.77l-5.06,4.7-8.63-.17-6.4-6.05c-1.03-2.74-1.66-5.94-2.36-8.83l2.89-9.74,3-2.45,5.49-4.6,9.11-.69,17.21.6,6.84-3.02-7.09,1.69-14.36-1.11-2.25-2.28c-1.03,1.02-2.71-1.65-3.23-3.13-.12-.33.33-.75.57-.95l-.88-2.67c-.43.06-.95-.05-1.1-.41-.53-1.32-.97-3.65.1-4.24l.47-2.55-.79-.89c.29-2.04.08-3.31,1.86-3.58l.51-2.23c-.19-.19-.52-.35-.62-.6-.25-.9-.09-1.91.29-2.76.14-.31.62-.4.92-.56l-.37-2.07c-.86.08-1.12-.37-1.4-.93-.34-.68-.59-1.42-.14-2.13l-1.4-1.3c-.65.59-1.28.31-1.89.11-.67-.22-1.11-.56-1.16-1.37h-1.77c0,.77-.46,1.05-.96,1.32-.62.34-1.14.63-1.84.09-.52.45-1.07.78-1.39,1.44.59,1.04.21,2.3-.9,2.82l-.2,2.02,2.78,2.78,2.88-.84,1.06-2.7.76,3.77-3.33,3.09-5.08-1.03-3.54-4.87c-.06-.09-.15-.11-.21-.1l.18-1.6c.16,0,.17-.11.19-.26l.3-2.11.68-4.14,7.27-5.73,10.32,1.77,6.19,8.59-.71,16.39,6.12,8.23,11.23,1.81,8.51-4.22-.63-4.02-10.3-2.61-3.48-7.41-4.18-11.82,11.9-17.43,21.88,2.28,11.08,19.38,2.46,9.03-1.44-3.12,4.3.93,1.67,6.22-1.67,6.15,3.49,9.83,5.46,7.85,12.48,4.72,9.86-3.2,5.58-7.98.38-8.9-3.55-12.7-4.13-3.79.34-6.15-1.82-1.64-3.95,4.46-6.39.09.66-4.34,3.79-.18,2-2.2L64.36,8.57l-.54-8.57,11.87,1.98,7.49,6.9,29.91,27.25,2.01-2.12-.24-3.87,4.2-1.04.52,6.31-4.29,4.9,1.09.91-1.9,2.83,7.04-4.21,5.81,4.71.64,4.37c-.06.52-.4,1.16-.61,1.67-1.39-1.03-2.47-2.07-3.73-3.16l-5.49,2.07,5.11-.66,2.65,2.28,5.65,5.02,3.62-.18,1.16,7.25c-.01.07-.06.13-.03.29l-7.89.75-.62-3.7-4.14-3.68,2.99,8.64c1.61.61,2.48,2.94,1.29,4.17.25.67.24,1.5.65,2.1.34.21.9.32.97.84l.33,2.56c.06.45-.55.79-.82,1.05l-.28,2.64c.29.19.78.35.83.69l-.34,2.58c-.1.77-.62,1.27-1.42,1.35l-1.04,2.7c1.1.66-.16,2.9-1.23,3.94-.27.27-.85.1-1.1.23l-1.89,2.06c.47.65.17,1.36-.37,1.82l-1.65,1.41c-.43.37-.96.35-1.34-.1-.48.11-.86.37-1.28.65l-1.24.83c-.05.24.09.84-.19,1.02-.95.63-2.01,1.17-3.09,1.3-.38.05-.78-.41-.98-.65l-2.67.74c-.13.3-.22.86-.64,1-1.07.34-2.18.53-3.3.45-.5-.04-.63-.63-.74-1.03l-2.81-.03c-.35.34-.8.86-1.45.75-1.85-.33-3.27-.56-3.16-2.03l-3.18-.89,1.86,3.02,1.15,4.44-6.6-4.5-7.51-17.73c.09-.29-.23-.26-.16,0-.04.17.07.21.1.22l1.56,5.02,4.22,13.68,8.08,5.24,7.07-.91,9.93-1.18,5.46,3.8,5.87,4.21.77,9.45.3,4.34-6.23,8.17-8.68,1.86-5.6-3.07c-.88-.95-1.63-2.28-2.26-3.46-.24-1.02-.2-2.43-.19-3.51l2.18-4.38,3.71-.19,1.94,1.49-3.08.21-1.63,2.65,1.3,3.4,4.18,1.99c.88-1.45,2.43-2.38,3.54-1.3l1.4-1.12c-.5-.67-.2-1.26.18-1.81.46-.66,1.01-1.16,1.87-1.11l.49-1.81c-.82-.26-.9-.88-.89-1.58.02-.81.03-1.56.79-2.02l-.67-1.81c-1.13.3-1.39-.57-1.98-1.33-.43-.54-.29-1.13-.07-1.62-.46-.56-1.15-.95-1.75-1.37-.37.31-.76.66-1.21.55-1.36-.32-2.5-.74-2.41-1.88l-2.37.18c.06.68-.33,1-.83,1.16-1.54.48-2.56.84-3.14-.39l-2.42.99c-.05.37-.12.92-.54,1.05-1.62.53-3.97.88-4.19-.53l-3.16.33c-.36.13-.71.91-1.22.71l-3.5-1.37c-.04-.2-.07-.53-.26-.61l-3.03-1.37c-.3.49-.72.82-1.27.56-1.68-.79-4.02-2.24-3.03-3.61l-2.19-2.33c-1.32,1.04-2.15-1.13-3.13-2.65-.43-.66-.27-1.3.03-1.93l-2.48-4.21"/><path class="lg-k" d="M86.79,123.24c-.45.52-.78,1.14-1.3,1.45-.99-.45-2.43.46-2.49,1.68l-1.29.53c-.72-1.1-2.62-1.29-3.28-.19l-1.31-.79c.15-1.01-.31-1.8-1.15-2.18-.31-.14-.5-.57-.7-.88l.94-3.6,2.1-.96,2.81,1.04-2.3-3.46-5.01.69-2.95,5.5,1.48,6.64,6.05,4.36,7.97.18,6.92-4.75,3.93-8.04c.29-.59.04-1.4.02-2l-3.4.95-5.77-1.99c-.11.83,0,1.56.08,2.4-.9.19-1.29.84-1.55,1.64-.21.65-.36,1.23.2,1.77Z"/><path class="lg-g3" d="M60.94,85.42c.08-.02.15.06.18.18.06-.19.23-.49.1-.76-.22.23-.21.42-.28.57Z"/><path class="lg-g1" d="M83.5,83.7l.06-.22c.09-.29-.23-.26-.16,0-.04.17.07.21.1.22Z"/><path class="lg-k" d="M105.2,77.25c.14-.33,1.16-.3.36-2.76-.19-.58-.57-.76-1.03-.93-.38-.57-.79-1.27-1-1.93.07-.36.46-.92.08-1.33l-1.05-1.13c-.37-.39-.82-.38-1.31-.08-.35-.43-.73-.75-1.1-1.03s-.24-.47-.28-.83c-.1-1.03-1.2-1.79-2.25-1.64l-1.27-1.28c.5-.91.24-1.97-.64-2.71l1.67-2.79,3.29.87,1.18,2.88c.39-.9.64-1.66,1.09-2.52l-1.85-3.37-4.88-1.48c-1.55,1.25-3,2.43-4.43,3.72l-.69,6.25,2.87,4.11,3.47,4.99-.46,3.61-4.1,2.19-4.18-2.01,4.29,6.18,6.99,2.62c1.4-.73,2.39-1.08,2.21-2.52.45-.51.74-1.24,1.29-1.6.45-.29,1.45.33,1.94-2.76.05-.31-1.09-.72-.22-2.74Z"/><path class="lg-w" d="M64.53,68.7c-.21-.67-.65-2.6-.65-2.6l-2.36-1.8-2.47.24.57,2.38,2.1,1.61,2.81.16Z"/>';
function logoSVG(extra,label){return '<svg class="bmlogo'+(extra?' '+extra:'')+'" viewBox="0 0 136.33 142.6" '+(label?'role="img" aria-label="'+label+'"':'aria-hidden="true"')+' focusable="false">'+LOGO_PATHS+'</svg>';}
function logoLockup(){return '<div class="bmlock">'+logoSVG('',"Combat Wombat")+'<span class="bmword">combat wombat</span></div>';}
var ICONS={};
(function(){
  function ic(p,w){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+(w||1.9)+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>';}
  ICONS.book=ic('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>');
  ICONS.build=ic('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>');
  ICONS.full=ic('<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>');
  ICONS.fullx=ic('<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>');
  ICONS.side=ic('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>');
  ICONS.target=ic('<circle cx="3.60" cy="14.00" r="1.72" fill="currentColor" stroke-width=".5"/><path d="M0.64 21.33C0.64 18.21 1.88 16.96 3.60 16.96C5.32 16.96 6.56 18.21 6.56 21.33Z" fill="currentColor" stroke-width=".5"/><circle cx="20.40" cy="14.00" r="1.72" fill="currentColor" stroke-width=".5"/><path d="M17.44 21.33C17.44 18.21 18.68 16.96 20.40 16.96C22.12 16.96 23.36 18.21 23.36 21.33Z" fill="currentColor" stroke-width=".5"/><path d="M12.52 0.80 L7.40 13.04 L12.00 13.04 L11.48 21.20 L16.60 8.96 L12.00 8.96 Z" fill="currentColor" stroke-width=".6"/>',1.7);
  ICONS.undo=ic('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',2.1);
  ICONS.eye=ic('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>');
  ICONS.eyeoff=ic('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/>');
  ICONS.expand=ic('<path d="M7 13l5 5 5-5"/><path d="M7 6l5 5 5-5"/>');
  ICONS.collapse=ic('<path d="M17 11l-5-5-5 5"/><path d="M17 18l-5-5-5 5"/>');
  ICONS.qr=ic('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 17v4h-4"/>',1.8);
  ICONS.phone=ic('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',1.8);
  ICONS.gear=ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',1.8);
  ICONS.ext=ic('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>');
  ICONS.monitor=ic('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>');
  ICONS.manage=ic('<circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z"/>');
  ICONS.plus=ic('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>');
  ICONS.users=ic('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>');
  ICONS.pencil=ic('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>');
  ICONS.sword=ic('<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/>');
  ICONS.timer=ic('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>');
  ICONS.close=ic('<path d="M6 6l12 12M18 6L6 18"/>');
  ICONS.folder=ic('<path d="M3.5 7.2A2.2 2.2 0 0 1 5.7 5h3.6l2 2.2h7A2.2 2.2 0 0 1 20.5 9.4v7.4a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2z"/>');
  ICONS.filter=ic('<path d="M4 5h16l-6.2 7.4V19l-3.6-1.8v-4.8z"/>');
  ICONS.d20=ic('<path d="M12 1.8 20.8 6.9v10.2L12 22.2 3.2 17.1V6.9z"/><path d="M12 5.4 17 14.6H7z"/><path d="M12 1.8V5.4M3.2 6.9 12 5.4 20.8 6.9M3.2 6.9 7 14.6M20.8 6.9 17 14.6M3.2 17.1 7 14.6M20.8 17.1 17 14.6M7 14.6 12 22.2 17 14.6" stroke-width="1.3"/>');
  ICONS.heart=ic('<path fill-rule="evenodd" fill="currentColor" stroke="none" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35zM10.9 8A1.1 1.1 0 0 1 13.1 8V10.8H15.9A1.1 1.1 0 0 1 15.9 13H13.1V15.8A1.1 1.1 0 0 1 10.9 15.8V13H8.1A1.1 1.1 0 0 1 8.1 10.8H10.9Z"/>');
  ICONS.trash=ic('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>');
  ICONS.stats=ic('<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4.5"/>');
  ICONS.palette=ic('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H17a4 4 0 0 0 4-4C21 6.7 17 3 12 3z"/><circle cx="7.6" cy="11" r=".9" fill="currentColor"/><circle cx="10.6" cy="7.2" r=".9" fill="currentColor"/><circle cx="15.2" cy="7.6" r=".9" fill="currentColor"/>');
  ICONS.sound=ic('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>');
  ICONS.info=ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>');
  ICONS.star=ic('<path d="M12 3.4l2.6 5.4 5.9.8-4.3 4.2 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.2 5.9-.8z"/>');
  ICONS.starOn=ic('<path d="M12 3.4l2.6 5.4 5.9.8-4.3 4.2 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.2 5.9-.8z" fill="currentColor"/>');
  ICONS.selall=ic('<path d="M5 12.5l4.5 4.5L19 7.5"/>');
  ICONS.menu=ic('<path d="M4 7h16M4 12h16M4 17h16"/>');
  ICONS.pause=ic('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>');
  ICONS.play=ic('<path d="M7 5l12 7-12 7z"/>');
  ICONS.reset=ic('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>');
  ICONS.chev=ic('<path d="M6 9l6 6 6-6"/>');
})();

/* Opens the Combat Monitor in its own window. Artifacts run in a sandbox, and a pop-up inherits that
   sandbox, so navigating one to claude.ai is blocked. Instead the pop-up is opened blank and this
   page's own code is written into it, running as a monitor. The DM window pushes every change to
   it directly, so it needs neither the account nor shared storage. A page cannot force true kiosk
   mode, so the monitor offers a one-click full screen. */
var monWin=null;
window.__bmRaw=function(){return JSON.stringify(state);};
function pushMonitor(raw){try{if(monWin&&!monWin.closed&&monWin.__bmPush)monWin.__bmPush(raw);}catch(e){}}
var seenTurn=null;
/* On a phone, bring the current card into view whenever the turn changes. */
function nowIntoView(){
  if(!state.started||state.turnId===seenTurn)return;
  seenTurn=state.turnId;
  if(!window.matchMedia||!matchMedia('(max-width:900px)').matches)return;
  var r=document.querySelector('.row.now'); if(!r)return;
  var calm=matchMedia('(prefers-reduced-motion: reduce)').matches;
  try{r.scrollIntoView({block:'center',behavior:calm?'auto':'smooth'});}catch(e){}
}

function openMonitor(){
  var sw=screen.availWidth||1280, sh=screen.availHeight||800, sl=screen.availLeft||0, st=screen.availTop||0, win=null;
  var here=function(msg){toast(msg+' Showing it here instead; use View to switch back.');setView('monitor');};
  try{win=window.open('','bm-monitor','popup=yes,left='+sl+',top='+st+',width='+sw+',height='+sh);}catch(e){}
  if(!win){here('The new window was blocked.');return;}
  if(!SELF_SRC){try{win.close();}catch(e){} here('A separate window is not available here.');return;}
  try{
    win.__BM_VIEW='monitor';
    win.document.open();
    win.document.write('<!doctype html><html lang="en"><head>'+HEAD_HTML+'</head><body><div id="app"></div><div id="toast" class="toast" role="status" aria-live="polite"></div>'+
      '<script>'+QR_SRC.replace(/<\/script/gi,'<\\/script')+'<\/script>'+
      '<script>'+SELF_SRC.replace(/<\/script/gi,'<\\/script')+'<\/script></body></html>');
    win.document.close();
  }catch(e){try{win.close();}catch(x){} here('The new window could not be set up.');return;}
  monWin=win; try{win.focus();}catch(e){}
  placeMonitor(win);
}
/* Sends the monitor window to a screen other than the one this window is on (the TV). That needs the browser's
   "window management" permission; without it the window stays here and we say how to move it by hand. */
function placeMonitor(win){
  var drag='Drag the monitor window to your TV, then press F11 or use its Full screen button.';
  if(!window.getScreenDetails){toast('This browser can\u2019t pick a screen for me. '+drag);return;}
  window.getScreenDetails().then(function(d){
    var list=d.screens||[], cur=d.currentScreen||screen;
    var same=function(a,b){return a===b||(a&&b&&a.left===b.left&&a.top===b.top);};
    var o=list.filter(function(x){return !same(x,cur);})[0];
    if(!o){toast('I only see one screen, so the monitor opened here. '+drag);return;}
    try{win.moveTo(o.availLeft,o.availTop); win.resizeTo(o.availWidth,o.availHeight);}catch(e){}
    setTimeout(function(){var sx=0; try{sx=win.screenX;}catch(e){} if(!(sx>=o.left-2&&sx<o.left+o.width))toast('The browser kept the monitor on this screen. '+drag);},700);
  }).catch(function(){toast('The browser didn\u2019t allow screen access (allow \u201cWindow management\u201d for this site and I can place it for you). '+drag);});
}

function renderTimerPop(){
  var el=document.getElementById('tpop'); if(!el)return;
  el.hidden=!ui.timerOpen;
  if(!ui.timerOpen)return;
  if(el.contains(document.activeElement)&&document.activeElement.tagName==='INPUT')return;
  el.innerHTML=navTimerHTML();
}
function renderMonMini(){
  var el=document.getElementById('monmini'); if(!el)return;
  Array.prototype.forEach.call(document.querySelectorAll('[data-act=monPreview]'),function(b){b.classList.toggle('on',!!state.settings.monPreview); b.setAttribute('aria-checked',state.settings.monPreview?'true':'false');});
  if(shellMode!=='dm'||!state.settings.monPreview){if(el.innerHTML)el.innerHTML=''; el.dataset.h=''; el.hidden=true; return;}
  var sn; try{sn=buildSnapshot();}catch(e){return;}
  var C=sn.c||[], ci=C.findIndex(function(c){return c.i===sn.tid;}), rot=(ci>0)?C.slice(ci).concat(C.slice(0,ci)):C.slice(), inner;
  if(sn.pz)inner='<div class="mmmsg">Combat paused</div>'; else if(!rot.length)inner='<div class="mmmsg">Nobody in the fight yet</div>';
  else inner='<div class="pgrid scrollx off" style="--fs:26;--fscale:1">'+rot.map(function(c){return phMonCard(c,sn);}).join('')+'</div>';
  var html='<div class="pwrap'+(sn.cb?' cb':'')+'" role="img" aria-label="Preview of the Combat Monitor">'+inner+'</div>'+
    '<button type="button" class="btn iconbtn mmclose" data-act="monPreviewOff" aria-label="Close the Combat Monitor preview" title="Close the preview">'+ICONS.close+'</button>';
  el.hidden=false; if(el.dataset.h!==html){el.innerHTML=html; el.dataset.h=html;}
}
function renderTop(){
  var cur=state.started?byId(state.turnId):null;
  var L=state.combatants, idx=state.started?turnIdx():-1;
  var canPrev=state.started&&!(state.round<=1&&idx<=0);
  var upn=state.started?byId(nextPcId()):null;
  var status=cur?'<span class="rn">Round '+state.round+'</span>'+(state.paused?'<button type="button" class="btn primary resumebtn" data-act="combatToggle" title="Resume combat: show the cards to players again">\u25b6 Resume</button>':''):'<span class="cur muted">Combat hasn\u2019t started</span>'+(state.rfi?'<button type="button" class="btn small rfibtn on" data-act="rfiToggle" aria-pressed="true" title="Players see \u201cRoll for initiative!\u201d on the Combat Monitor and their phones">'+ICONS.d20+'<span>Showing \u201cRoll for initiative!\u201d \u00b7 Hide</span></button>':'<button type="button" class="btn small rfibtn" data-act="rfiToggle" aria-pressed="false" title="Ask players to roll: shows on the Combat Monitor and their phones">'+ICONS.d20+'<span>Show \u201cRoll for initiative\u201d</span></button>');
  var blurb=cur?'<div class="topstat"><span class="stat now'+(isSide(cur)?'':' foe')+'"><small>Now</small><b>'+esc(cur.name)+'</b></span>'+
      (upn?'<span class="stat nxt"><small>'+readyWord(upn.id,false)+'</small><b>'+esc(upn.name)+'</b></span>':'')+'</div>':'';
  var tm=state.timer, tOn=tm.mode!=='off'&&state.started;
  document.getElementById('ctlmain').innerHTML=
    '<div class="ctl-l status"><button type="button" class="btn iconbtn hambtn" data-act="navMobile" aria-label="Menu" aria-expanded="'+(ui.navMob?'true':'false')+'" title="Menu">'+ICONS.menu+'</button>'+status+'</div><div class="ctl-c">'+blurb+'</div><div class="ctl-r">'+
    '<button type="button" class="btn timerbtn" data-act="timerOpen" aria-haspopup="dialog" aria-expanded="'+(ui.timerOpen?'true':'false')+'" title="Turn timer" aria-label="Turn timer">'+ICONS.timer+(tOn?'<span class="timer" data-timer>0:00</span>':'')+'</button>'+
    '<div class="seg sm densityseg" role="radiogroup" aria-label="Cards">'+[['focus','Focus','Only the card in turn is open. Click any card to open it'],['full','Full','Every card open']].map(function(o){return '<button type="button" role="radio" aria-checked="'+((ui.density||'full')===o[0])+'" data-act="density" data-val="'+o[0]+'" title="'+o[2]+'">'+o[1]+'</button>';}).join('')+'</div>'+
    '<button class="btn iconbtn fsbtn" data-act="fullscreen" aria-pressed="'+(document.fullscreenElement?'true':'false')+'" title="'+(document.fullscreenElement?'Leave full screen':'Full screen')+'" aria-label="Full screen">'+(document.fullscreenElement?ICONS.fullx:ICONS.full)+'</button></div>';
  document.getElementById('dock').innerHTML=
    '<button class="btn targetbtn" data-act="targetOpen" title="Damage, heal, conditions or an attack against several creatures">'+ICONS.target+'<span class="btxt">Target</span></button>'+
    '<button class="btn iconbtn undobtn" data-act="undo" title="Undo (Ctrl+Z or \u2318Z)" aria-label="Undo"'+(undoStack.length?'':' disabled')+'>'+ICONS.undo+'</button>'+
    '<button class="btn" data-act="prev" title="Shortcut: Left arrow"'+(canPrev?'':' disabled')+'>\u25c0 Prev</button>'+
    '<button class="btn primary" data-act="next" title="Shortcut: Right arrow"'+(state.combatants.length?'':' disabled')+'>'+(state.started?'Next turn \u25b6':'Start combat')+'</button>';
  renderTimerPop(); renderNav();
}

function sheetPanel(kind,obj){
  var s=ensureSheet(obj);
  var head=kind==='l'?'<div class="srow"><label>Name<input type="text" data-lf="name" value="'+esc(obj.name)+'"></label><label>Max HP<input type="number" min="1" data-lf="maxHp" value="'+esc(obj.maxHp==null?'':obj.maxHp)+'"></label></div>':'';
  var src=s.img?state.images[s.img]:null;
  var imgRow='<div class="imgrow"><div class="imgprev">'+(src?'<img src="'+src+'" alt="">':'<span>No image</span>')+'</div><div class="imgctl">'+
    '<label class="btn small filebtn">'+(src?'Replace image':'Add image')+'<input type="file" accept="image/*" data-img hidden></label>'+
    (src?'<button type="button" class="btn small ghost" data-act="imgClear">Remove</button>'+swHTML('imgToggle',s.imgShow!==false,'Show on the Combat Monitor'):'')+
    '<span class="private">Shown at the bottom of this card on the Combat Monitor.</span></div></div>';
  return '<div class="sheet" data-skind="'+kind+'" data-sid="'+obj.id+'">'+
    '<h4>Stats &amp; notes <span class="private">\u00b7 only you can see this</span></h4>'+head+
    '<div class="srow"><label>Armor class<input type="text" data-sf="ac" value="'+esc(s.ac)+'"></label><label>Speed<input type="text" data-sf="speed" value="'+esc(s.speed)+'" placeholder="Example: 30 ft., fly 60 ft."></label></div>'+
    '<div class="abil">'+ABIL.map(function(a){var x=s.ab[a[0]];
      return '<div><b>'+a[1]+'</b><input type="number" data-sab="'+a[0]+'.score" value="'+esc(x.score)+'" aria-label="'+a[1]+' score"><span class="mod" data-mod="'+a[0]+'">'+modText(x.score)+'</span>'+
        '<input type="text" data-sab="'+a[0]+'.save" value="'+esc(x.save)+'" placeholder="Save" aria-label="'+a[1]+' saving throw bonus"></div>';}).join('')+'</div>'+
    '<div class="srow3">'+resField(obj,s,'resist')+resField(obj,s,'immune')+resField(obj,s,'vuln')+'</div>'+resPanel(obj,s)+
    '<div class="sdual">'+fmtBox(obj,s,'attacks','Attack options','Example: Scimitar: +4, 1d6+2 slashing')+fmtBox(obj,s,'notes','Features','Traits, tactics, loot, secrets\u2026')+'</div>'+
    imgRow+
  '</div>';
}

/* ---------- resistances, immunities, vulnerabilities as a checklist ---------- */
var RES_TYPES=['acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder'];
var RES_LABEL={resist:'Resistances',immune:'Immunities',vuln:'Vulnerabilities'};
function resParse(val,key){
  var conds=(key==='immune')?CONDITIONS.map(function(x){return x.toLowerCase();}):[], types=[], cds=[], other=[];
  String(val||'').split(';').forEach(function(seg){
    var toks=seg.split(',').map(function(x){return x.trim();}).filter(Boolean); if(!toks.length)return;
    var ok=toks.every(function(t){var l=t.toLowerCase();return RES_TYPES.indexOf(l)>=0||conds.indexOf(l)>=0;});
    if(ok)toks.forEach(function(t){var l=t.toLowerCase(); if(RES_TYPES.indexOf(l)>=0){if(types.indexOf(l)<0)types.push(l);} else if(cds.indexOf(l)<0)cds.push(l);});
    else other.push(seg.trim());
  });
  return {types:types,conds:cds,other:other.join('; ')};
}
function resCompose(p){
  var parts=[];
  var chosen=RES_TYPES.filter(function(t){return p.types.indexOf(t)>=0;}).concat(p.conds);
  if(chosen.length)parts.push(chosen.map(cap).join(', '));
  if(p.other)parts.push(p.other);
  return parts.join('; ');
}
function resField(obj,s,key){
  var open=ui.resOpen&&ui.resOpen.id===obj.id&&ui.resOpen.k===key, v=s[key]||'';
  return '<div class="rfield"><span class="rlab" id="rl-'+key+'">'+RES_LABEL[key]+'</span><button type="button" class="rbtn'+(v?' has':'')+'" data-act="resToggle" data-k="'+key+'" aria-expanded="'+(!!open)+'" aria-labelledby="rl-'+key+'" title="Choose from the list">'+(v?'<span class="rval">'+esc(v)+'</span>':'<span class="rnone">None</span>')+'<span class="chev" aria-hidden="true">\u25be</span></button></div>';
}
function resPanel(obj,s){
  var o=ui.resOpen; if(!o||o.id!==obj.id)return '';
  var key=o.k, p=resParse(s[key],key);
  var box=function(v,on,grp){return '<label class="rck"><input type="checkbox" data-rck="'+v+'" data-rg="'+grp+'"'+(on?' checked':'')+'><span>'+cap(v)+'</span></label>';};
  return '<div class="rpanel2" role="group" aria-label="'+RES_LABEL[key]+'"><div class="rhead"><b>'+RES_LABEL[key]+'</b><button type="button" class="btn small ghost" data-act="resDone">Done</button></div>'+
    '<div class="rgrid">'+RES_TYPES.map(function(t){return box(t,p.types.indexOf(t)>=0,'t');}).join('')+'</div>'+
    (key==='immune'?'<div class="rsub">Conditions</div><div class="rgrid">'+CONDITIONS.map(function(c){var l=c.toLowerCase(); return box(l,p.conds.indexOf(l)>=0,'c');}).join('')+'</div>':'')+
    '<label class="rother">Anything else <span>(for example: from nonmagical attacks)</span><input type="text" data-rother="'+key+'" value="'+esc(p.other)+'" autocomplete="off" placeholder="Nothing else"></label></div>';
}
/* ---------- attack options and features: formatted text with an Edit button ---------- */
function fmtText(t){
  var out=[];
  String(t||'').split(/\n/).forEach(function(line){
    line=line.replace(/\s+$/,''); if(!line.trim())return;
    var tag='', m=line.match(/^(Bonus Action|Reaction)\s\u2014\s(.*)$/); if(m){tag='<span class="ftag">'+esc(m[1])+'</span>'; line=m[2];}
    var bul=/^\u2022\s?/.test(line); if(bul)line=line.replace(/^\u2022\s?/,'');
    var h, body;
    if(/:$/.test(line)&&line.length<90){body='<b class="fhd">'+esc(line)+'</b>';}
    else if((h=line.match(/^([^.:]{1,60}[.:])\s+(.+)$/))&&/^[A-Z0-9]/.test(h[1])){body='<b>'+esc(h[1])+'</b> '+esc(h[2]);}
    else body=esc(line);
    out.push('<p class="fl'+(bul?' bul':'')+'">'+tag+body+'</p>');
  });
  return out.join('');
}
function fmtBox(obj,s,key,label,ph){
  var val=s[key]||'', editing=!val||ui.sheetEdit===obj.id+':'+key;
  return '<div class="fbox" data-fkey="'+key+'"><div class="fhead"><span class="flab">'+label+'</span>'+(val?(editing?'<button type="button" class="btn small ghost" data-act="fmtDone">Done</button>':'<button type="button" class="btn small ghost" data-act="fmtEdit" data-k="'+key+'" aria-label="Edit '+label+'">'+ICONS.pencil+'<span class="btxt">Edit</span></button>'):'')+'</div>'+
    (editing?'<textarea rows="8" data-sf="'+key+'" aria-label="'+label+'" placeholder="'+esc(ph)+'">'+esc(val)+'</textarea>':'<div class="fmt">'+fmtText(val)+'</div>')+'</div>';
}
function sheetOpen(kind,id){return ui.sheet&&ui.sheet.kind===kind&&ui.sheet.id===id;}

function renderParty(){
  var el=document.getElementById('party'); if(!el)return;
  el.innerHTML=partyListHTML(true); renderPartyEdit();
}
function renderPartyEdit(){
  var el=document.getElementById('pedwrap'); if(!el)return;
  var p=ui.editParty?partyById(ui.editParty):null;
  if(!p){if(el.innerHTML)el.innerHTML=''; return;}
  var ae=document.activeElement; if(el.firstChild&&ae&&el.contains(ae)&&ae.tagName&&/INPUT|TEXTAREA|SELECT/.test(ae.tagName))return;
  var f=function(k,label,type,val,extra){return '<label class="pfld"><span>'+label+'</span><input type="'+type+'" data-pf="'+k+'" value="'+esc(val)+'" autocomplete="off"'+(extra||'')+'></label>';};
  el.innerHTML='<div class="scrim open" data-act="partyCancel"></div><div class="qrmodal addmodal pedmodal" role="dialog" aria-modal="true" aria-label="Edit player"><div class="dhead"><h2>Edit '+esc(p.name)+'</h2><button type="button" class="btn small" data-act="partyCancel">Close</button></div><div class="qrbody addbody">'+
    '<div class="pedit pedgrid" data-pid="'+p.id+'">'+f('name','Character name','text',p.name)+f('player','Player name','text',p.player||'')+f('maxHp','Max HP','number',p.maxHp==null?'':p.maxHp,' min="1"')+f('hp','Current HP','number',p.hp==null?'':p.hp,' min="0"')+
    f('ac','Armor class','text',(p.sheet&&p.sheet.ac)||'',' inputmode="numeric"')+f('speed','Speed','text',(p.sheet&&p.sheet.speed)||'')+
    '<div class="full"><button type="button" class="btn small primary" data-act="partySave">Save</button><button type="button" class="btn small" data-act="partyCancel">Cancel</button><button type="button" class="btn small ghost" data-act="sheetToggle">Stats &amp; notes</button>'+(state.claims&&state.claims[p.id]?'<button type="button" class="btn small ghost" data-act="partyRelease">Release phone</button>':'')+'<button type="button" class="btn small ghost danger" data-act="partyDel">Remove player</button></div></div>'+
    (sheetOpen('p',p.id)?sheetPanel('p',p):'')+'</div></div>';
}
/* inMenu: the Party list in the left menu, which also offers "+ Add new" (at the end, and in the empty state) */
function partyListHTML(inMenu){
  var live=Link.liveKeys(), html='', addNew=inMenu?'<div class="ph padd"><button type="button" class="btn small" data-act="addOpen" data-type="player" title="Add a player to the party">+ Add new</button></div>':'';
  if(!state.party.length){
    html+='<p class="help">'+(inMenu?'No players yet. Add one and they\u2019ll be here every session.':'No players yet. Use Add new \u2192 Player and they\u2019ll be here every session.')+'</p>'+addNew;
  } else {
    var allIn=state.party.every(function(p){return state.combatants.some(function(c){return c.partyId===p.id;});});
    html+='<div class="ph"><button class="btn small" data-act="partyAddAll"'+(allIn?' disabled title="Everyone is already in combat"':'')+'>Add all with initiative</button><button class="btn small ghost pheal" data-act="partyHeal" title="Restore every player to full hit points"><span class="phicon" aria-hidden="true">'+ICONS.heart+'</span>Restore health</button></div>';
    html+=state.party.map(function(p){
      var inFight=state.combatants.some(function(c){return c.partyId===p.id;});
      var bits=[]; if(state.settings.trackPC&&p.maxHp!=null)bits.push((p.hp!=null?p.hp:p.maxHp)+'/'+p.maxHp+' HP'); if(p.sheet&&p.sheet.ac)bits.push('AC '+p.sheet.ac);
      var cl=state.claims&&state.claims[p.id], on=!!cl&&live.indexOf(cl)>=0;
      var phone=cl?'<span class="pphone '+(on?'on':'off')+'" title="'+(on?'Phone connected':'Phone linked, not connected right now')+'">'+ICONS.phone+'<span>'+(on?'Connected':'Offline')+'</span></span>':'';
      return '<div class="prow" data-pid="'+p.id+'">'+
        '<div class="pname"><b>'+esc(p.name)+'</b><span>'+esc(p.player||'No player name')+(bits.length?' \u00b7 '+bits.join(' \u00b7 '):'')+'</span>'+phone+'</div>'+
        (inFight?'<span class="pin" role="img" aria-label="In combat" title="In combat">'+ICONS.sword+'</span>'
          :'<input type="number" step="any" data-pi placeholder="Init" aria-label="Initiative for '+esc(p.name)+'" value="'+esc(ui.rosterInit[p.id]==null?'':ui.rosterInit[p.id])+'"><button class="btn small" data-act="partyAdd">Add</button>')+
        '<button class="icon" data-act="partyEdit" title="Edit player" aria-label="Edit '+esc(p.name)+'">'+ICONS.pencil+'</button></div>';
    }).join('')+addNew;
  }
  return html;
}

function libSummary(e){
  return [e.maxHp!=null?'HP '+e.maxHp:'',e.sheet&&e.sheet.ac?'AC '+e.sheet.ac:''].filter(Boolean).join(' \u00b7 ')||'No HP set';
}

function libRowsHTML(list,emptyMsg){
  if(!list.length)return '<p class="help">'+emptyMsg+'</p>';
  return list.map(function(e){
    return '<div class="lrow" data-lid="'+e.id+'"><div class="lhead"><div class="pname"><b>'+esc(e.name)+'</b><span data-lsum>'+esc(libSummary(e))+'</span></div>'+
      '<button class="icon" data-act="sheetToggle">Stats</button><button class="icon danger" data-act="libDel">Delete</button></div>'+
      '<div class="ladd"><input type="number" step="any" data-li placeholder="Roll" title="Leave empty to roll d20 plus Dex" aria-label="Initiative for '+esc(e.name)+' (leave empty to roll)" value="'+esc(ui.libInit[e.id]==null?'':ui.libInit[e.id])+'">'+
      '<input type="number" min="1" max="20" data-lq value="'+esc(ui.libQty[e.id]||1)+'" aria-label="How many"><button class="btn small" data-act="libAdd">Add</button></div>'+
      (sheetOpen('l',e.id)?sheetPanel('l',e):'')+'</div>';
  }).join('');
}
function renderLibrary(){
  var npcs=state.library.filter(function(e){return monSrc(e)==='npc';}).sort(function(a,b){return a.name.localeCompare(b.name);});
  var el=document.getElementById('library');
  if(el){
    var grp=npcs.length?'<label class="libgroup"><input type="checkbox" class="tgl" data-libgroup'+(ui.libGroup?' checked':'')+'>Add multiples as one grouped card</label>':'';
    var ae=document.activeElement;
    if(!(ae&&el.contains(ae)&&ae.tagName&&/INPUT|TEXTAREA|SELECT/.test(ae.tagName)))el.innerHTML=grp+libRowsHTML(npcs,'No NPCs saved yet. Use \u201cSave to library\u201d on an NPC in the fight, or switch on \u201cAlso save to library\u201d when adding one.');
  }
  updateLibCounts();
  if(document.getElementById('stdnpcs')&&!(document.activeElement&&document.activeElement.matches&&document.activeElement.matches('[data-stdq]')))renderStdNpcs();
  if(ui.lib&&ui.lib.open&&ui.lib.tab!=='npcs'){
    var lst=document.getElementById('mmlist'), a2=document.activeElement;
    if(lst&&!(lst.contains(a2)&&a2.tagName&&/INPUT|TEXTAREA|SELECT/.test(a2.tagName)))mmRenderList(true);
  }
}

function condPanel(c){
  var f=ui.cond;
  var owners=state.combatants.map(function(o){return '<option value="'+o.id+'"'+(f.owner===o.id?' selected':'')+'>'+esc(o.name)+(o.id===c.id?' (itself)':'')+'</option>';}).join('');
  var durs=[['manual','Until removed'],['start','Until the start of a turn'],['end','Until the end of a turn'],['rounds','For a number of rounds']]
    .map(function(d){return '<option value="'+d[0]+'"'+(f.dur===d[0]?' selected':'')+'>'+d[1]+'</option>';}).join('');
  var picks=EXTRA_CONDS.concat(CONDITIONS,['Custom']).map(function(n){
    return '<button type="button" class="cpick'+(EXTRA_CONDS.indexOf(n)>=0?' extra':'')+(f.name===n?' on':'')+'" data-act="condPick" data-name="'+n+'">'+n+'</button>';}).join('');
  return '<div class="cpanel"><div class="cgrid">'+picks+'</div>'+(f.name&&COND_INFO[f.name]?'<p class="help">'+esc(COND_INFO[f.name])+'</p>':'')+
    '<div class="crow">'+
      (f.name==='Exhaustion'?'<label>Level<select data-cf="level">'+[1,2,3,4,5,6].map(function(n){return '<option'+(String(f.level)===String(n)?' selected':'')+'>'+n+'</option>';}).join('')+'</select></label>':'')+
      (f.name==='Custom'?'<label>Name<input type="text" data-cf="custom" value="'+esc(f.custom)+'" placeholder="Hexed, Hasted…"></label>':'')+
      '<label>Lasts<select data-cf="dur">'+durs+'</select></label>'+
      ((f.dur==='start'||f.dur==='end')?'<label>Whose turn<select data-cf="owner">'+owners+'</select></label>':'')+
      (f.dur==='rounds'?'<label>Rounds<input type="number" min="1" value="'+esc(f.n)+'" data-cf="n" style="width:80px"></label>':'')+
      '<button class="btn primary" data-act="condApply"'+(f.name?'':' disabled')+'>Apply</button><button class="btn" data-act="condClose">Cancel</button>'+
    '</div></div>';
}

function legPop(c){
  var l=c.leg, st=function(k,label,v){return '<div class="mgrp"><span>'+label+'</span><span class="legstep"><button type="button" class="icon" data-act="legStep" data-k="'+k+'" data-d="-1" aria-label="Fewer: '+label+'"'+(v<=0?' disabled':'')+'>\u2212</button><output aria-live="polite">'+v+'</output><button type="button" class="icon" data-act="legStep" data-k="'+k+'" data-d="1" aria-label="More: '+label+'"'+(v>=9?' disabled':'')+'>+</button></span></div>';};
  return '<div class="rowmenu legpop" role="dialog" aria-label="Legendary settings">'+st('max','Legendary actions per round',l.max)+st('rmax','Legendary resistances per day',l.rmax)+'</div>';
}
function legHTML(c){
  var l=c.leg; if(!l)return '';
  var open=ui.menu===c.id&&ui.menuKind==='leg';
  return '<div class="leg"><b class="leglab"><span>Legendary</span> <span>actions</span></b><span class="pips" title="Actions left this round">'+pips(l.left,l.max)+'</span>'+
    [1,2,3].map(function(k){return '<button class="btn small" data-act="legUse" data-cost="'+k+'"'+(l.left<k?' disabled':'')+'>Use '+k+'</button>';}).join('')+
    '<b class="leglab legsep"><span>Legendary</span> <span>resistance</span></b><span class="pips" title="Uses left">'+pips(l.rleft,l.rmax)+'</span><button class="btn small" data-act="lrUse"'+(l.rleft<1?' disabled':'')+'>Use</button>'+
    '<span class="legwrap"><button type="button" class="icon more" data-act="legMenu" aria-haspopup="dialog" aria-expanded="'+open+'" title="Change how many legendary actions and resistances" aria-label="Legendary settings">\u22ef</button>'+(open?legPop(c):'')+'</span>'+
    '<button type="button" class="icon legtrash" data-act="legOff" title="Remove legendary tracking" aria-label="Remove legendary tracking">'+ICONS.trash+'</button></div>';
}

function deathHTML(c,isNow){
  if(!(c.death&&isSide(c)&&c.hp===0&&tracks(c)))return '';
  var d=c.death, dis=(d.stable||d.dead)?' disabled':'';
  return '<div class="leg death'+(isNow?' dnow':'')+'"><b>'+(isNow&&!d.stable&&!d.dead?'Death saving throw \u2014 roll now':'Death saves')+'</b>'+
    '<span class="pips ok" title="Successes">'+pips(d.s,3)+'</span><span class="pips bad" title="Failures">'+failPips(d.f)+'</span>'+
    (d.dead?'<span class="tag">Dead</span>':d.stable?'<span class="tag">Stable</span>':'')+(d.hide?'<span class="tag">Hidden from the Combat Monitor</span>':'')+
    '<button class="btn small" data-act="dsOk"'+dis+'>Success</button><button class="btn small" data-act="dsFail"'+dis+'>Failure</button>'+
    '<button class="btn small" data-act="dsNat20"'+dis+' title="Natural 20: back up with 1 HP">Nat 20</button><button class="btn small" data-act="dsNat1"'+dis+' title="Natural 1: two failures">Nat 1</button>'+
    '<button class="btn small ghost" data-act="dsReset">Reset</button>'+
    '<button class="btn small ghost" data-act="dsHide">'+(d.hide?'Show results on the Combat Monitor':'Hide results from the Combat Monitor')+'</button></div>';
}

function acHTML(c){
  var base=acBase(c), tot=acTotal(c), mod=c.acMod||0, modTxt=mod?(mod>0?'+'+mod:String(mod)):'', open=ui.menu===c.id&&ui.menuKind==='ac';
  return '<div class="acwrap"><div class="acshield'+(mod?' modded':'')+'" role="button" tabindex="0" data-act="acOpen" aria-haspopup="dialog" aria-expanded="'+open+'" title="Armor class'+(mod&&base!=null?' (base '+base+', '+modTxt+')':'')+'. Click to change" aria-label="Armor class '+(tot==null?'not set':tot)+'. Click to change"><b>'+(tot==null?'\u2014':tot)+'</b><small>AC</small></div>'+
    (mod&&base!=null?'<div class="acsub" title="Base AC plus a temporary change">'+base+' <em>'+modTxt+'</em></div>':'')+
    (open?acPop(c):'')+'</div>';
}
function acPop(c){
  var base=acBase(c), tot=acTotal(c), mod=c.acMod||0;
  return '<div class="rowmenu acpop" role="dialog" aria-label="Change armor class"><div class="mgrp"><span>Armor class</span><input type="number" data-acin value="'+(tot==null?'':tot)+'" aria-label="New armor class"></div>'+
    '<div class="acpbtns"><button type="button" class="btn small" data-act="acPerm" title="Change the base AC for good">Permanent</button><button type="button" class="btn small" data-act="acTemp" title="A temporary change: the card then shows base plus the difference"'+(base==null?' disabled':'')+'>Temporary</button></div>'+
    (mod?'<button type="button" class="btn small ghost" data-act="acClear">Clear temporary ('+(mod>0?'+':'')+mod+')</button>':'')+
    '<p class="help">Base '+(base==null?'not set':base)+(mod?' \u00b7 temporary '+(mod>0?'+':'')+mod:'')+'</p></div>';
}

function acShowRow(c){
  var g=state.settings.acShow, shown=acShown(c);
  var t=g==='all'?'Everyone\u2019s AC is shown (Settings)':g==='none'?'AC is hidden for everyone (Settings)':'Show this AC on the Combat Monitor';
  return '<div class="mgrp"><span>AC on the Combat Monitor</span>'+swHTML('acShow',shown,'Show',g!=='default',t)+'</div>';
}

function rxHTML(c){
  var st=c.ready?'held':(c.rx?'used':'ready'), lbl=c.ready?'Reaction held':(c.rx?'Reaction used':'Use Reaction');
  var out='<button class="btn small rxbtn '+st+'" data-act="rxToggle" title="Use the reaction (click again to make it available)">'+lbl+'</button>';
  if(c.ready){
    out+='<span class="chip rdychip"><span><b>Readied</b>'+(c.ready.trigger?'<small>'+esc(c.ready.trigger)+'</small>':'')+'</span></span>'+
      '<button class="btn small" data-act="rdyFire" title="Spend the reaction and act now">Fire</button><button class="btn small ghost" data-act="rdyDrop" title="The trigger never happened">Drop</button>';
  } else out+='<button class="btn small" data-act="rdyOpen">Ready action</button>';
  return out;
}

function readyPanel(c){
  return '<div class="cpanel rpanel"><label>Trigger (optional)<input type="text" data-rf value="'+esc(ui.ready.text)+'" placeholder="When the ogre steps through the door"></label>'+
    '<div class="crow"><button class="btn primary" data-act="rdyHold">Hold action</button><button class="btn" data-act="rdyCancel">Cancel</button></div>'+
    '<p class="help">Turn order doesn\u2019t change. Fire it when the trigger happens to spend the reaction. It expires at the start of their next turn.</p></div>';
}

function memberHTML(c,m){
  var dead=m.hp!=null&&m.hp<=0, nm=esc(c.name+' '+m.n), body='';
  if(tracks(c)){
    if(m.hp==null)body='<input type="number" min="1" placeholder="Max HP" data-mf="startHp" aria-label="Start tracking hit points for '+nm+'">';
    else body='<div class="hpnums"><input type="number" value="'+m.hp+'" data-mf="hp" aria-label="Current HP"><span>/</span><input type="number" min="1" value="'+m.maxHp+'" data-mf="maxHp" aria-label="Max HP">'+(m.temp>0?'<span class="plus">+</span><input type="number" min="0" class="tmpin" placeholder="Temp" value="'+(m.temp||'')+'" data-mf="temp" aria-label="Temp HP" title="Temp HP (set to 0 to clear)">':'')+'</div>'+
      '<div class="bar '+hpClass(m)+'"><i style="width:'+hpPct(m)+'%"></i></div>'+
      '<div class="hpact"><input type="number" min="0" placeholder="Amount" value="'+esc(ui.mdelta[m.id]==null?'':ui.mdelta[m.id])+'" data-mdelta aria-label="Damage or healing amount for '+nm+'"><span class="bgrp dgrp" role="group" aria-label="Damage"><button class="btn small dmg half" data-act="mDmgHalf" data-half="1" title="Half damage, rounded down">\u00bd</button><button class="btn small dmg" data-act="mDmg">\u2212 Damage</button><button class="btn small dmg dbl" data-act="mDmgDbl" data-dbl="1" title="Double damage">2\u00d7</button></span><span class="bgrp hgrp" role="group" aria-label="Healing"><button class="btn small heal" data-act="mHeal">+ Heal</button><button class="btn small temp" data-act="mTemp" title="Set temp HP (keeps the higher value)">+ Temp HP</button></span></div>';
  }
  return '<div class="mem'+(dead?' dead':'')+'" data-mid="'+m.id+'"><div class="mhead"><b>'+nm+'</b><span class="macts">'+
    '<button class="btn small rxbtn '+(m.rx?'used':'ready')+'" data-act="mRx">'+(m.rx?'Reaction used':'Use Reaction')+'</button>'+
    (c.members.length>1?'<button class="icon" data-act="mSplit" title="Track this one on its own card">Split</button>':'')+
    '<button class="icon danger xbtn" data-act="mRemove" title="Remove '+nm+' from the group" aria-label="Remove '+nm+'">\u00d7</button></span></div>'+body+'</div>';
}

function dispSeg(c){
  var cur=c.disp||'enemy';
  return '<div class="seg sm" role="radiogroup" aria-label="Enemy, neutral or ally">'+[['enemy','Enemy'],['neutral','Neutral'],['ally','Ally']].map(function(o){
    return '<button type="button" role="radio" aria-checked="'+(cur===o[0]?'true':'false')+'" data-act="disp" data-val="'+o[0]+'">'+o[1]+'</button>';}).join('')+'</div>';
}

function rowMenu(c,grp,hpswHtml){
  var mi=function(act,label,cls){return '<button type="button" role="menuitem" class="mi'+(cls?' '+cls:'')+'" data-act="'+act+'">'+label+'</button>';};
  var npc=c.kind==='npc';
  var out='<div class="rowmenu" role="menu" aria-label="More for '+esc(c.name)+'">';
  if(c.kind!=='pc')out+='<div class="mgrp"><span>Type</span>'+dispSeg(c)+'</div>';
  out+=hpswHtml+acShowRow(c);
  out+='<div class="mdiv"></div>'+mi('clone','Clone\u2026')+(npc?mi('saveLib','Save to library'):'')+(npc&&!grp&&!c.leg?mi('legOn','Add legendary actions'):'')+(npc&&!grp?mi('regroupOpen','Regroup with\u2026'):'')+mi('remove','Remove from combat','danger')+'</div>';
  return out;
}
function savePop(c,grp){
  var mode=ui.saveMode||'n';
  return '<div class="rowmenu savepop" role="menu" aria-label="Saving throw for '+esc(c.name)+'"><div class="mgrp"><span>Roll a saving throw'+(grp?' (each member)':'')+'</span><div class="abbtns">'+
    ABIL.map(function(a){return '<button type="button" data-act="saveRoll" data-ab="'+a[0]+'" title="'+a[1]+' save '+sgn(saveBonus(c.sheet,a[0]))+'">'+a[1]+'</button>';}).join('')+'</div>'+
    '<div class="seg sm" role="radiogroup" aria-label="Advantage or disadvantage">'+[['n','Normal'],['adv','Advantage'],['dis','Disadvantage']].map(function(o){
      return '<button type="button" role="radio" aria-checked="'+(mode===o[0])+'" data-act="saveMode" data-val="'+o[0]+'">'+o[1]+'</button>';}).join('')+'</div></div></div>';
}
function regroupPop(c){
  var base=baseName(c.name).toLowerCase();
  var cand=state.combatants.filter(function(x){return x.kind==='npc'&&x.id!==c.id;});
  cand.sort(function(a,b){var sa=a.name.toLowerCase().indexOf(base)===0?0:1, sb=b.name.toLowerCase().indexOf(base)===0?0:1; return sa-sb||a.name.localeCompare(b.name,undefined,{numeric:true});});
  return '<div class="rowmenu regroup" role="menu" aria-label="Regroup"><div class="mgrp"><span>Regroup '+esc(c.name)+' with</span></div>'+
    (cand.length?cand.map(function(x){return '<button type="button" role="menuitem" class="mi" data-act="regroup" data-to="'+x.id+'">'+esc(x.name)+(isGroup(x)?' \u00b7 group of '+x.members.length:'')+'</button>';}).join(''):'<p class="help">No other NPCs in the fight.</p>')+'</div>';
}
/* Put a creature back into a group: it becomes a member, or the two become a new group. */
function mergeCards(srcId,dstId){
  var src=byId(srcId), dst=byId(dstId); if(!src||!dst||src===dst||isGroup(src))return;
  var had=src.conditions&&src.conditions.length;
  mutate(function(){
    var base=baseName(dst.name);
    if(!isGroup(dst)){
      var m1=dst.name.match(/\s(\d+)$/);
      dst.members=[{id:uid(),n:m1?parseInt(m1[1],10):1,hp:dst.hp,maxHp:dst.maxHp,temp:dst.temp||0,rx:!!dst.rx}];
      dst.hp=null; dst.maxHp=null; dst.temp=0; dst.rx=false; dst.name=base;
    }
    var used=dst.members.map(function(m){return m.n;}), sn=src.name.match(/\s(\d+)$/), n=sn&&used.indexOf(parseInt(sn[1],10))<0?parseInt(sn[1],10):Math.max.apply(null,used)+1;
    dst.members.push({id:uid(),n:n,hp:src.hp,maxHp:src.maxHp,temp:src.temp||0,rx:!!src.rx});
    dst.members.sort(function(a,b){return a.n-b.n;});
    removeInner(src.id);
    notes.push(src.name+' is back in the '+base+' group'+(had?' (its conditions did not come along)':''));
  });
}

function closeMenu(){
  ui.menu=null; ui.menuKind=null;
  document.querySelectorAll('.rowmenu').forEach(function(m){m.remove();});
  document.querySelectorAll('[aria-expanded="true"][data-act="menu"],[aria-expanded="true"][data-act="acOpen"],[aria-expanded="true"][data-act="saveOpen"]').forEach(function(b){b.setAttribute('aria-expanded','false');});
  document.querySelectorAll('.row.menuopen').forEach(function(r){r.classList.remove('menuopen');});
}
function keepScroll(fn){
  var lw=document.querySelector('.listwrap'), st=lw?lw.scrollTop:0, wy=window.scrollY;
  fn(); if(lw)lw.scrollTop=st; window.scrollTo(0,wy);
}
/* Opens a pop-over on one card, redrawing the list without moving the page. If it would run off the
   bottom it flips above its button, or pins to the bottom of the screen; it never scrolls the page. */
function openPop(id,kind){
  keepScroll(function(){ui.menu=id; ui.menuKind=kind; renderList();});
  var mn=document.querySelector('.rowmenu'); if(!mn)return;
  var host=mn.parentNode, hr=host.getBoundingClientRect(), mr=mn.getBoundingClientRect();
  if(mr.bottom>window.innerHeight-8){
    if(hr.top>mr.height+16){mn.style.top='auto';mn.style.bottom='calc(100% + 4px)';}
    else{mn.style.position='fixed';mn.style.top='auto';mn.style.left='auto';mn.style.transform='none';mn.style.bottom='12px';mn.style.right=Math.max(8,window.innerWidth-hr.right)+'px';}
  }
}
function isCollapsed(c){
  var o=ui.cardOpen&&ui.cardOpen[c.id]; if(o!=null)return !o;
  if(ui.density==='focus')return !!state.started&&c.id!==state.turnId;
  return false;
}

function rowHTML(c,i,L,np){
  var grp=isGroup(c);
  var now=state.started&&c.id===state.turnId, nxt=c.id===np;
  var tieUp=i>0&&L[i-1].init===c.init, tieDn=i<L.length-1&&L[i+1].init===c.init;
  var badges=(nxt?'<span class="tag nxt">'+readyWord(c.id,false)+'</span>':'')+(now&&state.timer.mode!=='off'?'<span class="timer ctimer" data-timer>0:00</span>':'')+(c.hidden?'<span class="tag">Hidden from players</span>':'');
  var hcur=hpMode(c);
  var hpswMenu=(!isSide(c)&&tracks(c))?'<div class="mgrp"><span>Health on the Combat Monitor</span><div class="seg sm" role="radiogroup" aria-label="Health on the Combat Monitor">'+
    [['status','Word'],['bar','Bar'],['exact','Numbers']].map(function(o){return '<button type="button" role="radio" aria-checked="'+(hcur===o[0]?'true':'false')+'" data-act="hpMode" data-val="'+o[0]+'">'+o[1]+'</button>';}).join('')+'</div></div>':'';
  var hp='<div class="hp"></div>';
  if(grp){
    if(tracks(c))hp='<div class="hp"><div class="hpact"><input type="number" min="0" placeholder="Amount" value="'+esc(ui.delta[c.id]==null?'':ui.delta[c.id])+'" data-delta aria-label="Damage or healing amount for every member"><span class="bgrp dgrp" role="group" aria-label="Damage to every member"><button class="btn small dmg half" data-act="gDmgHalf" data-half="1" title="Half damage to every member, rounded down">\u00bd</button><button class="btn small dmg" data-act="gDmg">\u2212 Damage all</button><button class="btn small dmg dbl" data-act="gDmgDbl" data-dbl="1" title="Double damage to every member">2\u00d7</button></span><span class="bgrp hgrp" role="group" aria-label="Healing every member"><button class="btn small heal" data-act="gHeal">+ Heal all</button></span></div>'+
      (c.members.some(function(m){return m.hp==null;})?'<input type="number" min="1" placeholder="Max HP for all" data-f="gstart" aria-label="Max HP for every member">':'')+'</div>';
  } else if(tracks(c)){
    if(c.hp==null){
      hp='<div class="hp"><input type="number" min="1" placeholder="Max HP to track" data-f="startHp" aria-label="Start tracking hit points">'+'</div>';
    } else {
      hp='<div class="hp"><div class="hpnums"><span class="hpicon" aria-hidden="true" title="Hit points">'+ICONS.heart+'</span><input type="number" value="'+c.hp+'" data-f="hp" aria-label="Current hit points"><span>/</span><input type="number" min="1" value="'+c.maxHp+'" data-f="maxHp" aria-label="Maximum hit points">'+(c.temp>0?'<span class="plus">+</span><input type="number" min="0" class="tmpin" placeholder="Temp" value="'+(c.temp||'')+'" data-f="temp" aria-label="Temporary hit points" title="Temp HP (set to 0 to clear)">':'')+'</div>'+
         '<div class="bar '+hpClass(c)+'"><i style="width:'+hpPct(c)+'%"></i></div>'+
         '<div class="hpact"><input type="number" min="0" placeholder="Amount" value="'+esc(ui.delta[c.id]==null?'':ui.delta[c.id])+'" data-delta aria-label="Damage or healing amount"><span class="bgrp dgrp" role="group" aria-label="Damage"><button class="btn small dmg half" data-act="dmgHalf" data-half="1" title="Half damage, rounded down">\u00bd</button><button class="btn small dmg" data-act="dmg">\u2212 Damage</button><button class="btn small dmg dbl" data-act="dmgDbl" data-dbl="1" title="Double damage">2\u00d7</button></span><span class="bgrp hgrp" role="group" aria-label="Healing"><button class="btn small heal" data-act="heal">+ Heal</button><button class="btn small temp" data-act="temp" title="Set temp HP (keeps the higher value)">+ Temp HP</button></span></div>'+'</div>';
    }
  }
  var chips=c.conditions.map(function(cd){
    var dt=durText(cd,c), info=condInfoText(cd), open=!!ui.cinfo[cd.id];
    return '<span class="chip"><span><b>'+esc(condLabel(cd))+'</b>'+(dt?'<small>'+esc(dt)+'</small>':'')+'</span>'+
      (info?'<button class="cinfo" data-act="condInfo" data-cid="'+cd.id+'" aria-expanded="'+open+'" title="What this does">'+(open?'\u25be':'\u25b8')+'</button>':'')+
      '<button data-act="condRemove" data-cid="'+cd.id+'" aria-label="Remove '+esc(cd.name)+'">\u00d7</button></span>';
  }).join('');
  var endedChips=liveEnded(c).map(function(e){return '<span class="chip endedchip"><span><b><i class="ck">\u2713</i> <s>'+esc(e.label)+'</s></b><small>ended</small></span><button data-act="endedClear" data-eid="'+e.id+'" aria-label="Dismiss">\u00d7</button></span>';}).join('');
  var descs=c.conditions.filter(function(cd){return ui.cinfo[cd.id]&&condInfoText(cd);}).map(function(cd){
    return '<div class="cdesc"><b>'+esc(condLabel(cd))+'</b> '+esc(condInfoText(cd))+'</div>';
  }).join('');
  var alive=grp?c.members.filter(function(m){return !(m.hp!=null&&m.hp<=0);}).length:0;
  var dchip='<button type="button" class="dispchip d-'+(c.disp||'enemy')+'" data-act="dispCycle" title="Click to change: Enemy, Neutral or Ally">'+({enemy:'Enemy',neutral:'Neutral',ally:'Ally'})[c.disp||'enemy']+'</button>';
  var sub=grp?dchip+'<span class="gcount">'+alive+' of '+c.members.length+' standing</span>':(c.kind==='pc'?(state.settings.showNames!==false?esc(c.player||'Player'):''):dchip);
  var gmini=grp?'<div class="gmini" aria-label="Health of each in the group">'+c.members.map(function(m){var dead=m.hp!=null&&m.hp<=0, t=m.hp!=null; return '<span class="gm'+(dead?' dead':'')+'" title="'+esc(c.name+' '+m.n)+(t?': '+m.hp+' of '+m.maxHp+' HP':'')+(dead?' (down)':'')+'"><b>'+m.n+'</b>'+(t?'<i class="gmb '+hpClass(m)+'"><u style="width:'+hpPct(m)+'%"></u></i><em>'+m.hp+'</em>':'<em>\u2013</em>')+'</span>';}).join('')+'</div>':'';
  var hasTie=!!(tieUp||tieDn);
  var tUp=tieUp?'<button type="button" class="tiebtn" data-act="up" title="Move up within the tie" aria-label="Move up within the tie">\u25b2</button>':'<span class="tiebtn ph" aria-hidden="true"></span>';
  var tDn=tieDn?'<button type="button" class="tiebtn" data-act="down" title="Move down within the tie" aria-label="Move down within the tie">\u25bc</button>':'<span class="tiebtn ph" aria-hidden="true"></span>';
  return '<article class="row '+sideClass(c)+(grp?' group':'')+(now?' now':'')+(nxt?' nextpc':'')+(isDown(c)?' down':'')+(c.hidden?' ishidden':'')+(ui.menu===c.id?' menuopen':'')+(isCollapsed(c)?' collapsed':'')+'" data-id="'+c.id+'">'+
    '<div class="r-init'+(hasTie?' hastie':'')+'">'+(hasTie?tUp:'')+'<input type="number" step="any" value="'+c.init+'" data-f="init" aria-label="Initiative for '+esc(c.name)+'">'+(hasTie?tDn:'')+'</div>'+
    '<div class="who"><input type="text" class="nm" value="'+esc(c.name)+'" data-f="name" aria-label="Name" readonly><div class="sub">'+sub+badges+'</div>'+gmini+
      '<div class="sum" data-sum>'+esc(sheetSummary(c.sheet))+'</div>'+
      '</div>'+
    hp+
    '<div class="conds">'+endedChips+chips+'<button class="btn small cond" data-act="condOpen">Add condition</button>'+(grp||c.death?'':rxHTML(c))+(c.kind==='npc'?'<span class="savewrap"><button type="button" class="btn small saveopen" data-act="saveOpen" aria-haspopup="menu" aria-expanded="'+(ui.menu===c.id&&ui.menuKind==='save')+'" title="Roll a saving throw">Save</button>'+(ui.menu===c.id&&ui.menuKind==='save'?savePop(c,grp):'')+'</span>':'')+descs+'</div>'+
    '<div class="acbox">'+acHTML(c)+'</div>'+
    '<div class="acts">'+
      '<button type="button" class="icon eyebtn'+(c.hidden?' off':'')+'" data-act="hide" aria-pressed="'+(!!c.hidden)+'" title="'+(c.hidden?'Hidden from players. Click to show':'Visible to players. Click to hide')+'" aria-label="'+(c.hidden?'Show to players':'Hide from players')+'">'+(c.hidden?ICONS.eyeoff:ICONS.eye)+'</button>'+
      '<button class="icon more" data-act="menu" aria-haspopup="menu" aria-expanded="'+(ui.menu===c.id&&(ui.menuKind||'more')==='more')+'" title="More: clone, save, regroup, remove">\u22ef</button>'+
      (ui.menu===c.id&&(ui.menuKind||'more')==='more'?rowMenu(c,grp,hpswMenu):'')+(ui.menu===c.id&&ui.menuKind==='regroup'?regroupPop(c):'')+'</div>'+
    legHTML(c)+deathHTML(c,now)+
    (grp?'<div class="members">'+c.members.map(function(m){return memberHTML(c,m);}).join('')+'<button type="button" class="memadd" data-act="mAdd" title="Add one more to this group" aria-label="Add one more">+1</button></div>':'')+
    (ui.cond&&ui.cond.id===c.id?condPanel(c):'')+
    (ui.ready&&ui.ready.id===c.id?readyPanel(c):'')+
    '<div class="rowtools"><button type="button" class="btn small ghost viewstats" data-act="sheetToggle" aria-expanded="'+sheetOpen('c',c.id)+'">'+ICONS.stats+'<span>'+(sheetOpen('c',c.id)?'Hide stats':'View stats')+'</span></button></div>'+
    (sheetOpen('c',c.id)?sheetPanel('c',c):'')+
    '<button type="button" class="rowtab colbtn" data-act="cardToggle" aria-expanded="'+(!isCollapsed(c))+'" title="'+(isCollapsed(c)?'Expand this card':'Collapse this card')+'" aria-label="'+(isCollapsed(c)?'Expand this card':'Collapse this card')+'">'+(isCollapsed(c)?ICONS.expand:ICONS.collapse)+'<span>'+(isCollapsed(c)?'Expand':'Collapse')+'</span></button>'+
  '</article>';
}

function renderList(){
  var el=document.getElementById('list'), L=state.combatants, np=nextPcId();
  el.innerHTML=L.length?L.map(function(c,i){return rowHTML(c,i,L,np);}).join('')
    :'<div class="empty">'+logoLockup()+'No combatants yet.<br>Open <b>Add new</b> in the menu to add your players and NPCs.</div>';
  if(ui.scrollNow){ui.scrollNow=false;var n=el.querySelector('.row.now'); if(n&&n.scrollIntoView)n.scrollIntoView({block:'nearest',behavior:'smooth'});}
}

