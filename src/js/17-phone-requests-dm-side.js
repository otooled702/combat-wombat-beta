/* ================================================================
   17. Phone requests (DM side)
   Claims and the small whitelist of things a phone may ask for.
   ================================================================ */

function statsApply(p,sh,f,val){
  var m, n; val=String(val==null?'':val).trim();
  if(f==='ac'){sh.ac=val.slice(0,12);return true;}
  if(f==='sp'){sh.speed=val.slice(0,40);return true;}
  if(f==='rs'){sh.resist=val.slice(0,60);return true;}
  if(f==='im'){sh.immune=val.slice(0,60);return true;}
  if(f==='vu'){sh.vuln=val.slice(0,60);return true;}
  if(f==='mh'){
    n=Math.round(Number(val));
    if(n>=1&&n<=999){p.maxHp=n; if(p.hp==null||p.hp>n)p.hp=n; state.combatants.forEach(function(x){if(x.partyId===p.id&&x.kind==='pc'){x.maxHp=n; if(x.hp==null||x.hp>n)x.hp=n;}}); return true;}
    return false;
  }
  if((m=/^ab:(str|dex|con|int|wis|cha):(s|v)$/.exec(f))){
    var slot=sh.ab[m[1]];
    if(m[2]==='s'){var sc=val===''?'':Math.round(Number(val)); if(sc===''||(sc>=1&&sc<=30)){slot.score=sc===''?'':String(sc);return true;} return false;}
    slot.save=val.slice(0,6); return true;
  }
  return false;
}

function applyStatsOp(pid,op){
  var p=partyById(pid); if(!p)return;
  var pairs=[];
  if(op.t==='statsb'&&op.v&&typeof op.v==='object'){Object.keys(op.v).slice(0,40).forEach(function(k){pairs.push([k,op.v[k]]);});}
  else pairs.push([op.f,op.v]);
  mutate(function(){
    var sh=ensureSheet(p), n=0;
    pairs.forEach(function(pr){if(statsApply(p,sh,String(pr[0]||''),pr[1]))n++;});
    if(n){syncSheet('p',p); notes.push(p.name+' (phone) updated their stats');}
  });
}

function claimedPid(key){var ks=Object.keys(state.claims||{});for(var i=0;i<ks.length;i++)if(state.claims[ks[i]]===key)return ks[i];return null;}

function applyPhoneOp(key,op){
  if(state.settings.phoneEdit===false||!op||typeof op!=='object')return;
  var pid=claimedPid(key); if(!pid)return;
  if(op.t==='stats'||op.t==='statsb'){applyStatsOp(pid,op);return;}
  var c=state.combatants.find(function(x){return x.partyId===pid&&x.kind==='pc';}); if(!c)return;
  var v=Math.round(Number(op.v));
  mutate(function(){
    var who=c.name+' (phone)';
    switch(op.t){
      case 'dmg':if(c.hp!=null&&v>0&&v<=999){hpDamage(c,v);notes.push(who+' took '+v+' damage');}break;
      case 'heal':if(c.hp!=null&&v>0&&v<=999){hpHeal(c,v);notes.push(who+' healed '+v);}break;
      case 'temp':if(c.hp!=null&&v>0&&v<=999){hpTemp(c,v);notes.push(who+' set temp HP');}break;
      case 'rx':if(!c.death){if(v===1){c.ready=null;c.rx=true;}else c.rx=false;}break;
      case 'acmod':c.acMod=Math.max(-10,Math.min(10,isNaN(v)?0:v));break;
      case 'ds':if(c.death&&['success','fail','nat20','nat1'].indexOf(op.k)>=0)deathApply(c,op.k);break;
      case 'cadd':{
        var allowed=EXTRA_CONDS.concat(CONDITIONS);
        if(allowed.indexOf(op.n)>=0){
          c.conditions=c.conditions.filter(function(x){return x.name!==op.n;});
          c.conditions.push({id:uid(),name:op.n,level:op.n==='Exhaustion'?Math.max(1,Math.min(6,Math.round(Number(op.l))||1)):null,dur:{type:'manual'}});
          notes.push(who+' gained '+op.n);
        }
        break;}
      case 'cdel':{var cd=c.conditions.find(function(x){return x.id===op.i;}); if(cd){c.conditions=c.conditions.filter(function(x){return x.id!==op.i;});endedAdd(c,cd);notes.push(who+' lost '+cd.name);} break;}
      case 'rdy':if(!c.death){if(c.rx)notes.push(who+' has no reaction left'); else{c.ready={trigger:String(op.s||'').slice(0,80)};notes.push(who+' readies an action');}}break;
      case 'rdyfire':if(c.ready){c.rx=true;c.ready=null;notes.push(who+' fires the readied action');}break;
      case 'rdydrop':c.ready=null;break;
    }
  });
}

var lastPhoneCount=-1, knownPeers={}, released={};

function handlePeers(peers){
  if(shellMode!=='dm')return;
  var changed=false, active={}, newcomer=false;
  peers.forEach(function(p){
    active[p.key]=1; if(!knownPeers[p.id]){knownPeers[p.id]=1;newcomer=true;}
    var pr=p.presence||{}, want=pr.cl||null;
    if(released[p.key]){if(released[p.key]===want)want=null; else delete released[p.key];}
    Object.keys(state.claims).forEach(function(pid){if(state.claims[pid]===p.key&&pid!==want){delete state.claims[pid];changed=true;}});
    if(want&&!state.claims[want]&&state.party.some(function(x){return x.id===want;})){state.claims[want]=p.key;changed=true;}
    (Array.isArray(pr.ops)?pr.ops:[]).forEach(function(op){
      if(!op||typeof op.id!=='string'||state.opSeen.indexOf(op.id)>=0)return;
      state.opSeen.push(op.id); if(state.opSeen.length>150)state.opSeen.shift();
      applyPhoneOp(p.key,op);
    });
  });
  Object.keys(state.claims).forEach(function(pid){var k=state.claims[pid]; if(/^(p|l):/.test(k)&&!active[k]){delete state.claims[pid];changed=true;}});
  if(changed){persist();render();} else if(newcomer)liveSoon();
  if(peers.length!==lastPhoneCount){lastPhoneCount=peers.length; if(shellMode==='dm'&&!testMode){renderTop();renderParty();renderDrawer();}}
}

