/* ================================================================
   27. Cloud save
   Keeps the DM's whole session in the page's database so it follows the owner between
   devices. Only the owner can read or write it (the "dm" path rule set at publish), so
   players never see it. Local storage stays the primary copy and works offline; the cloud
   is a mirror that other devices adopt when it is newer. Two sessions that disagree make
   the DM choose, so nothing is overwritten silently.
   ================================================================ */

var Cloud=(function(){
  var db=null, ref=null, devId=uid(), status='off', note='', pushing=false, timer=null,
      lastPushed=-1, conflict=null, imgSent={}, imgAsked={}, started=false;

  function canPush(){return !!(ref&&shellMode==='dm'&&!conflict&&!testMode);}
  function pristine(st){return !(st.party.length||st.library.length||st.combatants.length);}
  function setStatus(x,n){
    var changed=(x!==status||(n||'')!==note); status=x; note=n||'';
    if(changed&&shellMode==='dm'&&ui.settingsOpen)renderDrawer();
  }

  function saveLocal(){
    lsSet(KEY,JSON.stringify(state));
    try{if(bc)bc.postMessage({t:Date.now()});}catch(e){}
  }

  /* Replace this device's table with the saved one. Never bumps the revision or pushes back. */
  function adopt(o){
    var ns; try{ns=JSON.parse(o.s);}catch(e){return false;}
    var imgs=state.images||{};
    ns=normalise(ns);
    ns.images=imgs; ns.rev=o.rev; ns.ep=o.ep;
    state=ns; undoStack=[];
    saveLocal(); wantImages(); liveSoon(); render();
    return true;
  }

  /* Pictures live in their own documents so the main one stays small. */
  function wantImages(){
    if(!db)return;
    var ids={};
    [state.party,state.library,state.combatants].forEach(function(l){(l||[]).forEach(function(o){if(o.sheet&&o.sheet.img)ids[o.sheet.img]=1;});});
    Object.keys(ids).forEach(function(id){
      if(state.images[id]||imgAsked[id])return; imgAsked[id]=1;
      db.doc('dm/img_'+id).get().then(function(sn){
        var d=sn.exists&&sn.data(); if(!d||typeof d.d!=='string')return;
        state.images[id]=d.d; imgSent[id]=1; saveLocal(); render();
      }).catch(function(){imgAsked[id]=0;});
    });
  }
  function sendImages(){
    var p=Promise.resolve();
    Object.keys(state.images||{}).filter(function(id){return !imgSent[id];}).forEach(function(id){
      p=p.then(function(){
        var d=state.images[id]; if(!d||d.length>245000){imgSent[id]=1;return;}
        return db.doc('dm/img_'+id).set({d:d}).then(function(){imgSent[id]=1;});
      });
    });
    return p;
  }

  function onSnap(sn){
    if(!sn.exists){ if(!pristine(state))soon(); setStatus('synced'); return; }
    var o=sn.data();
    if(!o||typeof o.s!=='string')return;
    if(o.dev===devId&&o.ep===state.ep){setStatus('synced');return;}     /* our own write coming back */
    if(o.ep===state.ep){
      if(o.rev>state.rev){adopt(o);setStatus('synced');}
      else if(o.rev<state.rev)soon();                                    /* this device is ahead */
      else setStatus('synced');
      return;
    }
    /* a different table: a blank device or a Combat Monitor just takes it; a DM screen asks */
    if(pristine(state)||shellMode!=='dm'){adopt(o);setStatus('synced');return;}
    conflict=o; setStatus('conflict'); paint();
  }

  function push(){
    if(!canPush())return;
    if(pushing){soon();return;}
    var body=snap(), rev=state.rev;
    if(body.length>240000){setStatus('error','This table is too big to save to your account.');return;}
    pushing=true;
    ref.set({ep:state.ep,rev:rev,dev:devId,t:Date.now(),s:body})
      .then(function(){lastPushed=rev; setStatus('synced'); return sendImages();})
      .catch(function(e){setStatus('error',(e&&e.message)||'');})
      .then(function(){pushing=false; if(state.rev!==lastPushed)soon();});
  }
  function soon(){ if(!canPush())return; clearTimeout(timer); timer=setTimeout(push,700); }

  function start(){
    if(started||!window.claude||!window.claude.use)return; started=true;
    window.claude.use('db').then(function(d){
      if(!d)return; db=d; ref=db.doc('dm/state'); setStatus('connecting');
      ref.onSnapshot(onSnap,function(e){setStatus('error',(e&&e.message)||'');});
    }).catch(function(){});
  }

  function paint(){
    var el=document.getElementById('cloudwrap'); if(!el)return;
    if(!conflict){el.innerHTML='';return;}
    var n={p:0,l:0}; try{var c=JSON.parse(conflict.s); n.p=(c.party||[]).length; n.l=(c.library||[]).length;}catch(e){}
    el.innerHTML='<div class="scrim open"></div><div class="qrmodal" role="dialog" aria-label="Two sessions found"><div class="dhead"><h2>Two sessions found</h2></div>'+
      '<div class="qrbody"><p>Your account has a saved session from another device ('+n.p+' player'+(n.p===1?'':'s')+', '+n.l+' saved NPC'+(n.l===1?'':'s')+', updated '+esc(new Date(conflict.t).toLocaleString())+'), and this device has its own. Which one do you want?</p>'+
      '<div class="cloudbtns"><button type="button" class="btn" data-act="cloudUse">Use the saved session</button>'+
      '<button type="button" class="btn ghost" data-act="cloudKeep">Keep this device\u2019s session</button></div>'+
      '<p class="help">Keeping this one replaces the saved session on your other devices.</p></div></div>';
  }

  function statusHTML(){
    var t={off:'Not connected, so your session is only saved on this device.',
           connecting:'Connecting to your account\u2026',
           synced:'Saved to your Claude account. Open this page on any device you\u2019re signed in on and it picks up where you left off.',
           conflict:'Waiting for you to choose between two sessions.',
           error:'Couldn\u2019t reach your account'+(note?' ('+esc(note)+')':'')+'. Everything is still saved on this device.'}[status];
    return '<p class="help">'+t+'</p><p class="help">Only you, and anyone you have shared the page with as an Editor, can read it. Players never see it.</p>'+(ref?'<button type="button" class="btn small" data-act="cloudNow">Save now</button>':'');
  }

  return {
    start:start, soon:soon, paint:paint, statusHTML:statusHTML, adopt:adopt,
    syncNow:function(){ if(!ref){toast('Not connected to your account');return;} clearTimeout(timer); push(); toast('Saving\u2026'); },
    useSaved:function(){ var o=conflict; conflict=null; if(o)adopt(o); setStatus('synced'); paint(); },
    keepThis:function(){ var o=conflict; conflict=null; if(o){state.ep=o.ep; state.rev=Math.max(state.rev,o.rev)+1;} persist(); setStatus('connecting'); paint(); },
    devId:devId, _status:function(){return status;}
  };
})();

