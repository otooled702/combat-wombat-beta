/* ================================================================
   24. End-combat confirmation
   ================================================================ */

function doEndCombat(){
  mutate(function(){state.started=false;state.paused=false;state.round=0;state.turnId=null;state.timer.running=false;state.timer.elapsed=0;state.timer.startedAt=null;state.combatants.forEach(function(x){x.conditions=[];x.temp=0;x.acMod=0;resetRx(x);x.ready=null;if(x.leg){x.leg.left=x.leg.max;x.leg.rleft=x.leg.rmax;}(x.members||[]).forEach(function(m){m.temp=0;});});});
}
function encKey(camp,name){return (camp||'').trim().toLowerCase()+'|'+(name||'').trim().toLowerCase();}
function encCampaigns(){var seen={},out=[]; state.encounters.forEach(function(e){var c=(e.campaign||'').trim(); if(c&&!seen[c.toLowerCase()]){seen[c.toLowerCase()]=1;out.push(c);}}); return out.sort(function(a,b){return a.localeCompare(b);});}
function encDefaultName(){return 'Encounter '+(state.encounters.length+1);}
function encSaveNow(name,camp){
  name=(name||'').trim(); camp=(camp||'').trim(); if(!name)return;
  var same=encCampaigns().filter(function(c){return c.toLowerCase()===camp.toLowerCase();})[0]; if(same)camp=same;
  mutate(function(){
    var rec={id:uid(),name:name,campaign:camp,at:Date.now(),round:state.round,started:state.started,turnId:state.turnId,seq:state.seq,combatants:clone(state.combatants)};
    var i=state.encounters.findIndex(function(x){return encKey(x.campaign,x.name)===encKey(camp,name);});
    if(i>=0){rec.id=state.encounters[i].id; state.encounters[i]=rec;} else state.encounters.push(rec);
    state.encName=name; state.encCamp=camp||null; notes.push('Saved encounter \u201c'+name+'\u201d'+(camp?' in '+camp:''));
  });
}
function encOpenNow(id){
  var e=state.encounters.find(function(x){return x.id===id;}); if(!e)return;
  mutate(function(){
    state.combatants=clone(e.combatants); state.round=e.started?(e.round||1):0; state.started=!!e.started&&state.combatants.length>0;
    state.turnId=state.started?(state.combatants.some(function(c){return c.id===e.turnId;})?e.turnId:state.combatants[0].id):null;
    state.paused=false; state.seq=Math.max(state.seq,e.seq||0)+1; state.encName=e.name; state.encCamp=e.campaign||null;
    state.timer.running=false; state.timer.elapsed=0; state.timer.startedAt=null; state.timer.pbc=false;
    notes.push('Opened encounter \u201c'+e.name+'\u201d');
  });
  ui.menu=null; ui.cond=null; ui.ready=null; ui.cardOpen={}; ui.enc=null; renderEnc();
}
function openEnc(mode){ui.enc={mode:mode,name:state.encName||encDefaultName(),camp:state.encCamp||'',replace:false}; renderEnc(); var i=document.querySelector('[data-encname]'); if(i){i.focus(); i.select();}}
function encSummary(e){
  var pcs=0, npcs=0; e.combatants.forEach(function(c){if(c.kind==='pc')pcs++; else npcs+=isGroup(c)?c.members.length:1;});
  return pcs+(pcs===1?' player':' players')+' \u00b7 '+npcs+(npcs===1?' creature':' creatures')+(e.started?' \u00b7 round '+e.round:'')+' \u00b7 '+new Date(e.at).toLocaleDateString();
}
function encRowHTML(e){return '<li class="encrow"><div class="enctxt"><b>'+esc(e.name)+'</b><small>'+esc(encSummary(e))+'</small></div><button type="button" class="btn small primary" data-enc="open" data-id="'+e.id+'">Open</button><button type="button" class="btn small ghost danger" data-enc="del" data-id="'+e.id+'" aria-label="Delete '+esc(e.name)+'">Delete</button></li>';}
function renderEnc(){
  var el=document.getElementById('encwrap'); if(!el)return;
  var E=ui.enc; if(!E){if(el.innerHTML)el.innerHTML='';return;}
  if(E.mode==='save'){
    var nm=(E.name||'').trim();
    el.innerHTML='<div class="scrim open" data-enc="close"></div><div class="qrmodal confmodal encmodal" role="dialog" aria-modal="true" aria-label="Save encounter"><div class="dhead"><h2>'+(state.encName?'Save encounter as':'Save encounter')+'</h2></div><div class="qrbody">'+
      '<form data-encform autocomplete="off"><label class="full">Name<input type="text" data-encname value="'+esc(E.name)+'" required></label>'+
      '<label class="full">Campaign <small>(optional)</small><input type="text" data-enccamp list="enccamps" value="'+esc(E.camp||'')+'" placeholder="No campaign"></label><datalist id="enccamps">'+encCampaigns().map(function(c){return '<option value="'+esc(c)+'"></option>';}).join('')+'</datalist>'+
      (E.replace?'<p class="ph-warn" role="alert">There is already an encounter called \u201c'+esc(nm)+'\u201d'+((E.camp||'').trim()?' in '+esc(E.camp.trim()):'')+'. Replace it?</p>':'<p class="help">Saves everyone in the fight with their health, conditions and turn. A campaign keeps related encounters together when you open them.</p>')+
      '<div class="cloudbtns"><button type="submit" class="btn primary">'+(E.replace?'Replace':'Save')+'</button><button type="button" class="btn ghost" data-enc="close">Cancel</button></div></form></div></div>';
  } else {
    var list=state.encounters.slice().sort(function(a,b){return b.at-a.at;}), groups={}, keys=[];
    list.forEach(function(e){var c=(e.campaign||'').trim(), k=c.toLowerCase(); if(!groups[k]){groups[k]={name:c,items:[]};keys.push(k);} groups[k].items.push(e);});
    keys.sort(function(a,b){if(!a)return 1; if(!b)return -1; return groups[a].name.localeCompare(groups[b].name);});
    var body;
    if(!list.length)body='<p class="help">Nothing saved yet. Use Save in Manage encounter to keep a fight.</p>';
    else if(keys.length===1&&!keys[0])body='<ul class="enclist">'+list.map(encRowHTML).join('')+'</ul>';
    else body=keys.map(function(k){var g=groups[k]; return '<details class="encgrp" open><summary><b>'+esc(g.name||'No campaign')+'</b><small>'+g.items.length+'</small></summary><ul class="enclist">'+g.items.map(encRowHTML).join('')+'</ul></details>';}).join('');
    el.innerHTML='<div class="scrim open" data-enc="close"></div><div class="qrmodal encmodal" role="dialog" aria-modal="true" aria-label="Open encounter"><div class="dhead"><h2>Open encounter</h2><button type="button" class="btn small" data-enc="close">Close</button></div><div class="qrbody">'+
      (state.combatants.length?'<p class="help">Opening replaces the current fight. Undo brings it back.</p>':'')+body+'</div></div>';
  }
}
document.addEventListener('click',function(e){
  if(shellMode!=='dm')return; var t=e.target.closest&&e.target.closest('[data-enc]'); if(!t)return;
  var a=t.dataset.enc;
  if(a==='close'){ui.enc=null; renderEnc();}
  else if(a==='open'){encOpenNow(t.dataset.id);}
  else if(a==='del'){var ev=state.encounters.find(function(x){return x.id===t.dataset.id;}); if(ev){mutate(function(){state.encounters=state.encounters.filter(function(x){return x.id!==ev.id;}); if(state.encName===ev.name&&(state.encCamp||'')===(ev.campaign||''))state.encName=null; notes.push('Deleted encounter \u201c'+ev.name+'\u201d');}); renderEnc();}}
});
document.addEventListener('input',function(e){
  var t=e.target; if(!ui.enc||!t.dataset)return;
  if(t.dataset.encname!==undefined)ui.enc.name=t.value; else if(t.dataset.enccamp!==undefined)ui.enc.camp=t.value; else return;
  if(ui.enc.replace){ui.enc.replace=false; var ae=t.dataset.encname!==undefined?'[data-encname]':'[data-enccamp]', pos=t.selectionStart; renderEnc(); var ni=document.querySelector(ae); if(ni){ni.focus(); try{ni.setSelectionRange(pos,pos);}catch(x){}}}
});
document.addEventListener('submit',function(e){
  var f=e.target; if(!f.hasAttribute||!f.hasAttribute('data-encform')||!ui.enc)return; e.preventDefault();
  var nm=(ui.enc.name||'').trim(), cp=(ui.enc.camp||'').trim(); if(!nm)return;
  var same=encCampaigns().filter(function(c){return c.toLowerCase()===cp.toLowerCase();})[0]; if(same)cp=same;
  var ex=state.encounters.some(function(x){return encKey(x.campaign,x.name)===encKey(cp,nm);});
  if(ex&&encKey(state.encCamp,state.encName)!==encKey(cp,nm)&&!ui.enc.replace){ui.enc.replace=true; renderEnc(); return;}
  ui.enc=null; renderEnc(); encSaveNow(nm,cp);
});
function doClear(){
  mutate(function(){state.combatants=[];state.encName=null;state.encCamp=null;state.started=false;state.paused=false;state.rfi=false;state.round=0;state.turnId=null;state.timer.running=false;state.timer.elapsed=0;state.timer.startedAt=null;});
  ui.menu=null; ui.cond=null; ui.ready=null; if(ui.sheet&&ui.sheet.kind==='c')ui.sheet=null; ui.cardOpen={}; render();
}
function renderConfirm(){
  var el=document.getElementById('confirmwrap'); if(!el)return;
  var C=ui.confirm; if(!C){el.innerHTML='';return;}
  var end=C.kind==='end', clr=C.kind==='clear', nm=esc(C.name||'');
  var ttl=end?'End combat?':(clr?'Start a new encounter?':'Remove '+nm+'?');
  var msg=end?'This stops the round counter and resets everyone for the next fight: conditions, temporary HP, AC changes, reactions and legendary uses. Creatures and their current HP stay as they are. Undo brings it all back.'
    :(clr?'This ends combat and removes everyone from the fight: players, NPCs and monsters. Your saved Party, Saved NPCs and Saved monsters aren\u2019t touched. Use Save first if you want to come back to this fight. Undo brings it all back.'
    :'This takes '+nm+' out of the group. Undo brings it back.');
  el.innerHTML='<div class="scrim open" data-conf="no"></div><div class="qrmodal confmodal" role="alertdialog" aria-modal="true" aria-label="'+ttl+'"><div class="dhead"><h2>'+ttl+'</h2></div>'+
    '<div class="qrbody"><p>'+msg+'</p>'+
    '<div class="cloudbtns"><button type="button" class="btn primary" data-conf="yes">'+(end?'End combat':(clr?'Start new':'Remove'))+'</button><button type="button" class="btn ghost" data-conf="no">'+(end?'Keep fighting':(clr?'Keep them':'Cancel'))+'</button></div></div></div>';
}
document.addEventListener('click',function(e){
  var t=e.target.closest('[data-conf]'); if(!t||!ui.confirm)return;
  var yes=t.dataset.conf==='yes', C=ui.confirm; ui.confirm=null; renderConfirm();
  if(!yes)return;
  if(C.kind==='end')doEndCombat(); else if(C.kind==='clear')doClear();
  else if(C.kind==='rmMember'){ui.rmOK=true; var rb=document.querySelector('[data-id="'+C.id+'"] [data-mid="'+C.mid+'"] [data-act="mRemove"]'); if(rb)rb.click(); else ui.rmOK=false;}
});

