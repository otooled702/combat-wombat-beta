/* ================================================================
   7. Change tracking
   mutate() wraps every change: undo snapshot, bookkeeping, save, render.
   ================================================================ */

function mutate(fn){
  undoStack.push(snap()); if(undoStack.length>40)undoStack.shift();
  notes=[]; fn();
  state.combatants.sort(cmp);
  state.combatants.forEach(ensureDeath);
  state.combatants.forEach(function(c){
    if(c.kind==='pc'&&c.partyId){var p=partyById(c.partyId);
      if(p){p.hp=c.hp; if(c.maxHp!=null)p.maxHp=c.maxHp; if(c.sheet)p.sheet=clone(c.sheet);}}
  });
  persist();
  if(notes.length)toast(notes.join(' \u00b7 '));
  render();
}

function undo(){
  if(!undoStack.length)return;
  var settings=state.settings, timer=state.timer, images=state.images, rev=state.rev, ep=state.ep; state=JSON.parse(undoStack.pop()); state.settings=settings; state.timer=timer; state.images=images; state.rev=rev; state.ep=ep;
  persist(); toast('Undid last change'); render();
  if(ui.lib&&ui.lib.open)renderLib();   // render() leaves the Library window alone; Undo from its toast must show the result
}

function toast(msg,undoable){
  if(testMode)return;
  toastEl.innerHTML=esc(msg)+(undoable?' <button type="button" class="toastbtn" data-act="undo">Undo</button>':'');
  toastEl.classList.add('show'); toastEl.classList.toggle('act',!!undoable);
  clearTimeout(toastTimer); toastTimer=setTimeout(function(){toastEl.classList.remove('show','act');},undoable?6500:3800);
}

