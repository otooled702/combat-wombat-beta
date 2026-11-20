/* ================================================================
   25. Clone dialog
   Asks where the clone goes in the order: the same initiative, a fresh roll
   (d20 plus Dexterity, separate for each), or a number the DM types.
   ================================================================ */

function clSetMode(m){
  ui.clone.mode=m;
  document.querySelectorAll('#clonewrap .clopt').forEach(function(o){o.setAttribute('aria-checked',String(o.dataset.v===m));});
  var gl=document.querySelector('#clonewrap .clgroup'); if(gl)gl.hidden=(m!=='same');
}

function renderClone(){
  var el=document.getElementById('clonewrap'); if(!el)return;
  var cl=ui.clone, c=cl&&byId(cl.id);
  if(!c){el.innerHTML='';return;}
  var mod=dexMod(c.sheet), nm=esc(c.name);
  var grpOpt=(c.kind==='npc'&&!isGroup(c))?'<label class="check clgroup"'+(cl.mode==='same'?'':' hidden')+'><input type="checkbox" class="tgl" data-clgroup'+(cl.group!==false?' checked':'')+'>Group in one card with the original</label>':'';
  var opt=function(v,title,sub,extra){return '<div class="clopt" role="radio" tabindex="0" aria-checked="'+(cl.mode===v)+'" data-cl="mode" data-v="'+v+'"><b>'+title+'</b><small>'+sub+'</small>'+(extra||'')+'</div>';};
  el.innerHTML='<div class="scrim open" data-cl="close"></div><div class="qrmodal clmodal" role="dialog" aria-label="Clone '+nm+'"><div class="dhead"><h2>Clone '+nm+'</h2><button type="button" class="btn small" data-cl="close">Cancel</button></div>'+
    '<div class="qrbody"><div class="clopts" role="radiogroup" aria-label="Where in the order">'+
      opt('same','Same initiative','Its own card, right after the original at '+esc(c.init))+
      opt('roll','Roll initiative','d20 '+(mod?sgn(mod)+' from Dexterity':'with no bonus')+', rolled separately for each')+
      opt('enter','Enter initiative','Type the number yourself','<input type="number" step="any" data-clinit placeholder="e.g. 14" value="'+esc(cl.init)+'" aria-label="Initiative for the clone">')+
    '</div>'+grpOpt+'<label class="clqty">How many<input type="number" min="1" max="10" data-clqty value="'+esc(cl.n)+'"></label>'+
    '<div class="cloudbtns"><button type="button" class="btn primary" data-cl="go">Clone</button></div></div></div>';
}

function doClone(){
  var cl=ui.clone, c=cl&&byId(cl.id); if(!c){ui.clone=null;renderClone();return;}
  var n=Math.max(1,Math.min(10,parseInt(cl.n,10)||1)), typed=num(cl.init);
  if(cl.mode==='enter'&&typed==null){toast('Enter an initiative number');return;}
  ui.clone=null; renderClone();
  mutate(function(){
    if(cl.mode==='same'&&cl.group!==false&&c.kind==='npc'&&!isGroup(c)){
      var gb=baseName(c.name).replace(/\s+\(copy( \d+)?\)$/i,''), gm=c.name.match(/\s(\d+)$/), g1=gm?parseInt(gm[1],10):1, gx=c.maxHp!=null?c.maxHp:c.hp, gu=[g1], gi;
      c.members=[{id:uid(),n:g1,hp:c.hp,maxHp:c.maxHp,temp:c.temp||0,rx:!!c.rx}];
      c.hp=null; c.maxHp=null; c.temp=0; c.rx=false; c.name=gb;
      for(gi=0;gi<n;gi++){var gn=Math.max.apply(null,gu)+1; gu.push(gn); c.members.push({id:uid(),n:gn,hp:gx==null?null:gx,maxHp:gx==null?null:gx,temp:0,rx:false});}
      notes.push('Added '+n+' to the '+gb+' group at initiative '+c.init);
      return;
    }
    var base=baseName(c.name).replace(/\s+\(copy( \d+)?\)$/i,'');
    if(c.kind==='npc'&&c.name===base)c.name=base+' 1';
    var nms=[], inits=[], i;
    if(c.kind==='npc')nms=numberedNames(base,n); else for(i=0;i<n;i++)nms.push(base+' (copy'+(i?' '+(i+1):'')+')');
    nms.forEach(function(nm){
      var ini=cl.mode==='same'?c.init:(cl.mode==='enter'?typed:rollInit(c.sheet).t); inits.push(ini);
      var lg=c.leg?{max:c.leg.max,left:c.leg.max,rmax:c.leg.rmax,rleft:c.leg.rmax}:null;
      if(isGroup(c))addCombatant({name:nm,kind:'npc',disp:c.disp,init:ini,hidden:c.hidden,sheet:c.sheet,members:c.members.map(function(m){return {id:uid(),n:m.n,hp:m.maxHp,maxHp:m.maxHp,temp:0,rx:false};})});
      else addCombatant({name:nm,player:c.player,kind:c.kind,init:ini,hp:c.maxHp!=null?c.maxHp:c.hp,maxHp:c.maxHp,hidden:c.hidden,partyId:null,sheet:c.sheet,leg:lg,disp:c.disp});
    });
    notes.push('Cloned '+nms.join(', ')+(cl.mode==='same'?' at initiative '+c.init:' at initiative '+inits.join(', ')));
  });
}

document.addEventListener('click',function(e){
  var t=e.target.closest('[data-cl]'); if(!t||!ui.clone)return;
  var a=t.dataset.cl;
  if(a==='close'){ui.clone=null;renderClone();return;}
  if(a==='mode'){clSetMode(t.dataset.v); if(t.dataset.v==='enter'){var i=document.querySelector('[data-clinit]'); if(i&&e.target!==i)i.focus();} return;}
  if(a==='go')doClone();
});
document.addEventListener('focusin',function(e){if(ui.clone&&e.target.dataset&&e.target.dataset.clinit!==undefined)clSetMode('enter');});
document.addEventListener('input',function(e){
  var t=e.target; if(!ui.clone||!t.dataset)return;
  if(t.dataset.clinit!==undefined)ui.clone.init=t.value;
  if(t.dataset.clqty!==undefined)ui.clone.n=t.value;
  if(t.dataset.clgroup!==undefined)ui.clone.group=t.checked;
});
document.addEventListener('keydown',function(e){
  var t=e.target; if(!ui.clone||!t.dataset)return;
  if(e.key==='Enter'&&(t.dataset.clinit!==undefined||t.dataset.clqty!==undefined)){e.preventDefault();doClone();return;}
  if((e.key==='Enter'||e.key===' ')&&t.dataset.cl==='mode'&&t.tagName!=='INPUT'){e.preventDefault();clSetMode(t.dataset.v);}
});

