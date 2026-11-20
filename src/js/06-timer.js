/* ================================================================
   6. Timer
   Turn timer shared with the display.
   ================================================================ */

function timerMs(){var t=state.timer;return t.elapsed+(t.running&&t.startedAt?Date.now()-t.startedAt:0);}

/* Start or stop the clock, keeping the time already counted. */
function timerRun(on){var t=state.timer; if(on){t.running=true;t.startedAt=Date.now();}else{t.elapsed=timerMs();t.running=false;t.startedAt=null;}}

function timerReset(){var t=state.timer;t.elapsed=0;if(state.paused){t.startedAt=null;t.running=false;t.pbc=true;}else{t.startedAt=Date.now();t.running=true;t.pbc=false;}}

function timerInfo(){
  var t=state.timer, e=timerMs()/1000;
  if(t.mode==='down'){var r=Math.max(0,Math.ceil(t.secs-e)); return {text:fmt(r),low:r>0&&r<=10,over:r===0,paused:!t.running};}
  return {text:fmt(Math.floor(e)),low:false,over:false,paused:!t.running};
}

function tick(){
  if(shellMode!=='phone')Sfx.timer(isPlayerWindow()?'tv':'dm');
  if(state.timer.mode==='off'||!state.started)return;
  var els=document.querySelectorAll('[data-timer]'); if(!els.length)return;
  var i=timerInfo();
  els.forEach(function(el){
    if(el.textContent!==i.text)el.textContent=i.text;
    el.classList.toggle('low',i.low); el.classList.toggle('over',i.over); el.classList.toggle('paused',i.paused);
  });
}

setInterval(tick,250);

