/* ================================================================
   20. Events
   Phone events first, then the DM and display events.
   ================================================================ */

document.addEventListener('click',function(e){
  var t=e.target.closest('[data-pact]'); if(!t||shellMode!=='phone')return;
  var a=t.dataset.pact, me=phMine();
  phUnlock();
  switch(a){
    case 'claim':ph.claim=t.dataset.id; ph.claimOk=false; ph.claimAt=Date.now(); ph.msg=''; ph.watching=false; ph.scrollMe=true; lsDel('bm-watch'); lsSet(CLAIM_KEY,ph.claim); Link.setPresence({cl:ph.claim}); phCheckClaim(); phCheckAlerts(); break;
    case 'watch':ph.msg=''; ph.claim=null; ph.watching=true; lsSet('bm-watch','1'); break;
    case 'menu':ph.menu=true;ph.anim=true;break;
    case 'menuclose':ph.menu=false;break;
    case 'alerts':ph.alerts=!ph.alerts; lsSet('bm-alerts',ph.alerts?'on':'off'); break;
    case 'wake':phWake(!ph.wake); break;
    case 'testalert':{var dg=phAlert('turn'); ph.menu=false; ph.popAnim=true; ph.popup={t:'turn',test:true,note:ph.alerts?('Sound: '+(dg.sound?'played':'blocked on this phone')+'. Vibration: '+(dg.vib?'on':'not available on this phone')+'.'):'Alerts are switched off in the menu.'}; break;}
    case 'switch':ph.menu=false; ph.watching=false; lsDel('bm-watch'); phRelease(''); break;
    case 'popclose':ph.popup=null;break;
    case 'cardmode':ph.cardMode=ph.cardMode==='static'?'scroll':'static'; lsSet('bm-phone-cm',ph.cardMode); ph.monTurn=''; break;
    case 'cardmode2':ph.cardMode=t.dataset.v==='static'?'static':'scroll'; lsSet('bm-phone-cm',ph.cardMode); ph.monTurn=''; break;
    case 'hphalf':{var v2=parseInt(ph.amt,10); if(!me||isNaN(v2)||v2<=0){toast('Enter an amount first');break;} var h2=Math.floor(v2/2); if(h2<=0){toast('Half of '+v2+' rounds down to 0');break;} phOp({t:'dmg',v:h2}); ph.amt=''; break;}
    case 'jumpme':{var mc0=app.querySelector('.ph-mecard'); if(mc0&&mc0.scrollIntoView)mc0.scrollIntoView({block:'start',behavior:'smooth'}); return;}
    case 'acopen':ph.acOpen=true; ph.anim=true; break;
    case 'acclose':ph.acOpen=false; break;
    case 'acclear':if(me)phOp({t:'acmod',v:0}); break;
    case 'jump':{var cr=app.querySelector('.ph-row.now'); if(cr&&cr.scrollIntoView)cr.scrollIntoView({block:'center',behavior:'smooth'}); return;}
    case 'cinfo':ph.open[t.dataset.i]=!ph.open[t.dataset.i];break;
    case 'picker':ph.picker=true;ph.anim=true;break;
    case 'stats':ph.statsOpen=!ph.statsOpen;break;
    case 'myopen':ph.myOpen=!ph.myOpen;break;
    case 'sendlocal':{var P0=ph.snap&&ph.snap.P.filter(function(p){return p.id===ph.claim;})[0]; var mp=P0&&phLocalMap(P0,false); if(mp){phOp({t:'statsb',v:mp});toast('Sent your saved sheet to the DM');} break;}
    case 'pickerclose':ph.picker=false;break;
    case 'hp':{var v=parseInt(ph.amt,10); if(!me||isNaN(v)||v<=0){toast('Enter an amount first');break;} phOp({t:t.dataset.k,v:v}); ph.amt=''; break;}
    case 'ac':if(me)phOp({t:'acmod',v:(me.am||0)+parseInt(t.dataset.d,10)}); break;
    case 'rx':if(me)phOp({t:'rx',v:1}); break;
    case 'rxundo':if(me)phOp({t:'rx',v:0}); break;
    case 'viewset':setView(t.dataset.v);return;
    case 'pskin':ph.skin=t.dataset.id||null; if(ph.skin)lsSet('bm-phone-skin',ph.skin); else lsDel('bm-phone-skin'); applyTheme(); break;
    case 'rdyopen':ph.rdyOpen=true;break;
    case 'rdyhold':phOp({t:'rdy',s:ph.rdyText}); ph.rdyOpen=false; ph.rdyText=''; break;
    case 'rdyfire':phOp({t:'rdyfire'});break;
    case 'rdydrop':phOp({t:'rdydrop'});break;
    case 'ds':phOp({t:'ds',k:t.dataset.k});break;
    case 'cadd':{var nm=t.dataset.n, ex=me&&me.cd.filter(function(x){return x.n===nm;})[0]; phOp({t:'cadd',n:nm,l:nm==='Exhaustion'?((ex&&ex.l||0)+1):0}); ph.picker=false; break;}
    case 'cdel':phOp({t:'cdel',i:t.dataset.i});break;
  }
  renderPhone();
});

document.addEventListener('input',function(e){
  var t=e.target; if(shellMode!=='phone')return;
  if(t.hasAttribute&&t.hasAttribute('data-pamt'))ph.amt=t.value;
  else if(t.hasAttribute&&t.hasAttribute('data-prdy'))ph.rdyText=t.value;
});

document.addEventListener('change',function(e){
  var t=e.target; if(shellMode!=='phone'||!t.hasAttribute)return;
  if(t.hasAttribute('data-pst')){phSetMy(t.dataset.pst,t.value); phOp({t:'stats',f:t.dataset.pst,v:t.value});}
  else if(t.hasAttribute('data-pmy')){phSetMy(t.dataset.pmy,t.value);}
});

setInterval(function(){if(shellMode==='phone'&&ph.snap){var off=phOffline(); if(off!==ph.wasOff){ph.wasOff=off;renderPhone(true);}}},4000);

document.addEventListener('focusout',function(e){if(shellMode==='phone'&&ph.dirty)setTimeout(renderPhone,60);});

document.addEventListener('keydown',function(e){
  if(shellMode!=='phone'||e.key!=='Enter')return;
  var t=e.target; if(t.hasAttribute&&t.hasAttribute('data-pamt')){e.preventDefault();t.blur();}
});

function askConfirm(what){ui.confirm=what; renderConfirm(); focusEl('[data-conf="no"]');}

function refreshSummary(kind,obj){
  if(kind==='c'){var el=document.querySelector('[data-id="'+obj.id+'"] [data-sum]'); if(el)el.textContent=sheetSummary(obj.sheet);}
  if(kind==='l'){var r=document.querySelector('[data-lid="'+obj.id+'"]'); if(r){var s=r.querySelector('[data-lsum]'); if(s)s.textContent=libSummary(obj); var b=r.querySelector('.pname b'); if(b)b.textContent=obj.name;}}
}

document.addEventListener('click',function(e){
  var t=e.target.closest('[data-act]');
  if(!t){if(ui.menu&&!e.target.closest('.rowmenu'))closeMenu(); return;}
  var a=t.dataset.act, rowEl=t.closest('[data-id]'), id=rowEl?rowEl.dataset.id:null;
  var pEl=t.closest('[data-pid]'), pid=pEl?pEl.dataset.pid:null;
  var lEl=t.closest('[data-lid]'), lid=lEl?lEl.dataset.lid:null;
  var c=id?byId(id):null;
  if(ui.menu&&!{menu:1,hpMode:1,disp:1,acShow:1,saveRoll:1,saveMode:1,saveOpen:1,acOpen:1,regroupOpen:1,acPerm:1,acTemp:1,acClear:1,legMenu:1,legStep:1}[a])closeMenu();
  if(t.dataset.half||t.dataset.dbl){   /* the half and 2x buttons change what is typed in the box, then run the normal action */
    var bx=t.closest('.hpact').querySelector('[data-delta],[data-mdelta]'), bv=parseInt(bx&&bx.value,10), half=!!t.dataset.half;
    if(isNaN(bv)||bv<=0){toast('Enter an amount first');return;}
    var nv2=half?Math.floor(bv/2):Math.min(9999,bv*2); if(nv2<1){toast('Half of '+bv+' rounds down to 0');return;}
    bx.value=nv2; a=a.replace(/(Half|Dbl)$/,'');
    if(bx.dataset.delta!==undefined)ui.delta[id]=String(nv2); else {var bm=t.closest('[data-mid]'); if(bm)ui.mdelta[bm.dataset.mid]=String(nv2);}
  }
  switch(a){
    case 'menu':if(ui.menu===id&&(ui.menuKind||'more')==='more'){closeMenu();break;} openPop(id,'more');break;
    case 'regroupOpen':openPop(id,'regroup');break;
    case 'regroup':mergeCards(id,t.dataset.to);break;
    case 'saveOpen':if(ui.menu===id&&ui.menuKind==='save'){closeMenu();break;} openPop(id,'save');break;
    case 'acOpen':if(ui.menu===id&&ui.menuKind==='ac'){closeMenu();break;} openPop(id,'ac'); {var ai2=document.querySelector('[data-acin]'); if(ai2){ai2.focus();ai2.select();}} break;
    case 'acPerm':case 'acTemp':{
      var ip=t.closest('.acpop').querySelector('[data-acin]'), nv=parseInt(ip&&ip.value,10); closeMenu();
      if(c&&!isNaN(nv))mutate(function(){ensureSheet(c); if(a==='acPerm'){c.sheet.ac=String(nv);c.acMod=0;}else{var b0=acBase(c); if(b0!=null)c.acMod=nv-b0;}});
      break;}
    case 'acClear':closeMenu(); if(c)mutate(function(){c.acMod=0;}); break;
    case 'dispCycle':if(c)mutate(function(){var o=['enemy','neutral','ally'], i2=o.indexOf(c.disp||'enemy'); c.disp=o[(i2+1)%3];});break;
    case 'cardToggle':if(c)keepScroll(function(){ui.cardOpen[c.id]=isCollapsed(c); renderList();});break;
    case 'density':ui.density=t.dataset.val; ui.cardOpen={}; lsSet('bm-density',ui.density); render(); break;
    case 'saveMode':ui.saveMode=t.dataset.val;keepScroll(renderList);break;
    case 'saveRoll':{
      if(!c)break; var ab=t.dataset.ab, tries=isGroup(c)?c.members.length:1, outs=[], first=null;
      for(var si=0;si<tries;si++){var rr=rollSave(c,ab,ui.saveMode||'n'); if(!first)first=rr; outs.push(rr.auto?'fail':rr.t);}
      toast(c.name+' \u2014 '+(tries>1?ab.toUpperCase()+' saves: '+outs.join(', ')+' (each '+sgn(first.b)+')':saveLine(first,ab)));break;}
    case 'rollInitForm':{
      var af=document.getElementById('addForm'), am=num(af.elements.initmod.value)||0, ar=d20();
      af.elements.init.value=ar+am; toast('Rolled d20 '+ar+(am?' '+sgn(am):'')+' = '+(ar+am));break;}
    case 'next':nextTurn();break;
    case 'prev':prevTurn();break;
    case 'undo':undo();break;
    case 'endCombat':askConfirm({kind:'end'});break;
    case 'targetOpen':ui.aoeOpen=true;renderAoe();focusEl('#aoepanel [data-aoein="amt"]');break;
    case 'timerPause':{state.timer.pbc=false; timerRun(!state.timer.running); persist();render();break;}
    case 'timerReset':timerReset();persist();render();break;
    case 'buildOpenNpc':ui.build=ui.build||bdNew(); ui.build.dest='npc'; ui.build.open=true; if(!ui.build.name||ui.build.auto){ui.build.name=genName(ui.build.species);ui.build.auto=true;} closeNav(); renderBuild(); break;
    case 'libOpen':closeNav(); ui.add=null; ui.addCtx=null; renderAdd(); ui.lib=ui.lib||libNew();
      {var ps0=t.dataset.preset, LB=ui.lib; if(ps0==='npc'){libSetTab(LB,'book');LB.src='';LB.type='Humanoid';LB.disp='enemy';} else if(ps0==='monster'){libSetTab(LB,'book');LB.src='';LB.type='';LB.disp='enemy';} else if(ps0==='custom'){libSetTab(LB,'book');LB.type='';LB.src='';LB.form={mode:'new',draft:{name:'',type:'',cr:'',ac:'',hp:'',speed:'',dex:'',fav:true}};} else if(ps0==='book'){libSetTab(LB,'book');}} ui.lib.open=true; renderLib(); focusEl('[data-mmsearch]'); break;
    case 'encSave':if(!state.combatants.length)break; if(state.encName)encSaveNow(state.encName,state.encCamp); else openEnc('save'); break;
    case 'encSaveAs':if(!state.combatants.length)break; openEnc('save'); break;
    case 'encOpen':openEnc('open'); break;
    case 'addOpen':closeNav(); addGo(t.dataset.type,'manual'); break;
    case 'monPreview':state.settings.monPreview=!state.settings.monPreview; persist(); render(); break;
    case 'rfiToggle':mutate(function(){state.rfi=!state.started&&!state.rfi;});break;
    case 'monPreviewOff':state.settings.monPreview=false; persist(); render(); break;
    case 'navMobile':ui.navMob=!ui.navMob; if(!ui.navMob)ui.navOpen=null; renderNav(); break;
    case 'navMobileClose':closeNav(); break;
    case 'navItem':{var nk=t.dataset.nav; ui.navOpen=(ui.navOpen===nk)?null:nk; renderNav(); break;}
    case 'navCollapse':ui.navMin=!ui.navMin; ui.navOpen=null; lsSet('bm-nav',ui.navMin?'min':'full'); renderNav(); break;
    case 'combatToggle':if(!state.started){if(state.combatants.length)nextTurn();} else mutate(function(){
      state.paused=!state.paused; var tt=state.timer;
      if(state.paused){if(tt.running){timerRun(false);tt.pbc=true;}}
      else if(tt.pbc){tt.pbc=false;timerRun(true);}
      notes.push(state.paused?'Combat paused':'Combat resumed');
    }); break;
    case 'timerOpen':ui.timerOpen=!ui.timerOpen; renderTop(); break;
    case 'clearAll':if(state.combatants.length)askConfirm({kind:'clear'}); break;
    case 'fullscreen':{
      var fe=document.documentElement;
      if(document.fullscreenElement){if(document.exitFullscreen)document.exitFullscreen();break;}
      var fq=fe.requestFullscreen?fe.requestFullscreen():null, fmsg='Full screen is not available in this view. Press F11 (Ctrl+Cmd+F on a Mac) instead.';
      if(fq&&fq.catch)fq.catch(function(){toast(fmsg);}); else if(!fq)toast(fmsg);
      break;}
    case 'openMonitor':openMonitor();break;
    case 'goFull':{var de=document.documentElement, fp=de.requestFullscreen?de.requestFullscreen():null; if(fp&&fp.catch)fp.catch(function(){toast('Press F11 (Ctrl+Cmd+F on a Mac) for full screen');}); Sfx.unlock(); render();break;}
    case 'settingsOpen':ui.settingsOpen=true;renderDrawer();var dc=document.getElementById('drawerClose');if(dc)dc.focus();break;
    case 'settingsClose':ui.settingsOpen=false;renderDrawer();break;
    case 'setCat':ui.setCat=t.dataset.cat; renderDrawer(); {var dmn=document.getElementById('dmain'); if(dmn)dmn.scrollTop=0;} return;
    case 'cloudNow':Cloud.syncNow();break;
    case 'cloudUse':Cloud.useSaved();break;
    case 'cloudKeep':Cloud.keepThis();break;
    case 'viewMenu':ui.viewMenu=!ui.viewMenu;render();break;
    case 'viewSet':setView(t.dataset.val);break;
    case 'sfxUnlock':Sfx.unlock();render();break;
    case 'sfxTest':Sfx.play(t.dataset.s);break;
    case 'qrOpen':ui.qrOpen=true;renderQr();{var qc=document.getElementById('qrClose');if(qc)qc.focus();}break;
    case 'qrClose':ui.qrOpen=false;renderQr();break;
    case 'seg':{
      var grp=t.dataset.grp, key=t.dataset.key, val=t.dataset.val;
      if(grp==='tset'){state.timer.mode=val; if(state.started)timerReset(); persist(); render(); break;}
      if(grp==='tscope'){state.timer.scope=val; if(state.started)timerReset(); persist(); render(); break;}
      if(grp==='view'){setView(val); break;}
      state.settings[key]=val; persist(); render(); break;}
    case 'swset':{var k3=t.dataset.key; if(k3==='imgShow')state.settings.imgShow=state.settings.imgShow==='off'?'on':'off'; else state.settings[k3]=!state.settings[k3]; persist(); render(); break;}
    case 'swtimer':state.timer.showPlayers=!state.timer.showPlayers; persist(); render(); break;
    case 'disp':if(c)mutate(function(){c.disp=t.dataset.val;});break;
    case 'hpMode':if(c)mutate(function(){c.hpMode=t.dataset.val;c.hpShow=undefined;});break;
    case 'imgToggle':{var shEl=t.closest('.sheet'); var ob=shEl?sheetTarget(shEl.dataset.skind,shEl.dataset.sid):null; if(ob){var sx=ensureSheet(ob); sx.imgShow=(sx.imgShow===false); syncSheet(shEl.dataset.skind,ob); persist(); render();} break;}
    case 'imgClear':{var shEl2=t.closest('.sheet'); var ob2=shEl2?sheetTarget(shEl2.dataset.skind,shEl2.dataset.sid):null; if(ob2){ensureSheet(ob2).img=''; syncSheet(shEl2.dataset.skind,ob2); persist(); render();} break;}
    case 'sheetToggle':{
      var kind=id?'c':(lid?'l':'p'), tid=id||lid||pid;
      ui.sheet=sheetOpen(kind,tid)?null:{kind:kind,id:tid}; render();break;}
    case 'clone':if(c){ui.clone={id:id,mode:'same',n:1,init:'',group:true};renderClone();focusEl('.clopt');}break;
    case 'saveLib':if(c){toast(cardToLibrary(c));render();}break;
    case 'libAdd':{
      var e2=libById(lid), init=num(ui.libInit[lid]);
      if(!e2)break;
      var rolledL=[], ivL=function(){if(init!=null)return init; var ro=rollInit(e2.sheet); rolledL.push(ro.t); return ro.t;};
      var q=Math.max(1,Math.min(20,parseInt(ui.libQty[lid],10)||1)), asGroup=!!ui.libGroup&&q>1;
      var names=asGroup?numberedNames(e2.name,1):numberedNames(e2.name,q);
      var lg2=e2.leg?{max:e2.leg.max,left:e2.leg.max,rmax:e2.leg.rmax,rleft:e2.leg.rmax}:null;
      var sh2=hasSheet(e2.sheet)?e2.sheet:null;
      delete ui.libInit[lid];
      mutate(function(){
        if(asGroup)addCombatant({name:names[0],kind:'npc',disp:e2.disp,init:ivL(),members:makeMembers(q,e2.maxHp),sheet:sh2,src:monSrc(e2)});
        else names.forEach(function(nm){addCombatant({name:nm,kind:'npc',disp:e2.disp,init:ivL(),hp:e2.maxHp,maxHp:e2.maxHp,sheet:sh2,leg:lg2,src:monSrc(e2)});});
        if(rolledL.length)notes.push('Rolled initiative (Dex '+sgn(dexMod(e2.sheet))+'): '+rolledL.join(', '));
      });break;}
    case 'libDel':toast('Removed from the library',true);mutate(function(){state.library=state.library.filter(function(x){return x.id!==lid;}); state.stars=state.stars.filter(function(k){return k!=='hb:'+lid;});if(ui.sheet&&ui.sheet.kind==='l'&&ui.sheet.id===lid)ui.sheet=null;});break;
    case 'partyAdd':{
      var p=partyById(pid), v=num(ui.rosterInit[pid]);
      if(v==null){var inp=pEl.querySelector('[data-pi]'); if(inp)inp.focus(); toast('Enter an initiative first');break;}
      delete ui.rosterInit[pid]; mutate(function(){addPartyToFight(p,v);});break;}
    case 'partyAddAll':{
      var ready=state.party.filter(function(p){return num(ui.rosterInit[p.id])!=null&&!state.combatants.some(function(c){return c.partyId===p.id;});});
      if(!ready.length){toast('Type an initiative next to each character first');break;}
      mutate(function(){ready.forEach(function(p){addPartyToFight(p,num(ui.rosterInit[p.id]));delete ui.rosterInit[p.id];});});break;}
    case 'partyHeal':mutate(function(){
      state.party.forEach(function(p){if(p.maxHp!=null)p.hp=p.maxHp;});
      state.combatants.forEach(function(x){if(x.kind==='pc'&&x.maxHp!=null)x.hp=x.maxHp;});});break;
    case 'partyEdit':ui.editParty=pid;renderParty();break;
    case 'partyRelease':{var ck=state.claims[pid]; if(ck){released[ck]=pid; delete state.claims[pid]; persist(); render();} break;}
    case 'partyCancel':ui.editParty=null;if(ui.sheet&&ui.sheet.kind==='p')ui.sheet=null;renderParty();break;
    case 'partySave':{
      var f={}; pEl.querySelectorAll('[data-pf]').forEach(function(i){f[i.dataset.pf]=i.value;});
      var name=(f.name||'').trim(); if(!name){toast('A character needs a name');break;}
      var mh=num(f.maxHp), ch=num(f.hp);
      ui.editParty=null; if(ui.sheet&&ui.sheet.kind==='p')ui.sheet=null;
      mutate(function(){
        var p=partyById(pid);
        if(f.ac!=null||f.speed!=null){var psh=ensureSheet(p); psh.ac=String(f.ac||'').trim(); psh.speed=String(f.speed||'').trim(); syncSheet('p',p);}
        p.name=name;p.player=(f.player||'').trim();p.maxHp=mh;p.hp=ch!=null?ch:(mh!=null&&p.hp==null?mh:p.hp);
        if(p.maxHp!=null&&p.hp!=null&&p.hp>p.maxHp)p.hp=p.maxHp;
        state.combatants.forEach(function(x){if(x.partyId===pid){x.name=p.name;x.player=p.player;x.maxHp=p.maxHp;x.hp=p.hp;}});
      });break;}
    case 'partyDel':ui.editParty=null;ui.sheet=null;toast('Player removed',true);mutate(function(){
      state.party=state.party.filter(function(x){return x.id!==pid;});
      state.combatants.forEach(function(x){if(x.partyId===pid)x.partyId=null;});});break;
    case 'remove':if(c){var rn=c.name; mutate(function(){removeInner(id);}); toast('Removed '+rn,true);}break;
    case 'hide':if(c)mutate(function(){c.hidden=!c.hidden; notes.push(c.name+(c.hidden?' is hidden from players':' is visible to players again'));});break;
    case 'up':case 'down':if(c)mutate(function(){
      var L=state.combatants, i=L.indexOf(c), j=a==='up'?i-1:i+1, o=L[j];
      if(o&&o.init===c.init){var s=c.seq;c.seq=o.seq;o.seq=s;}});break;
    case 'temp':{
      var ta=parseInt(ui.delta[id],10); if(!c||c.hp==null||isNaN(ta)||ta<=0){toast('Enter an amount first');break;}
      delete ui.delta[id];
      mutate(function(){hpTemp(c,ta);});break;}
    case 'dmg':case 'heal':{
      var amt=parseInt(ui.delta[id],10); if(!c||c.hp==null||isNaN(amt)||amt<=0){toast('Enter an amount first');break;}
      delete ui.delta[id];
      mutate(function(){if(a==='dmg')hpDamage(c,amt); else hpHeal(c,amt);});break;}
    case 'rxToggle':if(c)mutate(function(){
      if(c.ready){c.rx=true;c.ready=null;notes.push(c.name+'\u2019s readied action is lost (reaction spent)');}
      else c.rx=!c.rx;});break;
    case 'rdyOpen':ui.ready={id:id,text:''};renderList();break;
    case 'rdyCancel':ui.ready=null;renderList();break;
    case 'rdyHold':{var tx=((ui.ready&&ui.ready.text)||'').trim(); ui.ready=null;
      if(c)mutate(function(){if(c.rx)notes.push('Reaction was already spent'); c.ready={trigger:tx}; notes.push(c.name+' readies an action');});break;}
    case 'rdyFire':if(c)mutate(function(){if(c.rx)notes.push('Reaction was already spent'); c.rx=true; c.ready=null; notes.push(c.name+' fires the readied action');});break;
    case 'rdyDrop':if(c)mutate(function(){c.ready=null;});break;
    case 'legOn':if(c)mutate(function(){c.leg={max:3,left:3,rmax:3,rleft:3};});break;
    case 'resToggle':{var rsh=t.closest('.sheet'); if(rsh){ui.resOpen=(ui.resOpen&&ui.resOpen.id===rsh.dataset.sid&&ui.resOpen.k===t.dataset.k)?null:{id:rsh.dataset.sid,k:t.dataset.k}; render();} break;}
    case 'resDone':ui.resOpen=null; render(); break;
    case 'fmtEdit':{var fsh=t.closest('.sheet'); if(fsh){ui.sheetEdit=fsh.dataset.sid+':'+t.dataset.k; render(); focusEl('.sheet[data-sid="'+fsh.dataset.sid+'"] [data-sf="'+t.dataset.k+'"]');} break;}
    case 'fmtDone':ui.sheetEdit=null; render(); break;
    case 'legOff':if(c)mutate(function(){c.leg=null;});break;
    case 'legMenu':if(ui.menu===id&&ui.menuKind==='leg'){closeMenu();break;} openPop(id,'leg');break;
    case 'legStep':{ if(c&&c.leg){var lk=t.dataset.k, ld=parseInt(t.dataset.d,10)||0;
      mutate(function(){ var L=c.leg;
        if(lk==='max'){var m=Math.max(0,Math.min(9,L.max+ld)); L.left=Math.max(0,Math.min(m,L.left+(m-L.max))); L.max=m;}
        else {var r=Math.max(0,Math.min(9,L.rmax+ld)); L.rleft=Math.max(0,Math.min(r,L.rleft+(r-L.rmax))); L.rmax=r;} }); } break;}
    case 'legUse':{var cost=parseInt(t.dataset.cost,10)||1; if(c&&c.leg&&c.leg.left>=cost)mutate(function(){c.leg.left-=cost;});break;}
    case 'lrUse':if(c&&c.leg&&c.leg.rleft>0)mutate(function(){spendLR(c);});break;
    case 'mDmg':case 'mHeal':case 'mTemp':{
      var mEl=t.closest('[data-mid]'), mm=(c&&mEl)?c.members.find(function(x){return x.id===mEl.dataset.mid;}):null;
      var am=mm?parseInt(ui.mdelta[mm.id],10):NaN;
      if(!mm||mm.hp==null||isNaN(am)||am<=0){toast('Enter an amount first');var mi=mEl&&mEl.querySelector('[data-mdelta]'); if(mi)mi.focus(); break;}
      delete ui.mdelta[mm.id];
      mutate(function(){
        if(a==='mDmg')memDamage(c,mm,am); else if(a==='mHeal')memHeal(mm,am); else memTemp(mm,am);
      });break;}
    case 'gDmg':case 'gHeal':{
      var ga=c?parseInt(ui.delta[id],10):NaN;
      if(!c||isNaN(ga)||ga<=0){toast('Enter an amount first');break;}
      delete ui.delta[id];
      mutate(function(){c.members.forEach(function(m){if(m.hp==null||m.hp<=0)return; if(a==='gDmg')memDamage(c,m,ga); else memHeal(m,ga);});});break;}
    case 'mRx':{var mEl2=t.closest('[data-mid]'), m2=(c&&mEl2)?c.members.find(function(x){return x.id===mEl2.dataset.mid;}):null; if(m2)mutate(function(){m2.rx=!m2.rx;});break;}
    case 'mRemove':{var mEl3=t.closest('[data-mid]');
      if(!ui.rmOK){if(c&&mEl3){var mm0=c.members.find(function(x){return x.id===mEl3.dataset.mid;}); askConfirm({kind:'rmMember',id:c.id,mid:mEl3.dataset.mid,name:c.name+' '+(mm0?mm0.n:'')});} break;}
      ui.rmOK=false; if(c&&mEl3){toast('Removed from the group',true);} if(c&&mEl3)mutate(function(){
      c.members=c.members.filter(function(x){return x.id!==mEl3.dataset.mid;});
      if(!c.members.length)removeInner(c.id); else condTidy(c);});break;}
    case 'mAdd':if(c&&isGroup(c))mutate(function(){
      var nn=c.members.reduce(function(a2,x){return Math.max(a2,x.n);},0)+1, ref=c.members.find(function(x){return x.maxHp!=null;});
      c.members.push({id:uid(),n:nn,hp:ref?ref.maxHp:null,maxHp:ref?ref.maxHp:null,temp:0,rx:false});});break;
    case 'mSplit':{var mEl4=t.closest('[data-mid]'), m4=(c&&mEl4)?c.members.find(function(x){return x.id===mEl4.dataset.mid;}):null;
      if(m4&&c.members.length>1)mutate(function(){
        c.members=c.members.filter(function(x){return x.id!==m4.id;});
        var nc=addCombatant({name:c.name+' '+m4.n,kind:'npc',disp:c.disp,init:c.init,hp:m4.hp,maxHp:m4.maxHp,hidden:c.hidden,sheet:c.sheet});
        nc.temp=m4.temp||0; nc.rx=!!m4.rx;
        nc.conditions=c.conditions.filter(function(cd){return condCovers(cd,m4.id);}).map(function(cd){var k=clone(cd);k.id=uid();delete k.mem;return k;});
        condTidy(c);
        notes.push(nc.name+' split off to its own card');});
      break;}
    case 'dsHide':if(c&&c.death)mutate(function(){c.death.hide=!c.death.hide;});break;
    case 'dsOk':case 'dsFail':case 'dsNat20':case 'dsNat1':case 'dsReset':if(c)mutate(function(){
      deathApply(c,{dsOk:'success',dsFail:'fail',dsNat20:'nat20',dsNat1:'nat1',dsReset:'reset'}[a]);});break;
    case 'condOpen':ui.cond={id:id,name:'',level:1,custom:'',dur:'manual',n:1,owner:id};renderList();break;
    case 'condClose':ui.cond=null;renderList();break;
    case 'condWho':if(ui.cond&&c&&isGroup(c)){var wv=t.dataset.v, f3=ui.cond;
      if(wv==='all')f3.mem=null;
      else{var cur3=f3.mem?f3.mem.slice():[], i3=cur3.indexOf(wv); if(i3>=0)cur3.splice(i3,1); else cur3.push(wv); f3.mem=(cur3.length&&cur3.length<c.members.length)?cur3:null;}
      renderList();} break;
    case 'condMemRemove':{var mEl5=t.closest('[data-mid]'), cid5=t.dataset.cid; if(c&&mEl5&&isGroup(c))mutate(function(){
      var cd5=c.conditions.find(function(x){return x.id===cid5;}); if(!cd5)return;
      cd5.mem=(cd5.mem||c.members.map(function(m){return m.id;})).filter(function(id){return id!==mEl5.dataset.mid;});
      condTidy(c);});
      break;}
    case 'condPick':ui.cond.name=t.dataset.name;
      if(SPELL_ROUNDS[ui.cond.name]&&ui.cond.dur==='manual'){ui.cond.dur='rounds';ui.cond.n=SPELL_ROUNDS[ui.cond.name];}
      renderList();break;
    case 'condInfo':ui.cinfo[t.dataset.cid]=!ui.cinfo[t.dataset.cid];renderList();break;
    case 'acShow':if(c)mutate(function(){c.acShow=!acShown(c);});break;
    case 'condApply':{var f2=ui.cond; ui.cond=null; addCondition(id,f2);break;}
    case 'condRemove':if(c)mutate(function(){c.conditions=c.conditions.filter(function(x){if(x.id===t.dataset.cid){endedAdd(c,x);return false;}return true;});});break;
    case 'endedClear':if(c){c.ended=(c.ended||[]).filter(function(e){return e.id!==t.dataset.eid;});persist();render();}break;
  }
});

document.addEventListener('input',function(e){
  var t=e.target;
  if(t.dataset.pi!==undefined){var pe=t.closest('[data-pid]'); ui.rosterInit[pe.dataset.pid]=t.value;}
  else if(t.dataset.li!==undefined){ui.libInit[t.closest('[data-lid]').dataset.lid]=t.value;}
  else if(t.dataset.lq!==undefined){ui.libQty[t.closest('[data-lid]').dataset.lid]=t.value;}
  else if(t.dataset.delta!==undefined){var r=t.closest('[data-id]'); ui.delta[r.dataset.id]=t.value;}
  else if(t.dataset.mdelta!==undefined){ui.mdelta[t.closest('[data-mid]').dataset.mid]=t.value;}
  else if(t.dataset.rf!==undefined){if(ui.ready)ui.ready.text=t.value;}
  else if(t.dataset.cf){ui.cond[t.dataset.cf]=t.value; if(t.dataset.cf==='dur')renderList();}
  else if(t.dataset.sab&&/\.score$/.test(t.dataset.sab)){
    var key=t.dataset.sab.split('.')[0], m=t.closest('.sheet').querySelector('[data-mod="'+key+'"]'); if(m)m.textContent=modText(t.value);
  }
});

document.addEventListener('change',function(e){
  var t=e.target;
  if(t.dataset.tset){
    var k=t.dataset.tset, tm=state.timer;
    if(k==='secs'){var v0=num(t.value); if(v0!=null&&v0>=1)tm.secs=Math.round(v0); persist(); tick();}
    if(k==='cmins'){var v1=num(t.value); if(v1!=null&&v1>=1)tm.cmins=Math.round(v1); persist(); tick();}
    return;
  }
  var sh=t.closest('.sheet');
  if(sh&&t.dataset.rother!==undefined){
    var rk=sh.dataset.skind, ro=sheetTarget(rk,sh.dataset.sid); if(!ro)return;
    var rs=ensureSheet(ro), rp=resParse(rs[t.dataset.rother],t.dataset.rother); rp.other=t.value.trim();
    rs[t.dataset.rother]=resCompose(rp); syncSheet(rk,ro); persist(); refreshSummary(rk,ro); return;
  }
  if(sh&&(t.dataset.sf||t.dataset.sab||t.dataset.lf)){
    var kind=sh.dataset.skind, obj=sheetTarget(kind,sh.dataset.sid); if(!obj)return;
    var s=ensureSheet(obj);
    if(t.dataset.sf)s[t.dataset.sf]=t.value;
    else if(t.dataset.sab){var pr=t.dataset.sab.split('.'); s.ab[pr[0]][pr[1]]=t.value;}
    else if(t.dataset.lf==='name'){var nm=t.value.trim(); if(nm)obj.name=nm;}
    else if(t.dataset.lf==='maxHp'){var v1=num(t.value); obj.maxHp=(v1!=null&&v1>=1)?Math.round(v1):null;}
    syncSheet(kind,obj); persist(); refreshSummary(kind,obj); if(t.dataset.sf==='ac')render(); return;
  }
  if(t.dataset.qrlink!==undefined){state.settings.link=t.value.trim(); persist(); renderQr(); return;}
  if(t.dataset.img!==undefined){
    var shI=t.closest('.sheet'), obI=shI?sheetTarget(shI.dataset.skind,shI.dataset.sid):null, file=t.files&&t.files[0];
    if(obI&&file){
      readImage(file,function(url){
        var iid=uid(); state.images[iid]=url; var sI=ensureSheet(obI); sI.img=iid; sI.imgShow=true;
        syncSheet(shI.dataset.skind,obI); persist(); render(); toast('Image added');
      });
    }
    return;
  }
  if(t.dataset.libgroup!==undefined){ui.libGroup=t.checked;return;}
  if(t.dataset.mf){
    var re0=t.closest('[data-id]'), cc=re0?byId(re0.dataset.id):null, me0=t.closest('[data-mid]');
    var mm2=(cc&&me0)?cc.members.find(function(x){return x.id===me0.dataset.mid;}):null; if(!mm2)return;
    var mf=t.dataset.mf, vv=num(t.value);
    mutate(function(){
      if(mf==='hp'){if(vv!=null){vv=Math.max(0,Math.round(vv)); if(mm2.maxHp!=null)vv=Math.min(mm2.maxHp,vv); mm2.hp=vv;}}
      else if(mf==='maxHp'){if(vv!=null&&vv>=1){mm2.maxHp=Math.round(vv); if(mm2.hp!=null&&mm2.hp>mm2.maxHp)mm2.hp=mm2.maxHp;}}
      else if(mf==='temp'){mm2.temp=(vv!=null&&vv>0)?Math.round(vv):0;}
      else if(mf==='startHp'){if(vv!=null&&vv>=1){mm2.hp=mm2.maxHp=Math.round(vv);}}
    });
    return;
  }
  if(t.dataset.f){
    var r=t.closest('[data-id]'), c=byId(r.dataset.id), f=t.dataset.f, v=num(t.value);
    if(!c)return;
    mutate(function(){
      if(f==='init'){if(v!=null)c.init=v;}
      else if(f==='name'){var nm2=t.value.trim(); if(nm2)c.name=nm2;}
      else if(f==='hp'){if(v!=null){var rv=Math.round(v); if(rv<0&&isSide(c)&&c.maxHp!=null&&-rv>=c.maxHp){c.hp=0;goDown(c);c.death.f=3;c.death.dead=true;notes.push(c.name+' is killed outright by massive damage');} else{rv=Math.max(0,rv); if(c.maxHp!=null)rv=Math.min(c.maxHp,rv); c.hp=rv;}}}
      else if(f==='maxHp'){if(v!=null&&v>=1){c.maxHp=Math.round(v); if(c.hp!=null&&c.hp>c.maxHp)c.hp=c.maxHp;}}
      else if(f==='startHp'){if(v!=null&&v>=1){c.hp=c.maxHp=Math.round(v);}}
      else if(f==='temp'){c.temp=(v!=null&&v>0)?Math.round(v):0;}
      else if(f==='gstart'&&isGroup(c)){if(v!=null&&v>=1)c.members.forEach(function(m){if(m.hp==null){m.hp=m.maxHp=Math.round(v);}});}
    });
  }
});

document.addEventListener('submit',function(e){
  e.preventDefault();
  var f=e.target, d=new FormData(f);
  if(f.id==='pcForm'){
    var name=String(d.get('name')||'').trim(); if(!name)return;
    var mh=num(d.get('maxHp')), pac=String(d.get('ac')||'').trim(), psp=String(d.get('speed')||'').trim();
    mutate(function(){
      var np={id:uid(),name:name,player:String(d.get('player')||'').trim(),maxHp:mh,hp:mh};
      if(pac||psp){np.sheet=blankSheet(); np.sheet.ac=pac; np.sheet.speed=psp;}
      state.party.push(np);
    });
    f.reset(); f.elements.name.focus(); if(narrowNav())closeNav();
  } else if(f.id==='addForm'){
    var nm=String(d.get('name')||'').trim(), init=num(d.get('init')); if(!nm)return;
    var auto=init==null, imod=num(d.get('initmod'))||0, rolled=[];
    var iv=function(){if(!auto)return init; var v=d20()+imod; rolled.push(v); return v;};
    var hp=num(d.get('hp')), qty=Math.max(1,Math.min(20,parseInt(d.get('qty'),10)||1)), hid=!!d.get('hidden');
    var disp=String(d.get('disp')||'enemy'), asGroup=!!d.get('group')&&qty>1, nac=String(d.get('ac')||'').trim();
    var nsh=null; if(nac){nsh=blankSheet(); nsh.ac=nac;}
    var names=asGroup?numberedNames(nm,1):numberedNames(nm,qty);
    if(d.get('save'))toast(saveToLibrary(nm,hp,nsh,null,disp,'npc'));
    mutate(function(){
      if(asGroup)addCombatant({name:names[0],kind:'npc',disp:disp,init:iv(),hidden:hid,members:makeMembers(qty,hp),sheet:nsh,src:'npc'});
      else names.forEach(function(n){addCombatant({name:n,kind:'npc',disp:disp,init:iv(),hp:hp,maxHp:hp,hidden:hid,sheet:nsh,src:'npc'});});
      if(rolled.length)notes.push('Rolled initiative: '+rolled.join(', '));
    });
    f.elements.init.value='';
    f.elements.name.value=''; f.elements.hp.value=''; f.elements.ac.value=''; f.elements.qty.value='1'; f.elements.save.checked=false; f.elements.hidden.checked=false; f.elements.name.focus(); if(narrowNav())closeNav();
  }
});

document.addEventListener('keydown',function(e){
  var t=e.target, tag=t.tagName;
  if(e.key==='Enter'&&t.dataset){
    if(t.dataset.delta!==undefined){e.preventDefault();var hpa=t.closest('.hpact'); var hb=hpa&&hpa.querySelector('[data-act="dmg"],[data-act="gDmg"]'); if(hb)hb.click();return;}
    if(t.dataset.mdelta!==undefined){e.preventDefault();var hpb=t.closest('.hpact'); var hb2=hpb&&hpb.querySelector('[data-act="mDmg"]'); if(hb2)hb2.click();return;}
    if(t.dataset.rf!==undefined){e.preventDefault();t.closest('.rpanel').querySelector('[data-act="rdyHold"]').click();return;}
    if(t.dataset.pi!==undefined){e.preventDefault();t.closest('[data-pid]').querySelector('[data-act="partyAdd"]').click();return;}
    if(t.dataset.li!==undefined||t.dataset.lq!==undefined){e.preventDefault();t.closest('[data-lid]').querySelector('[data-act="libAdd"]').click();return;}
  }
  if(e.key==='Escape'&&closeTopLayer())return;
  if(shellMode!=='dm'||tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA'||t.isContentEditable||document.querySelector('.qrmodal,.confmodal,.encmodal,.clmodal'))return;
  var plain=!e.metaKey&&!e.ctrlKey&&!e.altKey&&!e.shiftKey;
  if(plain&&e.key==='ArrowRight'){e.preventDefault();nextTurn();}
  else if(plain&&e.key==='ArrowLeft'){e.preventDefault();prevTurn();}
  else if((e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&(e.key==='z'||e.key==='Z')){e.preventDefault();undo();}
});

/* Escape closes whatever is on top. The order is the stacking order: the first open layer wins. */
var ESC_LAYERS=[
  [function(){return ui.qrOpen;},function(){ui.qrOpen=false;renderQr();}],
  [function(){return ui.build&&ui.build.open;},function(){ui.build.open=false;renderBuild();}],
  [function(){return ui.resOpen&&document.querySelector('.rpanel2');},function(){ui.resOpen=null;render();}],
  [function(){return ui.editParty;},function(){ui.editParty=null; if(ui.sheet&&ui.sheet.kind==='p')ui.sheet=null; renderParty();}],
  [function(){return ui.add;},function(){ui.add=null;ui.addCtx=null;if(ui.lib)ui.lib.form=null;renderAdd();}],
  [function(){return ui.lib&&ui.lib.open;},function(){if(ui.lib.fopen)ui.lib.fopen=false; else{ui.lib.open=false;ui.addCtx=null;} renderLib();}],
  [function(){return ui.confirm;},function(){ui.confirm=null;renderConfirm();}],
  [function(){return ui.aoeOpen;},function(){ui.aoeOpen=false;renderAoe();}],
  [function(){return ui.clone;},function(){ui.clone=null;renderClone();}],
  [function(){return ui.menu;},closeMenu],
  [function(){return ui.settingsOpen;},function(){ui.settingsOpen=false;renderDrawer();}],
  [function(){return ui.enc;},function(){ui.enc=null;renderEnc();}],
  [function(){return ui.timerOpen;},function(){ui.timerOpen=false;renderTop();}],
  [function(){return ui.navOpen||ui.navMob;},closeNav]
];
function closeTopLayer(){
  for(var i=0;i<ESC_LAYERS.length;i++){if(ESC_LAYERS[i][0]()){ESC_LAYERS[i][1]();return true;}}
  return false;
}

var lastRaw=null;

/* A card's name only becomes editable when you click right on the text, so clicking the card never lands in it. */
var nmCv=null, lastMD=0;
function nmTextW(inp){
  try{nmCv=nmCv||document.createElement('canvas'); var cx=nmCv.getContext('2d'), cs=getComputedStyle(inp);
    cx.font=cs.fontStyle+' '+cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily; return cx.measureText(inp.value||'').width;}catch(e){return 9999;}
}
document.addEventListener('mousedown',function(e){
  lastMD=Date.now();
  var inp=e.target.closest&&e.target.closest('input[data-f=name]'); if(!inp||!inp.readOnly)return;
  var r=inp.getBoundingClientRect(), cs=getComputedStyle(inp), x=e.clientX-r.left-(parseFloat(cs.paddingLeft)||0)-(parseFloat(cs.borderLeftWidth)||0);
  if(x>=-2&&x<=nmTextW(inp)+14)inp.readOnly=false; else e.preventDefault();
},true);
document.addEventListener('focusin',function(e){var i=e.target; if(i&&i.matches&&i.matches('input[data-f=name][readonly]')&&Date.now()-lastMD>500)i.readOnly=false;});
document.addEventListener('focusout',function(e){var i=e.target; if(i&&i.matches&&i.matches('input[data-f=name]'))i.readOnly=true;});

/* The menu opens one item at a time and tidies itself away when the DM goes back to the cards. */
document.addEventListener('pointerdown',function(e){
  if(shellMode!=='dm'||!(ui.navOpen||ui.navMob))return;
  if(e.target.closest&&e.target.closest('#lnav,.qrmodal,.drawer,.scrim'))return;   /* dialogs opened from the menu don't count as going back to the cards */
  closeNav();
},true);
document.addEventListener('pointerdown',function(e){
  if(shellMode!=='dm'||!ui.timerOpen)return;
  if(e.target.closest&&e.target.closest('#tpop,[data-act=timerOpen]'))return;
  ui.timerOpen=false; var tp0=document.getElementById('tpop'); if(tp0)tp0.hidden=true; var tb0=document.querySelector('.timerbtn'); if(tb0)tb0.setAttribute('aria-expanded','false');
},true);
window.addEventListener('resize',function(){if(shellMode!=='dm')return; if(ui.navOpen&&narrowNav())closeNav(); else if(ui.navMob&&!narrowNav())ui.navMob=false; renderNav();});
document.addEventListener('focusin',function(e){
  if(shellMode!=='dm'||!ui.navOpen)return;
  if(e.target.closest&&(e.target.closest('#lnav')||e.target.closest('.qrmodal,.drawer,.scrim')))return;
  closeNav();
});
document.addEventListener('click',function(e){
  if(shellMode!=='dm')return;
  var ad=e.target.closest&&e.target.closest('#lnav [data-act=partyAdd],#lnav [data-act=partyAddAll],#lnav [data-act=libAdd],#lnav [data-act=combatToggle]');
  if(ad&&narrowNav()&&ui.navOpen){setTimeout(closeNav,0);}
  var d=e.target.closest&&e.target.closest('#lnav .nitem:not([data-nav])');
  if(d&&(ui.navOpen||ui.navMob)){ui.navOpen=null;ui.navMob=false;renderNav();}
  /* Focus view: click a collapsed card to open it */
  if(ui.density!=='focus')return;
  var r=e.target.closest&&e.target.closest('.row.collapsed'); if(!r)return;
  if(e.target.closest('button,select,textarea,a,label,[role=button],[role=menuitem],.rowmenu,input:not([data-f=name][readonly])'))return;
  var c=byId(r.dataset.id); if(!c)return;
  keepScroll(function(){ui.cardOpen[c.id]=true; renderList();});
});

function syncFromStorage(){
  if(!isPlayerWindow()&&shellMode!=='dm')return;
  var raw=lsGet(KEY);
  if(raw!=null&&raw===lastRaw)return;
  lastRaw=raw; state=load(); render();
}

window.addEventListener('storage',function(e){if(e.key===KEY)syncFromStorage();});

if(bc)bc.onmessage=syncFromStorage;
window.__bmPush=function(raw){memStore=raw; state=load(); render();};   /* the DM window pushes changes to a monitor window */

document.addEventListener('keydown',function(e){
  var t=e.target; if(!t||!t.getAttribute)return;
  if((e.key==='Enter'||e.key===' ')&&t.getAttribute('role')==='button'&&t.dataset.act){e.preventDefault();t.click();}
  else if(e.key==='Enter'&&t.dataset&&t.dataset.acin!==undefined){e.preventDefault();var pb=t.closest('.acpop').querySelector('[data-act=acPerm]'); if(pb)pb.click();}
});
document.addEventListener('fullscreenchange',function(){if(shellMode==='players')render(); else if(shellMode==='dm')renderTop();});
window.addEventListener('hashchange',function(){ui.viewOverride='';shellMode=null;state=load();render();});

