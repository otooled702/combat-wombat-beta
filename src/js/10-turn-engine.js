/* ================================================================
   10. Turn engine
   Order, rounds, expiring conditions, readied actions.
   ================================================================ */

function turnIdx(){return state.combatants.findIndex(function(c){return c.id===state.turnId;});}

function after(x,k){return x.init<k.init||(x.init===k.init&&x.seq>=k.seq);}

function startTurnEffects(x){
  if(state.settings.reactionReset!=='round')resetRx(x);
  if(x.ready){notes.push(x.name+'\u2019s readied action expired');x.ready=null;}
  if(x.leg)x.leg.left=x.leg.max;
  if(isSide(x)&&x.death&&!x.death.stable&&!x.death.dead)notes.push(x.name+' is dying: roll a death save');
  state.combatants.forEach(function(c){
    c.conditions=c.conditions.filter(function(cd){
      var d=cd.dur;
      if(d.type==='start'&&d.ownerId===x.id){notes.push(cd.name+' ended on '+c.name);endedAdd(c,cd);return false;}
      if(d.type==='end'&&d.ownerId===x.id){d.armed=true;return true;}
      if(d.type==='rounds'&&(state.round>d.round||(state.round===d.round&&after(x,d.key)))){notes.push(cd.name+' ended on '+c.name);endedAdd(c,cd);return false;}
      return true;
    });
  });
}

function endTurnEffects(x){
  state.combatants.forEach(function(c){
    c.conditions=c.conditions.filter(function(cd){
      var d=cd.dur;
      if(d.type==='end'&&d.ownerId===x.id&&d.armed){notes.push(cd.name+' ended on '+c.name);endedAdd(c,cd);return false;}
      return true;
    });
  });
}

function beginTurn(c){state.turnId=c.id;startTurnEffects(c);timerReset();autoSheet(c);ui.scrollNow=true;}

function newRound(){
  state.round++;
  if(state.settings.reactionReset==='round')state.combatants.forEach(resetRx);
}

function nextTurn(){
  mutate(function(){
    var L=state.combatants; if(!L.length)return;
    bumpEnded();
    if(!state.started){
      state.started=true;state.round=1;state.rfi=false;
      L.forEach(function(c){resetRx(c);c.ready=null;if(c.leg)c.leg.left=c.leg.max;});
      beginTurn(L[0]);return;
    }
    var idx=turnIdx();
    if(idx>=0){
      endTurnEffects(L[idx]);
      L.forEach(function(c,j){if(j!==idx&&c.leg&&c.leg.max>0&&c.leg.left>0)notes.push('Legendary: '+c.name+' has '+c.leg.left+' left');});
    }
    var ni=idx+1;
    if(ni>=L.length){ni=0;newRound();}
    beginTurn(L[ni]);
  });
}

function prevTurn(){
  mutate(function(){
    if(!state.started)return;
    bumpEnded();
    var L=state.combatants, idx=turnIdx();
    var pi=idx-1;
    if(pi<0){
      if(state.round<=1){notes.push('Already at the first turn');return;}
      pi=L.length-1; state.round--;
    }
    var c=L[pi]; state.turnId=c.id; timerReset(); autoSheet(c); ui.scrollNow=true;
    notes.push('Back to '+c.name+'\u2019s turn');
  });
}

function removeInner(id){
  var L=state.combatants, i=L.findIndex(function(c){return c.id===id;}); if(i<0)return;
  L.splice(i,1);
  if(ui.sheet&&ui.sheet.kind==='c'&&ui.sheet.id===id)ui.sheet=null;
  L.forEach(function(c){c.conditions=c.conditions.filter(function(cd){if(cd.dur.ownerId===id){endedAdd(c,cd);return false;}return true;});});
  if(state.started){
    if(!L.length){state.started=false;state.round=0;state.turnId=null;state.timer.running=false;state.timer.elapsed=0;state.timer.startedAt=null;}
    else if(state.turnId===id){
      var ni=i; if(ni>=L.length){ni=0;newRound();}
      beginTurn(L[ni]);
    }
  }
}

/* The creature whose turn comes right after the current one. skipHidden is what the table can see. */
function nextTurnId(skipHidden){
  if(!state.started)return null;
  var L=state.combatants, i=turnIdx(); if(i<0)return null;
  for(var k=1;k<=L.length;k++){var c=L[(i+k)%L.length]; if(c.id===state.turnId)return null; if(!skipHidden||!c.hidden)return c.id;}
  return null;
}
function readyWord(id,skipHidden){return id&&id===nextTurnId(skipHidden)?'Up next':'Get ready';}
function nextPcId(){
  if(!state.started)return null;
  var L=state.combatants, i=turnIdx(); if(i<0)return null;
  for(var k=1;k<=L.length;k++){
    var c=L[(i+k)%L.length];
    if(isSide(c)&&!c.hidden) return c.id===state.turnId?null:c.id;
  }
  return null;
}

/* Builds a condition for creature c from the panel's fields. "self" (the module's default) means the
   duration is measured on the creature's own turn. */
function makeCond(c,f,name){
  var own=(!f.owner||f.owner==='self')?c.id:f.owner, dur={type:'manual'};
  if(f.dur==='start')dur={type:'start',ownerId:own};
  else if(f.dur==='end')dur={type:'end',ownerId:own,armed:false};
  else if(f.dur==='rounds'){
    var n=Math.max(1,parseInt(f.n,10)||1), cur=state.started?byId(state.turnId):null;
    dur={type:'rounds',n:n,round:(state.started?state.round:1)+n,key:cur?{init:cur.init,seq:cur.seq}:{init:Infinity,seq:-1}};
  }
  return {id:uid(),name:name,level:name==='Exhaustion'?parseInt(f.level,10)||1:null,dur:dur};
}

function addCondition(cid,f){
  var c=byId(cid); if(!c)return;
  var name=f.name==='Custom'?(f.custom||'').trim():f.name; if(!name)return;
  var cd=makeCond(c,f,name);
  mutate(function(){
    c.conditions=c.conditions.filter(function(x){return x.name!==name;});
    c.conditions.push(cd);
  });
}

