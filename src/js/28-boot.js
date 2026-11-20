/* ================================================================
   28. Boot
   Start the link and draw the first frame.
   ================================================================ */

if((location.hash||'').toLowerCase()==='#selftest'){
  runSelfTests();
}else if(BETA&&!betaAcct){
  betaSignInScreen();
}else{
var wasLibV=state.libV; libMigrate(state); LIB_OK=true; if(wasLibV!==state.libV)persist();
Link.start(); Link.onSnap(phOnSnap); Link.onPeers(handlePeers);

Link.onConn(function(){if(shellMode==='phone')renderPhone();});

if(window.claude&&window.claude.use){
  window.claude.use('user').then(function(u){
    if(!u)return;
    return Promise.all([u.isOwner(),Promise.resolve(u.canEdit?u.canEdit():false).catch(function(){return false;})]).then(function(r){
      var o=r[0]||r[1];   /* the owner, or an Editor they shared the page with */
      ui.isEditor=!r[0]&&!!r[1];
      if(!o){ui.owner=false;ui.forcePhone=true;render();}else{if(!DEMO)Cloud.start(); if(ui.isEditor)render();}
    });
  }).catch(function(){});
}

render();
if(DEMO)demoBoot();
}
})();
