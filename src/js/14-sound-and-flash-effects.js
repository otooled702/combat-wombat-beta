/* ================================================================
   14. Sound and flash effects
   observe() compares the table before and after every render and turns the
   difference into events (a hit, a heal, a new turn...). Those events play a
   sound (if enabled for this window) and drive the card flash on the display.
   ================================================================ */

var Sfx=(function(){
  var ctx=null, master=null, noiseBuf=null, gestured=false, prev=null, pending=[], recent=[], lastTick=-1, buzzed=false;
  var VOICES={slate:{w:'sine',m:1},light:{w:'sine',m:1},medieval:{w:'triangle',m:.8},water:{w:'sine',m:1.25},forest:{w:'triangle',m:.9},mountain:{w:'sawtooth',m:.7,lp:1400},fire:{w:'sawtooth',m:.8,lp:2000}};
  var CATS={start:'sfxTurn',resolve:'sfxTurn',round:'sfxTurn',turnPc:'sfxTurn',turnFoe:'sfxTurn',hitSmall:'sfxHit',hitBig:'sfxHit',heal:'sfxHit',
            defeat:'sfxEnd',down:'sfxEnd',dsOk:'sfxEnd',dsFail:'sfxEnd',revive:'sfxEnd',nat20:'sfxEnd',dead:'sfxEnd',stable:'sfxEnd',
            condOn:'sfxCond',condOff:'sfxCond',tick:'sfxTimer',buzz:'sfxTimer'};
  var VOLS={low:.35,med:.6,high:.95};
  function voice(){return VOICES[state.settings.skin]||VOICES.slate;}
  function ensure(){
    if(ctx)return true;
    var AC=window.AudioContext||window.webkitAudioContext; if(!AC)return false;
    try{ctx=new AC(); master=ctx.createGain(); master.connect(ctx.destination);}catch(e){ctx=null;return false;}
    return true;
  }
  function tone(f,t,d,v,o){
    o=o||{}; var vc=voice(), at=ctx.currentTime+t, osc=ctx.createOscillator(), g=ctx.createGain(), k=o.raw?1:vc.m;
    osc.type=o.type||vc.w; osc.frequency.setValueAtTime(f*k,at); if(o.to)osc.frequency.exponentialRampToValueAtTime(o.to*(o.raw?1:vc.m),at+d);
    g.gain.setValueAtTime(.0001,at); g.gain.exponentialRampToValueAtTime(v,at+(o.a||.012)); g.gain.exponentialRampToValueAtTime(.0001,at+d);
    var lp=o.lp||(vc.lp&&!o.raw?vc.lp:0);
    if(lp){var fl=ctx.createBiquadFilter(); fl.type='lowpass'; fl.frequency.value=lp; osc.connect(fl); fl.connect(g);} else osc.connect(g);
    g.connect(master); osc.start(at); osc.stop(at+d+.05);
  }
  function noise(t,d,v,hp){
    if(!noiseBuf){noiseBuf=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate); var a=noiseBuf.getChannelData(0); for(var i=0;i<a.length;i++)a[i]=Math.random()*2-1;}
    var at=ctx.currentTime+t, src=ctx.createBufferSource(), g=ctx.createGain(), fl=ctx.createBiquadFilter();
    src.buffer=noiseBuf; fl.type='highpass'; fl.frequency.value=hp||400;
    g.gain.setValueAtTime(v,at); g.gain.exponentialRampToValueAtTime(.0001,at+d);
    src.connect(fl); fl.connect(g); g.connect(master); src.start(at); src.stop(at+d+.02);
  }
  var SOUNDS={
    start:function(){tone(196,0,.8,.4,{type:'sawtooth',lp:900,a:.08,raw:true});tone(294,.4,1,.4,{type:'sawtooth',lp:1100,a:.08,raw:true});},
    resolve:function(){tone(392,0,.5,.34);tone(294,.3,.5,.34);tone(196,.6,.9,.34);},
    round:function(){[110,165,247,330].forEach(function(f,i){tone(f,0,1.9-i*.35,.4/(i+1)+.04,{raw:true,a:.01});});},
    turnPc:function(){tone(784,0,.35,.4);tone(1175,.16,.5,.4);},
    turnFoe:function(){tone(150,0,.3,.7,{to:55,raw:true,a:.004});noise(0,.1,.25,800);},
    hitSmall:function(){noise(0,.07,.35,1200);tone(190,0,.12,.4,{to:90,raw:true,a:.003});},
    hitBig:function(){noise(0,.14,.5,500);tone(120,0,.3,.7,{to:45,raw:true,a:.003});tone(70,.02,.35,.5,{raw:true});},
    heal:function(){[880,1109,1319].forEach(function(f,i){tone(f,i*.09,.4,.28,{type:'triangle'});});},
    defeat:function(){tone(220,0,.5,.45,{type:'sawtooth',to:70,lp:700,raw:true});noise(0,.15,.4,300);},
    down:function(){[0,.2,.7,.9].forEach(function(t){tone(62,t,.16,.8,{to:40,raw:true,a:.004});});},
    dsOk:function(){tone(660,0,.14,.35);tone(880,.09,.22,.35);},
    dsFail:function(){tone(330,0,.18,.4,{type:'square',lp:900,raw:true});tone(220,.12,.3,.4,{type:'square',lp:700,raw:true});},
    revive:function(){[523,659,784].forEach(function(f,i){tone(f,i*.08,.5,.35,{type:'triangle'});});},
    nat20:function(){[523,659,784,1047,1319].forEach(function(f,i){tone(f,i*.07,.55,.34,{type:'triangle'});});noise(.3,.3,.12,6000);},
    dead:function(){[98,147,196].forEach(function(f,i){tone(f,0,2,.35/(i+1)+.05,{raw:true,a:.01});tone(f,.9,1.8,.3/(i+1)+.04,{raw:true,a:.01});});},
    stable:function(){tone(392,0,.5,.3);tone(523,.05,.6,.3);},
    condOn:function(){tone(500,0,.28,.3,{to:900});tone(1200,.1,.2,.15);},
    condOff:function(){tone(700,0,.3,.28);tone(520,.16,.4,.28);},
    tick:function(){tone(1000,0,.05,.3,{type:'square',lp:3000,raw:true,a:.002});},
    buzz:function(){tone(140,0,.6,.45,{type:'sawtooth',lp:800,raw:true,a:.01});}
  };
  function play(name){
    if(!ensure()||!SOUNDS[name])return;
    var now=Date.now(); recent=recent.filter(function(x){return now-x.t<350;});
    if(recent.some(function(x){return x.n===name&&now-x.t<90;})||recent.length>=4)return;
    recent.push({n:name,t:now}); master.gain.value=VOLS[state.settings.sfxVol]||.6;
    if(ctx.state!=='running')ctx.resume();
    SOUNDS[name]();
  }
  function wants(name,role){
    var st=state.settings; if(!gestured)return false;
    if(role==='tv'?st.sfxTv===false:st.sfxDm!==true)return false;
    return st[CATS[name]]!==false;
  }
  function summary(){
    var rows={}, cur=state.started?byId(state.turnId):null;
    state.combatants.forEach(function(c){
      rows[c.id]={hp:c.hp,max:c.maxHp,side:isSide(c),hide:!!c.hidden,cond:c.conditions.length,ended:liveEnded(c).length,
        ds:c.death?[c.death.s,c.death.f,c.death.dead?1:0,c.death.stable?1:0]:null,mem:c.members?c.members.map(function(m){return m.hp;}):null,mmax:c.members&&c.members[0]?c.members[0].maxHp:null};
    });
    return {started:!!state.started,round:state.round,turn:state.started?state.turnId:null,turnSide:cur?isSide(cur):false,rows:rows};
  }
  function drop(o,n,max,side,id,out,single){
    if(o==null||n==null||n===o)return;
    if(n<o){
      var amt=o-n, big=max?amt/max>=.2:amt>=10;
      if(n===0&&o>0)out.push({s:side?'down':'defeat',id:id,amt:amt,k:'hit'}); else out.push({s:big?'hitBig':'hitSmall',id:id,amt:amt,k:'hit'});
    } else out.push({s:'heal',id:id,amt:n-o,k:'heal'});
  }
  function diff(a,b){
    var ev=[];
    if(!a.started&&b.started)ev.push({s:'start'});
    else if(a.started&&!b.started)ev.push({s:'resolve'});
    else if(b.started){
      if(b.round>a.round)ev.push({s:'round'});
      if(b.turn!==a.turn)ev.push({s:b.turnSide?'turnPc':'turnFoe'});
    }
    Object.keys(b.rows).forEach(function(id){
      var n=b.rows[id], o=a.rows[id]; if(!o||n.hide||o.hide)return;
      drop(o.hp,n.hp,n.max,n.side,id,ev);
      if(n.mem&&o.mem&&n.mem.length===o.mem.length){
        var sub=[]; n.mem.forEach(function(h,i){drop(o.mem[i],h,n.mmax,false,id,sub);});
        if(sub.length){var best=sub.filter(function(e){return e.k==='hit';}).sort(function(x,y){return y.amt-x.amt;})[0]||sub[0]; ev.push(best);}
      }
      if(n.ds&&o.ds){
        if(n.ds[0]>o.ds[0])ev.push({s:'dsOk',id:id}); if(n.ds[1]>o.ds[1])ev.push({s:'dsFail',id:id});
        if(n.ds[2]>o.ds[2])ev.push({s:'dead',id:id}); if(n.ds[3]>o.ds[3])ev.push({s:'stable',id:id});
      }
      if(o.ds&&!n.ds&&o.hp===0&&n.hp>0)ev.push({s:n.hp===1?'nat20':'revive',id:id});
      if(n.cond>o.cond)ev.push({s:'condOn',id:id}); if(n.ended>o.ended)ev.push({s:'condOff',id:id});
    });
    return ev;
  }
  return {
    gesture:function(){gestured=true; if(ensure()&&ctx.state!=='running')ctx.resume();},
    unlock:function(){gestured=true; ensure(); if(ctx&&ctx.state!=='running')ctx.resume();},
    unlocked:function(){return gestured&&!!ctx&&ctx.state==='running';},
    play:function(name){gestured=true; play(name);},
    observe:function(role){
      var cur=summary(), ev=prev?diff(prev,cur):[]; prev=cur;
      if(!ev.length)return;
      pending=pending.concat(ev);
      ev.forEach(function(e,i){if(wants(e.s,role))setTimeout(function(){play(e.s);},i*110);});
    },
    take:function(){var e=pending; pending=[]; return e;},
    timer:function(role){
      var t=state.timer;
      if(!state.started||t.mode!=='down'||!t.running){buzzed=false;lastTick=-1;return;}
      var rem=Math.max(0,Math.ceil(t.secs-timerMs()/1000));
      if(rem>10){buzzed=false;lastTick=-1;return;}
      if(rem>0&&rem!==lastTick){lastTick=rem; if(wants('tick',role))play('tick');}
      else if(rem===0&&!buzzed){buzzed=true; if(wants('buzz',role))play('buzz');}
    },
    diff:diff, summary:summary
  };
})();
['click','keydown','pointerup','touchend'].forEach(function(t){document.addEventListener(t,function(){Sfx.gesture();},{passive:true});});

