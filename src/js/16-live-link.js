/* ================================================================
   16. Live link
   Carries the sanitized table snapshot to phones and their requests back.
   ================================================================ */

var Link=(function(){
  var tabId=Math.random().toString(36).slice(2,10), bc=null, room=null;
  var roomPeers=[], localPeers={}, snapCb=null, peersCb=null, connCb=null, seq=0, asm={}, lastApplied=0, lastStr=null, myPres={}, started=false, hello=false;
  try{bc=new BroadcastChannel(LIVE_NS?LIVE_NS+'live':'bm-live');}catch(e){}
  function ascii(str){return str.replace(/[\u007f-\uffff]/g,function(c){return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);});}
  function keyOf(p){return p.by||('p:'+p.peer);}
  function allPeers(){
    var out=[], now=Date.now(), seenDv={};
    roomPeers.forEach(function(p){if(p.presence&&p.presence.ph===1&&!p.sameTab){var dv=p.presence.dv||('r:'+p.peer); if(seenDv[dv])return; seenDv[dv]=1; out.push({key:keyOf(p),id:'r:'+p.peer,presence:p.presence});}});
    Object.keys(localPeers).forEach(function(t){var lp=localPeers[t]; if(now-lp.ts>14000){delete localPeers[t];return;} var dv=lp.presence.dv||('l:'+t); if(seenDv[dv])return; seenDv[dv]=1; out.push({key:'l:'+t,id:'l:'+t,presence:lp.presence});});
    return out;
  }
  function firePeers(){if(peersCb)peersCb(allPeers());}
  function applyStr(str){var o; try{o=JSON.parse(str);}catch(e){return;} if(snapCb)snapCb(o);}
  function readLocal(){var raw=lsGet(SNAP_KEY); if(raw)applyStr(raw);}
  function emitRoom(str){
    if(!room)return;
    var t=ascii(str), q=Date.now()*1000+(seq++%1000), size=3000, n=Math.max(1,Math.ceil(t.length/size));
    for(var i=0;i<n;i++)room.emit('snap',{q:q,i:i,n:n,d:t.substr(i*size,size)}).catch(function(){});
  }
  function onRoomMsg(m){
    var d=m&&m.data; if(!d||typeof d.q!=='number')return;
    var a=asm[d.q]||(asm[d.q]={n:d.n,parts:[],got:0});
    if(a.parts[d.i]==null){a.parts[d.i]=d.d;a.got++;}
    if(a.got===a.n){
      if(d.q>lastApplied){lastApplied=d.q;applyStr(a.parts.join(''));}
      Object.keys(asm).forEach(function(k){if(Number(k)<=d.q)delete asm[k];});
    }
  }
  function postPres(){if(bc)try{bc.postMessage({k:'pres',tab:tabId,presence:myPres});}catch(e){}}
  return {
    start:function(){
      if(started)return; started=true;
      if(bc){
        bc.onmessage=function(e){
          var m=e.data||{};
          if(m.k==='snap')readLocal();
          else if(m.k==='pres'){var isNew=!localPeers[m.tab]; localPeers[m.tab]={presence:m.presence||{},ts:Date.now()}; firePeers(); if(isNew&&lastStr)try{localStorage.setItem(SNAP_KEY,lastStr);bc.postMessage({k:'snap'});}catch(x){}}
          else if(m.k==='leave'){delete localPeers[m.tab];firePeers();}
        };
        window.addEventListener('beforeunload',function(){try{bc.postMessage({k:'leave',tab:tabId});}catch(e){}});
        setInterval(function(){if(myPres.ph===1)postPres();},5000);
        setInterval(function(){var n=0;Object.keys(localPeers).forEach(function(t){if(Date.now()-localPeers[t].ts>14000){delete localPeers[t];n++;}}); if(n)firePeers();},4000);
      }
      if(window.claude&&window.claude.use){
        window.claude.use('room').then(function(r){
          if(!r)return; room=r;
          r.on('snap',onRoomMsg,function(){});
          r.onPeers(function(ch){roomPeers=ch.peers.slice(); firePeers(); if(ch.joined&&ch.joined.length&&lastStr)emitRoom(lastStr);},function(){});
          r.onConnection(function(ok){if(connCb)connCb(ok);},function(){});
          if(Object.keys(myPres).length)r.presence(myPres).catch(function(){});
        }).catch(function(){});
      }
    },
    publish:function(obj){
      lastStr=JSON.stringify(obj);
      try{localStorage.setItem(SNAP_KEY,lastStr);if(bc)bc.postMessage({k:'snap'});}catch(e){}
      emitRoom(lastStr);
    },
    onSnap:function(f){snapCb=f;readLocal();},
    onPeers:function(f){peersCb=f;},
    onConn:function(f){connCb=f;},
    setPresence:function(p){
      if(p.ph===1)p.dv=tabId;
      Object.keys(p).forEach(function(k){if(p[k]===null)delete myPres[k]; else myPres[k]=p[k];});
      if(room)room.presence(p).catch(function(){});
      if(myPres.ph===1)postPres();
    },
    myKeys:function(){
      var ks=['l:'+tabId];
      if(room){var me=room.peers().filter(function(p){return p.sameTab;})[0]; if(me)ks.push(keyOf(me));}
      return ks;
    },
    phoneCount:function(){return allPeers().length;},
    liveKeys:function(){return allPeers().map(function(p){return p.key;});},
    hasRoom:function(){return !!room;}
  };
})();

var liveTimer=null;

function liveSoon(){if(testMode||shellMode!=='dm')return; clearTimeout(liveTimer); liveTimer=setTimeout(liveNow,140);}

function liveNow(){if(shellMode!=='dm')return; Link.publish(buildSnapshot());}

setInterval(function(){if(shellMode==='dm')liveNow();},15000);

function pubHp(c){
  if(!tracks(c)||c.hp==null||!c.maxHp)return null;
  var mode=hpMode(c);
  if(mode==='hidden'&&c.kind!=='pc')return null;
  var o={m:mode,k:hpClass(c),w:hpStatus(c),p:hpPct(c)};
  if(c.kind==='pc'||mode==='exact'){o.h=c.hp;o.x=c.maxHp;o.t=c.temp||0;}
  return o;
}

function pubC(c){
  var side=c.kind==='pc'?'p':(c.disp==='ally'?'a':(c.disp==='neutral'?'n':'e')), grp=isGroup(c);
  var o={i:c.id,n:c.name,s:side};
  if(c.kind==='pc'){o.pl=c.player||'';o.pid=c.partyId||null;}
  if(!grp){var h=pubHp(c); if(h)o.hp=h;}
  else{
    var mode=hpMode(c); o.gm=mode;
    o.mm=c.members.map(function(m){
      var r={n:m.n,d:(tracks(c)&&m.hp!=null&&m.hp<=0)?1:0};
      if(tracks(c)&&m.hp!=null&&m.maxHp&&mode!=='hidden'){r.k=hpClass(m);r.p=hpPct(m);r.w=hpStatus(m); if(mode==='exact')r.h=m.hp;}
      return r;
    });
  }
  if(c.kind==='pc'){o.ab=acBase(c);o.am=c.acMod||0;}
  if(acVisible(c)){o.ac=acTotal(c);o.ax=c.acMod?1:0;}
  o.cd=c.conditions.map(function(cd){return {i:cd.id,n:cd.name,l:cd.level||0,d:durText(cd,c)};});
  var en=liveEnded(c); if(en.length)o.en=en.map(function(e){return e.label;});
  if(!grp&&!c.death&&(c.kind==='pc'||state.settings.rxShow==='all'||(state.settings.rxShow==='pc'&&isSide(c))))o.rx=c.ready?2:(c.rx?1:0);
  if(!grp&&c.kind==='pc'&&c.ready)o.rd=c.ready.trigger||'';
  if(!grp&&isSide(c)&&c.death&&c.hp===0&&tracks(c)){var d=c.death;o.ds={s:d.s,f:d.f,st:d.stable?1:0,dd:d.dead?1:0,hd:d.hide?1:0};}
  if(isDown(c))o.dn=1;
  return o;
}

function buildSnapshot(){
  var s=state.settings, L=state.combatants, vis=L.filter(function(c){return !c.hidden;});
  var nx=null;
  if(state.started){
    var ci=turnIdx();
    for(var k=1;k<=L.length;k++){var c2=L[(ci+k)%L.length]; if(c2.id!==state.turnId&&!c2.hidden){nx=c2.id;break;}}
  }
  var pz=!!(state.started&&state.paused);
  return {v:1,t:Date.now(),ep:state.ep,rv:state.rev||0,sk:s.skin,cb:s.cbMarks===true?1:0,rs:s.rxShow||'pc',r:state.started?state.round:0,tid:(state.started&&!pz)?state.turnId:null,nx:pz?null:nx,np:pz?null:nextPcId(),pz:pz?1:0,rfi:(!state.started&&state.rfi)?1:0,tm:(state.started&&!pz&&state.timer.mode!=='off'&&state.timer.showPlayers)?{m:state.timer.mode,s:state.timer.secs,e:Math.floor(timerMs()),r:state.timer.running?1:0}:null,
    pe:s.phoneEdit===false?0:1,c:pz?[]:vis.map(pubC),
    P:state.party.map(function(p){
      var sh=p.sheet||{}, st={ac:sh.ac||'',sp:sh.speed||'',mh:p.maxHp==null?'':p.maxHp,rs:sh.resist||'',im:sh.immune||'',vu:sh.vuln||'',ab:{}};
      ABIL.forEach(function(a){var x=(sh.ab&&sh.ab[a[0]])||{}; st.ab[a[0]]=[x.score||'',x.save||''];});
      return {id:p.id,n:p.name,pl:p.player||'',st:st};
    }),cl:state.claims||{}};
}

