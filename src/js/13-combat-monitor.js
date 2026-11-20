/* ================================================================
   13. Combat Monitor
   The read-only table view for a second monitor.
   ================================================================ */

function renderPlayers(){
  var vis=state.combatants.filter(function(c){return !c.hidden;});
  var cur=state.started?byId(state.turnId):null;
  var npid=nextPcId(), s=state.settings;
  var showTimer=state.timer.mode!=='off'&&state.timer.showPlayers&&state.started;
  var head=state.started?'':'<div class="phead"><span class="rndbadge">Combat hasn\u2019t started</span></div>';
  var n=vis.length, grid='';
  var nowId=state.started?state.turnId:null, turnChanged=!!(nowId&&lastNowId&&nowId!==lastNowId); lastNowId=nowId;
  function cardHTML(c,small){
    var isNow=cur&&c.id===cur.id, isNext=c.id===npid, grp=isGroup(c);
    var mode=hpMode(c), php='', mems='';
    if(!grp&&tracks(c)&&c.hp!=null&&c.maxHp&&mode!=='hidden'){
      var bar='<div class="bar '+hpClass(c)+'"><i style="width:'+hpPct(c)+'%"></i></div>', word='<div class="state '+hpClass(c)+'">'+hpStatus(c)+'</div>';
      if(mode==='exact')php='<div class="php"><div class="nums">'+c.hp+' <span>/ '+c.maxHp+' HP</span>'+(c.temp>0?' <em>+'+c.temp+' temp</em>':'')+'</div>'+bar+'</div>';
      else if(mode==='bar')php='<div class="php">'+bar+word+'</div>';
      else php='<div class="php">'+word+'</div>';
    }
    var standing=0;
    if(grp){
      var chipsOnly=(!tracks(c)||mode==='hidden');
      mems='<div class="mems'+(chipsOnly?' chips':'')+'">'+c.members.map(function(m){
        var dead=tracks(c)&&m.hp!=null&&m.hp<=0; if(!dead)standing++;
        var cls='m'+(dead?' dead':''), mb='<div class="bar '+hpClass(m)+'"><i style="width:'+hpPct(m)+'%"></i></div>';
        if(chipsOnly||m.hp==null||!m.maxHp)return '<div class="'+cls+'"><span class="mn">'+m.n+'</span></div>';
        if(mode==='exact')return '<div class="'+cls+'"><span class="mn">'+m.n+'</span>'+mb+'<span class="mv">'+m.hp+(m.temp>0?'<em>+'+m.temp+'</em>':'')+'</span></div>';
        if(mode==='bar')return '<div class="'+cls+'"><span class="mn">'+m.n+'</span>'+mb+'</div>';
        return '<div class="'+cls+'"><span class="mn">'+m.n+'</span><span class="ms '+hpClass(m)+'">'+hpStatus(m)+'</span></div>';
      }).join('')+'</div>';
    }
    var showRx=!grp&&!c.death&&(s.rxShow==='all'||(s.rxShow==='pc'&&isSide(c))), rxp='', rdy='';
    if(showRx){
      var st=c.ready?'held':(c.rx?'used':'ready');
      rxp='<div class="prx"><span class="rxpip '+st+'">'+(c.ready?'Reaction held':(c.rx?'Reaction used':'Reaction ready'))+'</span></div>';
    }
    if(!grp&&isSide(c)&&!c.death&&c.ready&&s.rxShow!=='none')rdy='<div class="rdy">Readied'+(c.ready.trigger?': '+esc(c.ready.trigger):'')+'</div>';
    var dsv='';
    if(!grp&&isSide(c)&&c.death&&c.hp===0&&tracks(c)){
      var dd=c.death, big=isNow&&!dd.stable&&!dd.dead;
      if(dd.hide)dsv='<div class="dsv'+(isNow?' big':'')+'"><span class="dlab">'+(isNow?'Death saving throw\u2026':'Down')+'</span></div>';
      else dsv='<div class="dsv'+(big?' big':'')+'">'+(dd.dead?'<span class="dlab bad">Dead</span>':dd.stable?'<span class="dlab ok">Stable</span>':'<span class="dlab">'+(big?'Death saving throw':'Death saves')+'</span><span class="pips ok">'+pips(dd.s,3)+'</span><span class="pips bad">'+failPips(dd.f)+'</span>')+'</div>';
    }
    var im=imgSrc(c);
    var conds=c.conditions.map(function(cd){var dt=durText(cd,c);return '<li><b>'+esc(condLabel(cd))+'</b>'+(dt?'<small>'+esc(dt)+'</small>':'')+'</li>';}).join('');
    conds=liveEnded(c).map(function(e){var fresh=Date.now()-e.at<2500; return '<li class="ended'+(fresh?' fresh':'')+'"><b><i class="ck">\u2713</i> <s>'+esc(e.label)+'</s></b><small>ended</small></li>';}).join('')+conds;
    return '<section data-cid="'+c.id+'" class="pcard '+sideClass(c)+(isNow?' now cur':'')+(isNext?' next':'')+(small?' small':'')+(isDown(c)?' down':'')+(isSide(c)&&c.death&&!c.death.dead&&c.hp===0&&tracks(c)?' dying':'')+'" style="--w:'+(isNow?1.2:1)+'">'+
      (isNow?'<span class="flag now">'+(state.settings.cbMarks?'\u25b6 ':'')+'Now</span>':'')+(isNext?'<span class="flag nxt">'+(state.settings.cbMarks?'\u25b7 ':'')+readyWord(c.id,true)+'</span>':'')+
      '<div class="ptop">'+(state.settings.cbMarks?'<span class="rolemark">'+roleMark(c)+'</span>':'')+(isNow?'<span class="rnd">Round '+state.round+'</span>':'')+'<span class="grow"></span>'+(isNow&&showTimer?'<span class="ptimer" data-timer>0:00</span>':'')+
        (acVisible(c)?'<span class="pac'+(c.acMod?' modded':'')+'" title="Armor class"><b>'+acTotal(c)+'</b><small>AC</small></span>':'')+'</div>'+
      '<h3>'+esc(c.name)+(grp?'<span class="gx">\u00d7'+standing+'</span>':'')+'</h3>'+(c.kind==='pc'&&c.player&&state.settings.showNames!==false?'<p class="player">'+esc(c.player)+'</p>':(c.kind==='npc'&&(c.disp==='ally'||c.disp==='neutral')?'<p class="player">'+(c.disp==='ally'?'Ally':'Neutral')+'</p>':''))+rxp+rdy+php+dsv+mems+
      (im?'<div class="pimg"><img src="'+im+'" alt=""></div>':'')+
      (conds?'<ul class="pconds">'+conds+'</ul>':'')+'</section>';
  }
  if(!n){
    grid='<div class="pempty">'+logoSVG('xl')+'<span>Rolling for initiative\u2026</span></div>';
  } else {
    var k=0;
    if(state.started){
      var LL=state.combatants, ci=turnIdx();
      for(var q=0;q<n;q++){if(LL.indexOf(vis[q])>=ci){k=q;break;}}
    }
    var rot=vis.slice(k).concat(vis.slice(0,k)), rank={};
    rot.forEach(function(c,i){rank[c.id]=i;});
    var scroll=s.cardMode!=='static', seq=scroll?rot:vis;
    var wrapId=(state.started&&scroll&&k>0)?vis[0].id:null;
    var F=n<=5?n:(state.started?4:(n<=8?n:4));
    var phL=phLandscape(), off=s.crowd==='off'||phL, fs=n<=3?31:(n<=5||off)?26:21, stack=(n-F)>10?3:2, cols=[];
    seq.forEach(function(c){
      if(c.id===wrapId)cols.push({t:'div'});
      if(n<=5||off||rank[c.id]<F||c.id===npid||(!state.started&&n<=8)){cols.push({t:'card',c:c});}
      else{
        var last=cols[cols.length-1];
        if(last&&last.t==='group'&&last.cs.length<stack)last.cs.push(c); else cols.push({t:'group',cs:[c]});
      }
    });
    grid='<div class="pgrid'+(off?' off':'')+(phL?' scrollx':'')+'" style="--fs:'+fs+';--fscale:'+(s.fontSize==='large'?1.3:1)+'">'+cols.map(function(col){
      if(col.t==='div')return '<div class="rdiv"><span class="rflag">Round '+(state.round+1)+'</span></div>';
      if(col.t==='card')return cardHTML(col.c,false);
      return '<div class="cgroup">'+col.cs.map(function(c){return cardHTML(c,true);}).join('')+'</div>';
    }).join('')+'</div>';
  }
  if(state.rfi&&!state.started){grid=rfiHTML();}
  if(state.paused&&state.started){grid='<div class="ppause" role="status">'+logoSVG('xl')+'<h1>Combat paused</h1><p>The DM will resume in a moment.</p></div>';}
  var endMsgs=[], minAge=1e9;
  vis.forEach(function(c){liveEnded(c).forEach(function(e){var age=Date.now()-e.at; if(age<6500){endMsgs.push(esc(e.label)+' ended on '+esc(c.name)); minAge=Math.min(minAge,age);}});});
  var banner=endMsgs.length?'<div class="endbanner" role="status"><b>\u2713</b> '+endMsgs.join(' \u00b7 ')+'</div>':'';
  clearTimeout(bannerTimer); if(endMsgs.length)bannerTimer=setTimeout(function(){if(shellMode==='players')render();},6600-minAge);
  var before={}; app.querySelectorAll('.pcard[data-cid]').forEach(function(el){before[el.dataset.cid]={x:el.offsetLeft,y:el.offsetTop};});
  var gw=(app.querySelector('.pgrid')||{}).offsetWidth||0;
  var tvqr=(state.settings.tvQr&&qrSvg(pageLink()+'#player'))?'<div class="tvqr">'+qrSvg(pageLink()+'#player')+'<span>Join on your phone</span></div>':'';
  var pill=(isPlayerWindow()&&state.settings.sfxTv!==false&&!Sfx.unlocked())?'<button type="button" class="sfxpill" data-act="sfxUnlock">\ud83d\udd0a Tap to turn on sound</button>':'';
  var fs=(isPlayerWindow()&&window.name==='bm-monitor'&&!document.fullscreenElement)?'<button type="button" class="sfxpill fspill" data-act="goFull">\u26f6 Full screen</button>':'';
  app.innerHTML='<div class="pwrap'+(state.settings.cbMarks?' cb':'')+'">'+head+grid+banner+tvqr+((pill||fs)?'<div class="pillrow">'+pill+fs+'</div>':'')+'</div>'+(ui.owner&&isPlayerWindow()?'<button class="viewbtn" data-act="viewMenu">View \u25be</button>'+(ui.viewMenu?'<div class="viewmenu">'+[['dm','DM screen'],['monitor','Combat Monitor'],['player','Player screen']].map(function(v){return '<button type="button" data-act="viewSet" data-val="'+v[0]+'"'+(v[0]==='monitor'?' aria-current="true"':'')+'>'+v[1]+'</button>';}).join('')+'</div>':''):'');
  var calm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches, evs=Sfx.take();
  if(!calm){
    if(state.settings.fxFlash!==false)evs.forEach(function(e){
      if(!e.id||(e.k!=='hit'&&e.k!=='heal'))return;
      var card=app.querySelector('.pcard[data-cid="'+e.id+'"]'); if(!card)return;
      var fx=document.createElement('span'); fx.className='fx '+e.k; card.appendChild(fx);
      var cr=byId(e.id), nm=state.settings.fxNums;
      if(e.amt&&(nm==='all'||(nm==='pc'&&cr&&isSide(cr)))){var num=document.createElement('span'); num.className='fxnum '+e.k; num.textContent=(e.k==='hit'?'\u2212':'+')+e.amt; card.appendChild(num);}
      if(e.k==='hit'&&card.animate)card.animate([{translate:'0 0'},{translate:'-8px 0'},{translate:'7px 0'},{translate:'-4px 0'},{translate:'0 0'}],{duration:340});
    });
    if(s.cardMode!=='static')app.querySelectorAll('.pcard[data-cid]').forEach(function(el){
      var o=before[el.dataset.cid]; if(!o||!el.animate)return;
      var dx=o.x-el.offsetLeft, dy=o.y-el.offsetTop; if(Math.abs(dx)<3&&Math.abs(dy)<3)return;
      if(Math.abs(dx)>gw*0.6)el.animate([{opacity:0,translate:'60px 0'},{opacity:1,translate:'0 0'}],{duration:600,easing:'cubic-bezier(.2,.9,.3,1)'});
      else el.animate([{translate:dx+'px '+dy+'px'},{translate:'0px 0px'}],{duration:750,easing:'cubic-bezier(.2,1.25,.35,1)'});
    });
    if(turnChanged){
      var nc=app.querySelector('.pcard.now');
      if(nc&&nc.animate){
        nc.animate([{transform:'scale(.78)',filter:'brightness(1.9)'},{transform:'scale(1.07)',filter:'brightness(1.3)',offset:.55},{transform:'scale(1)',filter:'brightness(1)'}],{duration:850,easing:'cubic-bezier(.2,.9,.25,1)'});
        var shine=document.createElement('span'); shine.className='shine'; nc.appendChild(shine);
      }
    }
  }
  tick();
}


/* "Roll for initiative!" screen the DM can show before combat starts (Monitor and phones). */
function rfiHTML(){return '<div class="ppause rfi" role="status"><span class="rfiicon" aria-hidden="true">'+ICONS.d20+'</span><h1>Roll for initiative!</h1><p>Roll a d20 and add your Dex modifier.</p></div>';}
