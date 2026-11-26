/* ================================================================
   15. Theme and render
   Skin selection and the single render() entry point.
   ================================================================ */

function applyTheme(){
  var root=document.documentElement, sk=(shellMode==='phone')?(ph.skin||(ph.snap&&ph.snap.sk)||'spark'):(state.settings.skin||'spark');
  if(SKINS_OK.indexOf(sk)<0)sk='spark';
  root.setAttribute('data-skin',sk);
  root.setAttribute('data-theme',sk==='slate'?'dark':'light');
}

/* "combat wombat" is a long wordmark: shrink it (never below 75%) until it fits next to the header buttons. */
function fitWordmark(){
  document.querySelectorAll('.bword,.ph-brand span').forEach(function(b){
    var box=b.closest('.nhead,.ph-top')||b.parentElement; if(!box||!b.offsetParent)return;
    b.style.fontSize=''; var fs0=parseFloat(getComputedStyle(b).fontSize), fs=fs0;
    var tooWide=function(){return box.scrollWidth>box.clientWidth+1||b.getBoundingClientRect().right>box.getBoundingClientRect().right-4||(b.parentElement.scrollWidth>b.parentElement.clientWidth+1);};
    while(tooWide()&&fs>fs0*.75){fs-=.5; b.style.fontSize=fs+'px';}
  });
}
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){try{fitWordmark();}catch(e){}});
window.addEventListener('resize',function(){try{fitWordmark();}catch(e){}});
function render(){
  if(testMode)return;
  var m=phoneModeNow()?'phone':(isPlayerWindow()?'players':'dm');
  if(m!==shellMode){
    shellMode=m; app.innerHTML=''; applyTheme();
    document.body.className=m==='players'?('players'+(isPlayerWindow()?' live':'')):(m==='phone'?'phone':'dm');
    if(m==='dm')buildDMShell();
    if(m==='phone')Link.setPresence({ph:1,cl:ph.claim,ops:[]});
  }
  applyTheme();
  if(ui.density===undefined){ui.density=lsGet('bm-density')||'focus'; if(ui.density==='compact')ui.density='focus'; ui.cardOpen={};}
  if(ui.navMin===undefined){ui.navMin=lsGet('bm-nav')==='min';}
  if(m==='dm'){if(ui.density==='focus'&&ui.lastTurn!==state.turnId)ui.cardOpen={}; ui.lastTurn=state.turnId;}
  if(m!=='phone')Sfx.observe(isPlayerWindow()?'tv':'dm');
  if(m==='phone')renderPhone(); else if(m==='players')renderPlayers(); else {renderTop();renderMonMini();renderParty();renderLibrary();renderAdd();renderList();renderDrawer();renderQr();Cloud.paint();renderAoe(true); if(ui.clone&&!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#clonewrap')))renderClone();nowIntoView();tick();}
  fitWordmark();
  if(DEMO&&m==='dm')demoRender();
  if(BETA&&m==='dm')betaRender();
}

