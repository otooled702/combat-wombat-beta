/* ================================================================
   19. Player screen
   What a player sees on their phone.
   ================================================================ */

var ph={cardMode:'scroll',watching:false,acOpen:false,scrollMe:false,turnScroll:'',monTurn:'',my:{ab:{}},myOpen:false,synced:{},wasOff:true,anim:false,popAnim:false,statsOpen:false,sounds:null,primed:false,skin:null,snap:null,claim:null,claimOk:false,claimAt:0,amt:'',picker:false,menu:false,open:{},alerts:true,wake:false,wakeLock:null,popup:null,seenTurn:false,seenNext:false,msg:'',audio:null,ops:[],rdyOpen:false,rdyText:'',dirty:false,titleT:null,lastSnapAt:0};

ph.watching=lsGet('bm-watch')==='1'; ph.cardMode=lsGet('bm-phone-cm')==='static'?'static':'scroll';
try{ph.claim=localStorage.getItem(CLAIM_KEY)||null; if(localStorage.getItem('bm-alerts')==='off')ph.alerts=false; ph.skin=localStorage.getItem('bm-phone-skin')||null; ph.my=JSON.parse(localStorage.getItem('bm-mysheet')||'{}')||{};}catch(e){ph.my={};}

if(!ph.my.ab)ph.my.ab={};

function phoneModeNow(){return currentView()==='player';}

function phOffline(){return !ph.snap||Date.now()-ph.lastSnapAt>45000;}

function phSetMy(f,v){
  var m=/^ab:(str|dex|con|int|wis|cha):(s|v)$/.exec(f);
  if(m){var a=ph.my.ab[m[1]]||['','']; a[m[2]==='s'?0:1]=v; ph.my.ab[m[1]]=a;} else ph.my[f]=v;
  lsSet('bm-mysheet',JSON.stringify(ph.my));
}

function phMyAsSt(){var st={mh:ph.my.mh||'',ac:ph.my.ac||'',sp:ph.my.sp||'',rs:ph.my.rs||'',im:ph.my.im||'',vu:ph.my.vu||'',ab:{}}; ABIL.forEach(function(a){st.ab[a[0]]=ph.my.ab[a[0]]||['',''];}); return st;}

function phLocalMap(P,onlyBlank){
  var st=P.st||{ab:{}}, map={}, n=0;
  function put(f,l,d){l=String(l==null?'':l); d=String(d==null?'':d); if(l==='')return; if(onlyBlank?d==='':l!==d){map[f]=l;n++;}}
  ['mh','ac','sp','rs','im','vu'].forEach(function(f){put(f,ph.my[f],st[f]);});
  ABIL.forEach(function(a){var l=ph.my.ab[a[0]]||['',''], d=(st.ab&&st.ab[a[0]])||['','']; put('ab:'+a[0]+':s',l[0],d[0]); put('ab:'+a[0]+':v',l[1],d[1]);});
  return n?map:null;
}

function phMine(){var sn=ph.snap; if(!sn||!ph.claim)return null; return sn.c.filter(function(c){return c.pid===ph.claim;})[0]||null;}

function phHit(k){return Link.myKeys().indexOf(k)>=0;}

function phRelease(msg){
  ph.claim=null; ph.claimOk=false; ph.msg=msg||''; ph.popup=null;
  lsDel(CLAIM_KEY);
  Link.setPresence({cl:null});
}

function phCheckClaim(){
  var sn=ph.snap; if(!sn||!ph.claim)return;
  var owner=(sn.cl||{})[ph.claim];
  if(!sn.P.some(function(p){return p.id===ph.claim;})){phRelease('That character is no longer in the party.');return;}
  if(owner&&phHit(owner)){ph.claimOk=true;return;}
  if(ph.claimOk){phRelease('The DM released your character.');return;}
  if(owner&&!phHit(owner)){phRelease('Someone else already has that character.');}
}

function phMakeSound(tones){
  try{
    var sr=16000, total=0; tones.forEach(function(t){total=Math.max(total,t[1]+t[2]);});
    var n=Math.floor(sr*(total+.1)), pcm=new Int16Array(n);
    tones.forEach(function(t){var s0=Math.floor(t[1]*sr), m=Math.floor(t[2]*sr); for(var i=0;i<m&&s0+i<n;i++){var env=Math.min(1,i/(sr*.01))*Math.exp(-3.2*i/m); pcm[s0+i]+=Math.round(Math.sin(2*Math.PI*t[0]*i/sr)*env*14000);}});
    var buf=new ArrayBuffer(44+n*2), v=new DataView(buf);
    function w(o,str){for(var i=0;i<str.length;i++)v.setUint8(o+i,str.charCodeAt(i));}
    w(0,'RIFF'); v.setUint32(4,36+n*2,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
    v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true);
    for(var j=0;j<n;j++)v.setInt16(44+j*2,pcm[j],true);
    var bytes=new Uint8Array(buf), bin=''; for(var k=0;k<bytes.length;k++)bin+=String.fromCharCode(bytes[k]);
    var a=new Audio('data:audio/wav;base64,'+btoa(bin)); a.preload='auto'; return a;
  }catch(e){return null;}
}

function phUnlock(){
  try{
    if(navigator.audioSession)navigator.audioSession.type='playback';
    if(!ph.audio){var AC=window.AudioContext||window.webkitAudioContext; if(AC)ph.audio=new AC();}
    if(ph.audio&&ph.audio.state!=='running')ph.audio.resume();
    if(!ph.sounds)ph.sounds={turn:phMakeSound([[880,0,.22],[1175,.18,.22],[1568,.36,.45]]),next:phMakeSound([[784,0,.2],[988,.16,.32]])};
    if(!ph.primed){
      ph.primed=true;
      ['turn','next'].forEach(function(k){
        var a=ph.sounds[k]; if(!a)return;
        a.muted=true; var pr=a.play();
        if(pr&&pr.then)pr.then(function(){a.pause();a.currentTime=0;a.muted=false;}).catch(function(){a.muted=false;ph.primed=false;});
      });
    }
  }catch(e){}
}

function phBeep(kind){
  function web(){
    if(!ph.audio)return false;
    try{
      if(ph.audio.state!=='running')ph.audio.resume();
      var t0=ph.audio.currentTime, tones=kind==='turn'?[[880,0],[1175,.16],[1568,.32]]:[[784,0],[988,.14]];
      tones.forEach(function(tn){
        var o=ph.audio.createOscillator(), g=ph.audio.createGain();
        o.type='sine'; o.frequency.value=tn[0]; g.gain.setValueAtTime(0,t0+tn[1]); g.gain.linearRampToValueAtTime(.3,t0+tn[1]+.02); g.gain.exponentialRampToValueAtTime(.001,t0+tn[1]+.32);
        o.connect(g); g.connect(ph.audio.destination); o.start(t0+tn[1]); o.stop(t0+tn[1]+.34);
      });
      return true;
    }catch(e){return false;}
  }
  var a=ph.sounds&&ph.sounds[kind];
  if(a){
    try{a.currentTime=0; var pr=a.play(); if(pr&&pr.catch)pr.catch(web); return true;}catch(e){}
  }
  return web();
}

function phFlashTitle(msg){
  clearInterval(ph.titleT); var base='\u2694\ufe0f Combat Wombat', n=0;
  ph.titleT=setInterval(function(){n++; document.title=(n%2?msg:base); if(n>11){clearInterval(ph.titleT);document.title=base;}},700);
}

function phAlert(kind){
  var diag={sound:false,vib:false};
  if(!ph.alerts)return diag;
  /* Browsers refuse to vibrate before the first tap and log an error for trying, so don't ask until then. */
  var ua=navigator.userActivation, tapped=!ua||ua.hasBeenActive;
  try{if(navigator.vibrate&&tapped)diag.vib=!!navigator.vibrate(kind==='turn'?[250,120,250,120,500]:[180]);}catch(e){}
  diag.sound=phBeep(kind);
  phFlashTitle(kind==='turn'?'\ud83d\udd14 Your turn!':'\u23ed Get ready');
  return diag;
}

function phCheckAlerts(){
  var sn=ph.snap, c=phMine();
  if(sn&&c&&sn.rfi){if(!ph.seenRfi){ph.seenRfi=true;ph.popup={t:'rfi'};ph.popAnim=true;phAlert('next');}}
  else{ph.seenRfi=false; if(ph.popup&&ph.popup.t==='rfi')ph.popup=null;}
  if(!sn||!c||!sn.tid){ph.seenTurn=false;ph.seenNext=false;if(ph.popup&&ph.popup.t!=='rfi')ph.popup=null;return;}
  var turn=sn.tid===c.i, next=!turn&&sn.nx===c.i;
  if(turn&&!ph.seenTurn){ph.seenTurn=true;ph.seenNext=false;ph.popup={t:'turn'};ph.popAnim=true;phAlert('turn');}
  else if(!turn){ph.seenTurn=false; if(ph.popup&&ph.popup.t==='turn')ph.popup=null;}
  if(next&&!ph.seenNext){ph.seenNext=true;ph.popup={t:'next'};ph.popAnim=true;phAlert('next');}
  else if(!next){ph.seenNext=false; if(ph.popup&&ph.popup.t==='next')ph.popup=null;}
}

function phWake(on){
  ph.wake=on;
  try{
    if(on&&navigator.wakeLock){navigator.wakeLock.request('screen').then(function(l){ph.wakeLock=l;}).catch(function(){ph.wake=false;});}
    else if(!on&&ph.wakeLock){ph.wakeLock.release();ph.wakeLock=null;}
  }catch(e){ph.wake=false;}
}

document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&ph.wake&&!ph.wakeLock)phWake(true);});

function phOnSnap(sn){
  if(ph.snap&&ph.snap.ep===sn.ep&&(sn.rv||0)<(ph.snap.rv||0))return;
  var hadSnap=!!ph.snap, oldClaim=ph.claim, hadPopup=!!ph.popup, oldPe=ph.snap?ph.snap.pe:null;
  ph.snap=sn; ph.lastSnapAt=Date.now();
  phCheckClaim();
  if(ph.claim&&ph.claimOk&&!ph.synced[ph.claim]&&sn.pe===1){
    var P1=sn.P.filter(function(p){return p.id===ph.claim;})[0]; ph.synced[ph.claim]=true;
    var m1=P1&&phLocalMap(P1,true); if(m1){phOp({t:'statsb',v:m1});toast('Sent your saved stats to the DM');}
  }
  phCheckAlerts();
  if(shellMode==='phone')renderPhone(!hadSnap||ph.claim!==oldClaim||hadPopup!==!!ph.popup||oldPe!==sn.pe);
}

function phOp(op){
  var now=Date.now(); op.id=uid(); op.ts=now;
  ph.ops=ph.ops.filter(function(o){return now-o.ts<30000;}).concat([op]).slice(-6);
  Link.setPresence({ops:ph.ops,cl:ph.claim});
}

function phHpHTML(c){
  if(c.mm){
    var gm=c.gm;
    return '<div class="ph-mems'+(gm==='hidden'?' chips':'')+'">'+c.mm.map(function(m){
      var cls='ph-m'+(m.d?' dead':'');
      if(gm==='hidden'||m.k==null)return '<div class="'+cls+'"><span class="mn">'+m.n+'</span></div>';
      if(gm==='exact')return '<div class="'+cls+'"><span class="mn">'+m.n+'</span><div class="bar '+m.k+'"><i style="width:'+m.p+'%"></i></div><span class="mv">'+(m.h==null?'':m.h)+'</span></div>';
      if(gm==='bar')return '<div class="'+cls+'"><span class="mn">'+m.n+'</span><div class="bar '+m.k+'"><i style="width:'+m.p+'%"></i></div></div>';
      return '<div class="'+cls+'"><span class="mn">'+m.n+'</span><span class="ms '+m.k+'">'+esc(m.w)+'</span></div>';
    }).join('')+'</div>';
  }
  var h=c.hp; if(!h||h.m==='hidden')return '';
  var bar='<div class="bar '+h.k+'"><i style="width:'+h.p+'%"></i></div>', word='<span class="ph-word '+h.k+'">'+esc(h.w)+'</span>';
  if(h.m==='exact'&&h.h!=null)return '<div class="ph-hp"><b>'+h.h+'</b> / '+h.x+(h.t>0?' <em>+'+h.t+'</em>':'')+bar+'</div>';
  if(h.m==='bar')return '<div class="ph-hp">'+bar+word+'</div>';
  return '<div class="ph-hp">'+word+'</div>';
}

function phChips(c,mine){
  var out=(c.en||[]).map(function(l){return '<span class="ph-chip ended"><b>\u2713 <s>'+esc(l)+'</s></b> <small>ended</small></span>';}).join('');
  out+=c.cd.map(function(cd){
    var label=cd.n+(cd.l?' '+cd.l:''), open=!!ph.open[cd.i], info=COND_INFO[cd.n];
    return '<button type="button" class="ph-chip" data-pact="cinfo" data-i="'+esc(cd.i)+'" aria-expanded="'+open+'"><b>'+esc(label)+'</b>'+(cd.d?'<small>'+esc(cd.d)+'</small>':'')+'</button>'+
      (open&&info?'<div class="ph-cdesc"><b>'+esc(label)+'</b> '+esc(info)+(mine?' <button type="button" class="ph-link" data-pact="cdel" data-i="'+esc(cd.i)+'">Remove</button>':'')+'</div>':'');
  }).join('');
  return out?'<div class="ph-chips">'+out+'</div>':'';
}

function phShield(c){
  if(c.ac==null)return '';
  return '<span class="ph-ac'+(c.ax?' modded':'')+'" title="Armor class"><b>'+c.ac+'</b><small>AC</small></span>';
}

function phRow(c,sn){
  var now=c.i===sn.tid, nxt=c.i===sn.np, mine=ph.claim&&c.pid===ph.claim, ptm=(now&&sn.tm)?'<span class="ph-timer" data-ptimer>0:00</span>':'';
  var sideCls=c.s==='e'?'npc':(c.s==='n'?'neutral':'pc');
  var tag=(now?'<span class="ph-tag now">'+(sn.cb?'\u25b6 ':'')+'Now</span>':'')+(nxt?'<span class="ph-tag nxt">'+(sn.cb?'\u25b7 ':'')+(sn.np===sn.nx?'Up next':'Get ready')+'</span>':'')+(mine?'<span class="ph-tag you">You</span>':'')+(sn.cb?'<span class="ph-role">'+({p:'\u25c6 Player',a:'\u25c7 Ally',n:'\u25cb Neutral',e:'\u25b2 Foe'})[c.s]+'</span>':'');
  var sub=c.s==='p'?esc(c.pl||''):(c.s==='a'?'Ally':(c.s==='n'?'Neutral':''));
  var ds=c.ds?'<div class="ph-ds">'+(c.ds.hd?'<span>Down</span>':(c.ds.dd?'<span class="bad">Dead</span>':(c.ds.st?'<span class="ok">Stable</span>':'<span>Death saves</span> <i class="ok">'+pips(c.ds.s,3)+'</i> <i class="bad">'+failPips(c.ds.f)+'</i>')))+'</div>':'';
  var rx=(c.rx!=null)?'<span class="ph-rx r'+c.rx+'">'+(c.rx===2?'Reaction held':c.rx===1?'Reaction used':'Reaction ready')+'</span>':'';
  var rd=(c.rd!=null&&c.s==='p')?'<div class="ph-rdy">Readied'+(c.rd?': '+esc(c.rd):'')+'</div>':'';
  return '<article class="ph-row '+sideCls+(c.s==='a'?' ally':'')+(now?' now':'')+(nxt?' nxt':'')+(mine?' mine':'')+(c.dn?' down':'')+'" data-ph-i="'+esc(c.i)+'">'+
    '<div class="ph-body"><div class="ph-name"><b>'+esc(c.n)+'</b>'+(sub?' <small>'+sub+'</small>':'')+' '+tag+ptm+'</div>'+phHpHTML(c)+ds+rd+phChips(c,false)+(rx?'<div class="ph-line">'+rx+'</div>':'')+'</div>'+
    '<div class="ph-aside">'+phShield(c)+'</div></article>';
}

function phMeHTML(c,sn){
  var can=sn.pe===1&&!phOffline(), dis=can?'':' disabled', now=c.i===sn.tid, h=c.hp;
  var acv=(c.ab!=null)?(c.ab+(c.am||0)):'\u2014', ptag=now?'<span class="ph-tag now big">Your turn</span>':(sn.np===c.i?'<span class="ph-tag nxt big">'+(sn.np===sn.nx?'Up next':'Get ready')+'</span>':'');
  if(now&&sn.tm)ptag+=' <span class="ph-timer" data-ptimer>0:00</span>';
  var head='<div class="ph-mehead"><div><h2>'+esc(c.n)+'</h2><small>'+esc(c.pl||'')+'</small>'+(ptag?'<div class="ph-mehtag">'+ptag+'</div>':'')+'</div>'+
    '<button type="button" class="ph-acbtn" data-pact="acopen" aria-label="Armor class '+(c.ab!=null?acv:'not set')+'. Tap to change" title="Armor class: tap to change"><span class="ph-ac big'+(c.am?' modded':'')+'"><b>'+acv+'</b><small>AC</small></span></button></div>';
  var hp='';
  if(h&&h.h!=null){
    hp='<div class="ph-hpbig"><div class="num"><b>'+h.h+'</b><span>/ '+h.x+' HP</span>'+(h.t>0?'<em>+'+h.t+' temp</em>':'')+'</div><div class="bar '+h.k+' lg"><i style="width:'+h.p+'%"></i></div></div>'+
      '<div class="ph-amtrow"><input type="number" inputmode="numeric" min="0" placeholder="Amount" value="'+esc(ph.amt)+'" data-pamt aria-label="Amount"></div>'+
      '<div class="ph-btns3"><button class="ph-btn dmg" data-pact="hp" data-k="dmg"'+dis+'>Take damage</button><button type="button" class="ph-btn dmg half" data-pact="hphalf" title="Half damage, rounded down" aria-label="Half damage"'+dis+'>\u00bd</button><button class="ph-btn heal" data-pact="hp" data-k="heal"'+dis+'>Heal</button><button class="ph-btn" data-pact="hp" data-k="temp"'+dis+'>Temp HP</button></div>';
  } else hp='<p class="ph-note">Hit points aren\u2019t being tracked for you.</p>';
  var ac='<div class="ph-acrow">'+(c.ab!=null?'<span class="ph-ac big'+(c.am?' modded':'')+'"><b>'+(c.ab+(c.am||0))+'</b><small>AC</small></span>':'<span class="ph-note">No AC set</span>')+
    '<div class="ph-step"><button class="ph-btn sm" data-pact="ac" data-d="-1"'+dis+'>\u2212</button><span>'+(c.am?(c.am>0?'+'+c.am:c.am):'0')+' temp</span><button class="ph-btn sm" data-pact="ac" data-d="1"'+dis+'>+</button></div></div>';
  var rx='';
  if(c.rx!=null&&!c.ds){
    var rform=ph.rdyOpen?'<div class="ph-rdyform"><input type="text" maxlength="80" placeholder="Trigger, e.g. when the ogre moves" value="'+esc(ph.rdyText)+'" data-prdy><button class="ph-btn" data-pact="rdyhold">Hold</button></div>':'';
    if(c.rd!=null){
      rx='<div class="ph-rxrow"><span class="ph-rdy">Readied'+(c.rd?': '+esc(c.rd):'')+'</span><button class="ph-btn" data-pact="rdyfire"'+dis+'>Fire it</button><button class="ph-btn ghost" data-pact="rdydrop"'+dis+'>Drop</button></div>';
    } else if(c.rx===0){
      rx='<div class="ph-rxrow"><button class="ph-btn use" data-pact="rx"'+dis+'>Use reaction</button><button class="ph-btn ghost" data-pact="rdyopen"'+dis+'>Ready action</button></div>'+rform;
    } else {
      rx='<div class="ph-rxrow"><span class="ph-rxused">Reaction used</span><button class="ph-btn sm ghost" data-pact="rxundo"'+dis+'>Undo</button><span class="ph-note">Comes back on your turn.</span></div>';
    }
  }
  var ds='';
  if(c.ds){
    var d=c.ds, off=(d.st||d.dd)?' disabled':'';
    ds='<div class="ph-dsbox'+(now&&!d.st&&!d.dd?' big':'')+'"><div class="ph-dshead">'+(d.dd?'<b class="bad">Dead</b>':d.st?'<b class="ok">Stable</b>':'<b>'+(now?'Roll your death saving throw':'Death saves')+'</b>')+'</div>'+
      '<div class="ph-dspips"><i class="ok">'+pips(d.s,3)+'</i> <i class="bad">'+failPips(d.f)+'</i></div>'+
      '<div class="ph-btns4"><button class="ph-btn" data-pact="ds" data-k="success"'+dis+off+'>Success</button><button class="ph-btn" data-pact="ds" data-k="fail"'+dis+off+'>Failure</button><button class="ph-btn" data-pact="ds" data-k="nat20"'+dis+off+'>Nat 20</button><button class="ph-btn" data-pact="ds" data-k="nat1"'+dis+off+'>Nat 1</button></div></div>';
  }
  var conds='<div class="ph-sec"><div class="ph-sechead"><b>Conditions</b><button class="ph-btn sm" data-pact="picker"'+dis+'>+ Add</button></div>'+(phChips(c,true)||'<p class="ph-note">None right now.</p>')+'</div>';
  return head+(can?'':'<p class="ph-warn">'+(sn.pe===1?'The DM isn\u2019t connected right now. These controls come back when they are.':'The DM has turned off editing for now. You can still follow the fight.')+'</p>')+ds+hp+rx+conds;
}

function phAcSheet(c,sn){
  var off=phOffline(), can=sn.pe===1&&!off, dis=can?'':' disabled';
  var P=sn.P.filter(function(p){return p.id===ph.claim;})[0]||{st:{}}, base=(P.st&&P.st.ac!=null)?P.st.ac:'';
  return '<div class="ph-scrim" data-pact="acclose"></div><div class="ph-sheet ph-acsheet'+(ph.anim?' enter':'')+'" role="dialog" aria-label="Armor class"><div class="ph-sheethead"><b>Armor class</b><button type="button" class="ph-btn sm ghost" data-pact="acclose">Done</button></div>'+
    '<label class="ph-fld">Your armor class<input type="number" inputmode="numeric" value="'+esc(base)+'" data-pst="ac"'+dis+'></label>'+
    '<div class="ph-acrow"><b>Temporary change</b><div class="ph-step"><button type="button" class="ph-btn sm" data-pact="ac" data-d="-1"'+dis+'>\u2212</button><span>'+(c.am?(c.am>0?'+'+c.am:c.am):'0')+'</span><button type="button" class="ph-btn sm" data-pact="ac" data-d="1"'+dis+'>+</button>'+(c.am?'<button type="button" class="ph-btn sm ghost" data-pact="acclear"'+dis+'>Clear</button>':'')+'</div></div>'+
    (can?'':'<p class="ph-warn">'+(sn.pe===1?'The DM isn\u2019t connected right now. This comes back when they are.':'The DM has turned off editing for now.')+'</p>')+
    '<p class="ph-note">The number is your AC. A temporary change (a spell, a shield) adds to it or takes from it until you clear it.</p></div>';
}
function phMeCard(c,sn){
  return '<article class="ph-me ph-mecard'+(c.i===sn.tid?' now':'')+'" data-ph-i="'+esc(c.i)+'">'+phMeHTML(c,sn)+phStatsHTML(sn)+'</article>';
}
function phTick(){
  if(shellMode!=='phone'||!ph.snap)return;
  var els=document.querySelectorAll('[data-ptimer]'); if(!els.length)return;
  var tm=ph.snap.tm; if(!tm)return;
  var e=(tm.e+(tm.r?Date.now()-ph.lastSnapAt:0))/1000, text, low=false, over=false;
  if(tm.m==='down'){var r=Math.max(0,Math.ceil(tm.s-e)); text=fmt(r); low=r>0&&r<=10; over=r===0;} else text=fmt(Math.floor(e));
  els.forEach(function(el){if(el.textContent!==text)el.textContent=text; el.classList.toggle('low',low); el.classList.toggle('over',over); el.classList.toggle('paused',!tm.r);});
}
setInterval(phTick,250);
function phLandscape(){try{return !!(window.matchMedia&&matchMedia('(orientation:landscape) and (max-height:560px)').matches);}catch(e){return false;}}
var landSig=phLandscape();
window.addEventListener('resize',function(){var l=phLandscape(); if(l===landSig)return; landSig=l; if(shellMode==='phone'||shellMode==='players')render();});

/* A phone on its side is a Combat Monitor: one row of cards that scrolls sideways. */
function phMonCard(c,sn){
  var now=c.i===sn.tid, nxt=c.i===sn.np, grp=!!c.mm;
  var cls=c.s==='e'?'npc':(c.s==='n'?'neutral':'pc'+(c.s==='a'?' ally':''));
  var bar=function(o){return '<div class="bar '+o.k+'"><i style="width:'+o.p+'%"></i></div>';};
  var php='', mems='', standing=0;
  if(!grp&&c.hp&&c.hp.m!=='hidden'){
    var h=c.hp, word='<div class="state '+h.k+'">'+esc(h.w)+'</div>';
    if(h.m==='exact'&&h.h!=null)php='<div class="php"><div class="nums">'+h.h+' <span>/ '+h.x+' HP</span>'+(h.t>0?' <em>+'+h.t+' temp</em>':'')+'</div>'+bar(h)+'</div>';
    else if(h.m==='bar')php='<div class="php">'+bar(h)+word+'</div>';
    else php='<div class="php">'+word+'</div>';
  }
  if(grp){
    var gm=c.gm, chips=(gm==='hidden');
    mems='<div class="mems'+(chips?' chips':'')+'">'+c.mm.map(function(m){
      if(!m.d)standing++; var mc='m'+(m.d?' dead':'');
      if(chips||m.k==null)return '<div class="'+mc+'"><span class="mn">'+m.n+'</span></div>';
      if(gm==='exact')return '<div class="'+mc+'"><span class="mn">'+m.n+'</span>'+bar(m)+'<span class="mv">'+(m.h==null?'':m.h)+'</span></div>';
      if(gm==='bar')return '<div class="'+mc+'"><span class="mn">'+m.n+'</span>'+bar(m)+'</div>';
      return '<div class="'+mc+'"><span class="mn">'+m.n+'</span><span class="ms '+m.k+'">'+esc(m.w)+'</span></div>';
    }).join('')+'</div>';
  }
  var showRx=(sn.rs==null||sn.rs==='all'||(sn.rs==='pc'&&(c.s==='p'||c.s==='a'))), rxp=(showRx&&c.rx!=null)?'<div class="prx"><span class="rxpip '+(c.rx===2?'held':c.rx===1?'used':'ready')+'">'+(c.rx===2?'Reaction held':c.rx===1?'Reaction used':'Reaction ready')+'</span></div>':'';
  var rdy=(c.rd!=null&&c.s==='p'&&sn.rs!=='none')?'<div class="rdy">Readied'+(c.rd?': '+esc(c.rd):'')+'</div>':'';
  var dsv='';
  if(c.ds){var d=c.ds; dsv=d.hd?'<div class="dsv"><span class="dlab">Down</span></div>':'<div class="dsv">'+(d.dd?'<span class="dlab bad">Dead</span>':d.st?'<span class="dlab ok">Stable</span>':'<span class="dlab">Death saves</span><span class="pips ok">'+pips(d.s,3)+'</span><span class="pips bad">'+failPips(d.f)+'</span>')+'</div>';}
  var conds=(c.en||[]).map(function(l){return '<li class="ended"><b><i class="ck">\u2713</i> <s>'+esc(l)+'</s></b><small>ended</small></li>';}).join('')+
    c.cd.map(function(cd){return '<li><b>'+esc(cd.n+(cd.l?' '+cd.l:''))+'</b>'+(cd.d?'<small>'+esc(cd.d)+'</small>':'')+'</li>';}).join('');
  var player=c.s==='p'&&c.pl?'<p class="player">'+esc(c.pl)+'</p>':(c.s==='a'?'<p class="player">Ally</p>':(c.s==='n'?'<p class="player">Neutral</p>':''));
  return '<section class="pcard '+cls+(now?' now cur':'')+(nxt?' next':'')+(c.dn?' down':'')+'" data-cid="'+esc(c.i)+'" style="--w:'+(now?1.2:1)+'">'+
    (now?'<span class="flag now">'+(sn.cb?'\u25b6 ':'')+'Now</span>':'')+(nxt?'<span class="flag nxt">'+(sn.cb?'\u25b7 ':'')+(sn.np===sn.nx?'Up next':'Get ready')+'</span>':'')+
    '<div class="ptop">'+(sn.cb?'<span class="rolemark">'+({p:'\u25c6 Player',a:'\u25c7 Ally',n:'\u25cb Neutral',e:'\u25b2 Foe'})[c.s]+'</span>':'')+(now?'<span class="rnd">Round '+sn.r+'</span>':'')+'<span class="grow"></span>'+(now&&sn.tm?'<span class="ptimer" data-ptimer>0:00</span>':'')+
      (c.ac!=null?'<span class="pac'+(c.ax?' modded':'')+'" title="Armor class"><b>'+c.ac+'</b><small>AC</small></span>':'')+'</div>'+
    '<h3>'+esc(c.n)+(grp?'<span class="gx">\u00d7'+standing+'</span>':'')+'</h3>'+player+rxp+rdy+php+dsv+mems+(conds?'<ul class="pconds">'+conds+'</ul>':'')+'</section>';
}
function phPopupHTML(sn){
  var me=sn.pz?null:phMine(); if(!(ph.popup&&(me||ph.popup.test)))return '';
  var cur=sn.c.filter(function(c){return c.i===sn.tid;})[0], tcls=ph.popup.t, test=!!ph.popup.test;
  if(!test&&tcls==='rfi')return '<div class="ph-popup rfi'+(ph.popAnim?' enter':'')+'" role="alertdialog" aria-live="assertive"><div class="ph-popcard"><div class="ph-popicon rfiicon">'+ICONS.d20+'</div><h1>Roll for initiative!</h1><p>Roll a d20 and add your Dex modifier, '+esc(me.n)+'.</p><button class="ph-btn big" data-pact="popclose">Got it</button></div></div>';
  var ttl=test?'Alert test':(tcls==='turn'?'It\u2019s your turn!':(me&&sn.nx===me.i?'You\u2019re up next!':'Get ready!'));
  var msg=test?esc(ph.popup.note):(tcls==='turn'?(me.ds&&!me.ds.st&&!me.ds.dd?'Roll your death saving throw, '+esc(me.n)+'.':esc(me.n)+', the table is waiting on you.'):(cur?esc(cur.n)+' is acting now. Get ready, '+esc(me.n)+'.':'Get ready, '+esc(me.n)+'.'));
  return '<div class="ph-popup '+tcls+(ph.popAnim?' enter':'')+'" role="alertdialog" aria-live="assertive"><div class="ph-popcard"><div class="ph-popicon">'+(test?'\ud83d\udd14':(tcls==='turn'?logoSVG('pop'):'\u23ed'))+'</div><h1>'+ttl+'</h1><p>'+msg+'</p><button class="ph-btn big" data-pact="popclose">Got it</button></div></div>';
}
function renderPhoneMonitor(){
  var sn=ph.snap, C=sn.c||[], g0=app.querySelector('.pgrid'), keep=g0?g0.scrollLeft:0;
  var ci=C.findIndex(function(c){return c.i===sn.tid;}), rot=(ph.cardMode!=='static'&&ci>0)?C.slice(ci).concat(C.slice(0,ci)):C.slice();
  var key=sn.tid+':'+sn.r, turned=ph.monTurn!==key; ph.monTurn=key;
  var inner;
  if(sn.rfi&&!sn.r)inner=rfiHTML();
  else if(sn.pz)inner='<div class="ppause" role="status">'+logoSVG('xl')+'<h1>Combat paused</h1><p>The DM will resume in a moment.</p></div>';
  else if(!rot.length)inner='<div class="pempty">'+logoSVG('xl')+'<span>Rolling for initiative\u2026</span></div>';
  else inner='<div class="pgrid scrollx off" style="--fs:26;--fscale:1">'+rot.map(function(c){return phMonCard(c,sn);}).join('')+'</div>';
  app.innerHTML='<div class="pwrap'+(sn.cb?' cb':'')+'">'+inner+'</div>'+phPopupHTML(sn)+
    '<button type="button" class="lmpill" data-pact="cardmode" aria-label="Card order: '+(ph.cardMode==='static'?'static':'scrolling')+'. Tap to switch." title="Switch card order">'+(ph.cardMode==='static'?'Static':'Scrolling')+'</button>';
  var g1=app.querySelector('.pgrid');
  if(g1){
    if(ph.cardMode==='static'){ if(turned){var cu=g1.querySelector('.pcard.cur'); if(cu)g1.scrollLeft=Math.max(0,cu.offsetLeft-(g1.clientWidth-cu.offsetWidth)/2);} else g1.scrollLeft=keep; }
    else g1.scrollLeft=turned?0:keep;
  }
  phTick();
}

function phSheetFields(st,attr,dis){
  function inp(f,val,label,type){return '<label class="ph-fld">'+label+'<input type="'+(type||'text')+'"'+(type==='number'?' inputmode="numeric"':'')+' value="'+esc(val)+'" '+attr+'="'+f+'"'+dis+'></label>';}
  return '<div class="ph-stgrid3">'+inp('mh',st.mh,'Max HP','number')+inp('ac',st.ac,'Armor class')+inp('sp',st.sp,'Speed')+'</div>'+
    '<div class="ph-stabil">'+ABIL.map(function(a){var x=(st.ab&&st.ab[a[0]])||['',''];
      return '<div class="ph-ab"><b>'+a[1]+'</b><input type="number" inputmode="numeric" value="'+esc(x[0])+'" '+attr+'="ab:'+a[0]+':s" aria-label="'+a[1]+' score"'+dis+'><input type="text" value="'+esc(x[1])+'" placeholder="Save" '+attr+'="ab:'+a[0]+':v" aria-label="'+a[1]+' saving throw"'+dis+'></div>';}).join('')+'</div>'+
    '<div class="ph-stgrid1">'+inp('rs',st.rs,'Resistances')+inp('im',st.im,'Immunities')+inp('vu',st.vu,'Vulnerabilities')+'</div>';
}

function phLocalCard(){
  return '<div class="ph-sec"><div class="ph-sechead"><b>My character sheet</b><button class="ph-btn sm" data-pact="myopen">'+(ph.myOpen?'Done':'Set up now')+'</button></div>'+
    (ph.myOpen?phSheetFields(phMyAsSt(),'data-pmy','')+'<p class="ph-note">Saved on this phone. It goes to the DM when you pick your character.</p>'
      :'<p class="ph-note">Fill in your stats ahead of time, even before the DM is here. They\u2019re saved on this phone and sent when you pick your character.</p>')+'</div>';
}

function phStatsHTML(sn){
  var P=sn.P.filter(function(p){return p.id===ph.claim;})[0]; if(!P)return '';
  var st=P.st||{ab:{}}, off=phOffline(), can=sn.pe===1&&!off, dis=can?'':' disabled';
  var summary=[]; if(st.mh!=='')summary.push('Max HP '+st.mh); if(st.ac)summary.push('AC '+st.ac); if(st.sp)summary.push(st.sp);
  var head='<div class="ph-sechead"><b>My stats</b><button class="ph-btn sm" data-pact="stats">'+(ph.statsOpen?'Done':'Edit')+'</button></div>';
  if(!ph.statsOpen)return '<div class="ph-sec">'+head+'<p class="ph-note">'+(summary.length?esc(summary.join(' \u00b7 ')):'Nothing entered yet. Tap Edit to add your AC and more.')+'</p></div>';
  if(off)return '<div class="ph-sec">'+head+'<p class="ph-warn">The DM isn\u2019t connected right now. Edit here and it will be saved on this phone and sent when they\u2019re back.</p>'+phSheetFields(phMyAsSt(),'data-pmy','')+'</div>';
  var diff=phLocalMap(P,false);
  return '<div class="ph-sec">'+head+(sn.pe===1?'':'<p class="ph-warn">The DM has turned off editing for now.</p>')+phSheetFields(st,'data-pst',dis)+
    (diff&&can?'<button class="ph-btn sm" data-pact="sendlocal">Send my saved sheet to the DM</button>':'')+
    '<p class="ph-note">Saves the moment you leave a box. The DM sees it right away.</p></div>';
}

function phPicker(c){
  var list=EXTRA_CONDS.concat(CONDITIONS);
  return '<div class="ph-scrim" data-pact="pickerclose"></div><div class="ph-sheet'+(ph.anim?' enter':'')+'" role="dialog" aria-label="Add a condition"><div class="ph-sheethead"><b>Add a condition</b><button class="ph-btn sm ghost" data-pact="pickerclose">Close</button></div><div class="ph-pickgrid">'+
    list.map(function(n){return '<button type="button" class="ph-pick'+(EXTRA_CONDS.indexOf(n)>=0?' extra':'')+'" data-pact="cadd" data-n="'+esc(n)+'">'+esc(n)+'</button>';}).join('')+'</div><p class="ph-note">They stay on until you or the DM remove them.</p></div>';
}

function phMenu(){
  var live=Date.now()-ph.lastSnapAt<45000, cur=ph.skin||'';
  var opts=[{id:'',name:'Match the table',sw:null}].concat(SKINS);
  return '<div class="ph-scrim" data-pact="menuclose"></div><div class="ph-sheet'+(ph.anim?' enter':'')+'" role="dialog" aria-label="Menu"><div class="ph-sheethead"><b>Menu</b><button class="ph-btn sm ghost" data-pact="menuclose">Close</button></div>'+
    '<p class="ph-note">'+(live?'Connected to the DM.':'No recent update from the DM.')+(ph.claim?(ph.claimOk?' Your character is confirmed.':' Waiting for the DM to confirm your character\u2026'):'')+'</p>'+
    '<div class="ph-menusec"><b>Look</b><div class="ph-skins" role="radiogroup" aria-label="Theme">'+opts.map(function(k){
      return '<button type="button" class="ph-skin" role="radio" aria-checked="'+(cur===k.id)+'" data-pact="pskin" data-id="'+esc(k.id)+'">'+(k.pv?skinPicHTML(k):'<span class="sw5 match"><i></i></span>')+'<span>'+esc(k.name)+'</span></button>';}).join('')+'</div></div>'+
    (ui.owner?'<div class="ph-menusec"><b>View</b><div class="seg" role="radiogroup" style="margin-top:8px">'+[['dm','DM screen'],['monitor','Combat Monitor'],['player','Player screen']].map(function(v){return '<button type="button" role="radio" aria-checked="'+(v[0]==='player')+'" data-pact="viewset" data-v="'+v[0]+'">'+v[1]+'</button>';}).join('')+'</div></div>':'')+
    '<div class="ph-menusec"><b>Cards on their side</b><div class="seg" role="radiogroup" style="margin-top:8px">'+[['scroll','Scrolling'],['static','Static']].map(function(v){return '<button type="button" role="radio" aria-checked="'+(ph.cardMode===v[0])+'" data-pact="cardmode2" data-v="'+v[0]+'">'+v[1]+'</button>';}).join('')+'</div><p class="ph-note">Scrolling keeps the current card first. Static keeps the cards in turn order.</p></div>'+
    '<div class="ph-menurow"><span>Alerts (sound and vibration)</span><button class="ph-sw'+(ph.alerts?' on':'')+'" role="switch" aria-checked="'+ph.alerts+'" data-pact="alerts"><i></i></button></div>'+
    '<div class="ph-menurow"><span>Keep screen on</span><button class="ph-sw'+(ph.wake?' on':'')+'" role="switch" aria-checked="'+ph.wake+'" data-pact="wake"><i></i></button></div>'+
    '<div class="ph-menurow"><span>Try an alert</span><button class="ph-btn sm" data-pact="testalert">Test</button></div>'+
    (ph.claim?'<div class="ph-menurow"><span>Switch character</span><button class="ph-btn sm" data-pact="switch">Switch</button></div>':'')+
    '<p class="ph-note">Alerts work while this page is open. On some phones, locking the screen pauses them.</p></div>';
}

function phFocusSel(ae){
  if(!ae||!ae.getAttribute)return '';
  var keys=['data-pamt','data-prdy','data-pst','data-pmy'];
  for(var i=0;i<keys.length;i++){var v=ae.getAttribute(keys[i]); if(v!==null)return '['+keys[i]+(v?'="'+v+'"':'')+']';}
  return '';
}

function renderPhone(force){
  applyTheme();
  document.body.classList.toggle('land',phLandscape());
  if(ph.snap&&phLandscape()){renderPhoneMonitor();return;}
  var sn=ph.snap, keepList=0, keepMain=0;
  var lst=app.querySelector('.ph-list'), mn=app.querySelector('.ph-me'), shd=app.querySelector('.ph-sheet'), keepSheet=0;
  if(lst)keepList=lst.scrollTop; if(mn)keepMain=mn.scrollTop; if(shd)keepSheet=shd.scrollTop; var pageY=window.scrollY;
  var ae=document.activeElement, fsel=phFocusSel(ae), fs0=0, fs1=0;
  if(fsel&&!force){ph.dirty=true;return;}
  if(fsel){try{fs0=ae.selectionStart;fs1=ae.selectionEnd;}catch(e){}}
  ph.dirty=false;
  var html='';
  if(!sn){
    html='<div class="ph-wait"><div class="ph-spin"></div><h2>Waiting for the DM\u2026</h2><p>Keep this page open. It will fill in as soon as the table is live.</p></div><div class="ph-main"><section class="ph-me">'+phLocalCard()+'</section></div>';
  } else {
    var cur=sn.c.filter(function(c){return c.i===sn.tid;})[0], nxt=sn.c.filter(function(c){return c.i===sn.np;})[0];
    var stale=Date.now()-ph.lastSnapAt>45000;
    var top='<header class="ph-top"><div class="ph-brand">'+logoSVG('sm')+'<span>'+wordmarkSVG()+'</span></div>'+(sn.r?'<span class="ph-round">Round '+sn.r+'</span>':'<span class="ph-round muted">Not started</span>')+
      '<span class="ph-live'+(stale?' off':'')+'" title="'+(stale?'No recent update':'Live')+'"></span><button class="ph-menubtn" data-pact="menu" aria-label="Menu">\u22ef</button></header>';
    var strip=cur?'<div class="ph-strip"><span class="ph-sn now'+(cur.s==='e'?' foe':'')+'"><small>Now</small><b>'+esc(cur.n)+'</b></span>'+(nxt?'<span class="ph-sn nxt"><small>'+(sn.np===sn.nx?'Up next':'Get ready')+'</small><b>'+esc(nxt.n)+'</b></span>':'')+'</div>':'';
    var me=sn.pz?null:phMine(), body='';
    var listHTML=function(){
      if(sn.pz)return '<p class="ph-note">Combat is paused. The DM will resume shortly.</p>';
      if(!sn.c.length)return '<p class="ph-note">No one is in the fight yet.</p>';
      return sn.c.map(function(c){return (me&&c.i===me.i)?phMeCard(me,sn):phRow(c,sn);}).join('');
    };
    if(!ph.claim&&!ph.watching){
      body='<section class="ph-claim"><h2>Who are you?</h2>'+(ph.msg?'<p class="ph-warn">'+esc(ph.msg)+'</p>':'<p class="ph-note">Pick your character to get alerts and control it from here.</p>')+
        '<div class="ph-claimgrid">'+(sn.P.length?sn.P.map(function(p){
          var owner=(sn.cl||{})[p.id], taken=owner&&!phHit(owner);
          return '<button type="button" class="ph-claimbtn" data-pact="claim" data-id="'+esc(p.id)+'"'+(taken?' disabled':'')+'><b>'+esc(p.n)+'</b><small>'+(taken?'Taken':esc(p.pl||'Tap to play'))+'</small></button>';
        }).join(''):'<p class="ph-note">The DM hasn\u2019t added any characters yet.</p>')+'</div>'+
        '<button type="button" class="ph-btn ghost" data-pact="watch">Just watching</button>'+phLocalCard()+'</section>'+
        '<section class="ph-list"><h3>The table</h3>'+listHTML()+'</section>';
    } else if(!ph.claim){
      body='<section class="ph-list"><div class="ph-watchbar"><span>Watching only</span><button type="button" class="ph-btn sm" data-pact="switch">Pick a character</button></div><div class="ph-listhead"><h3>The table</h3><button class="ph-btn sm ghost" data-pact="jump">Jump to current</button></div>'+listHTML()+'</section>';
    } else {
      body=(me?'':'<section class="ph-me"><div class="ph-mehead"><h2>'+esc((sn.P.filter(function(p){return p.id===ph.claim;})[0]||{}).n||'Your character')+'</h2></div><p class="ph-note">'+(sn.pz?'Combat is paused. The DM will resume shortly.':'You\u2019re not in this fight yet. Hang tight.')+'</p>'+phStatsHTML(sn)+'</section>')+
        '<section class="ph-list"><div class="ph-listhead"><h3>The table</h3><span class="ph-listbtns"><button class="ph-btn sm ghost" data-pact="jump">Jump to current</button>'+(me?'<button class="ph-btn sm ghost" data-pact="jumpme">Jump to me</button>':'')+'</span></div>'+listHTML()+'</section>';
    }
    var popup=phPopupHTML(sn);
    html='<div class="phwrap'+(sn.cb?' cb':'')+'">'+top+strip+'<main class="ph-main">'+body+'</main>'+(ph.picker&&me?phPicker(me):'')+(ph.acOpen&&me?phAcSheet(me,sn):'')+(ph.menu?phMenu():'')+popup+'</div>';
  }
  app.innerHTML=html;
  var l2=app.querySelector('.ph-list'), m2=app.querySelector('.ph-me'), s2=app.querySelector('.ph-sheet');
  if(l2)l2.scrollTop=keepList; if(m2)m2.scrollTop=keepMain; if(s2)s2.scrollTop=keepSheet; window.scrollTo(0,pageY);
  var mcard=sn?app.querySelector('.ph-mecard'):null;
  if(mcard){var tk=sn.tid+':'+sn.r; if(ph.scrollMe||(sn.tid&&sn.tid===mcard.dataset.phI&&ph.turnScroll!==tk)){ph.scrollMe=false; ph.turnScroll=tk; try{mcard.scrollIntoView({block:'center'});}catch(x){}}}
  phTick();
  ph.anim=false; ph.popAnim=false;
  if(fsel){var fe=app.querySelector(fsel); if(fe){fe.focus(); try{fe.setSelectionRange(fs0,fs1);}catch(e){}}}
}

