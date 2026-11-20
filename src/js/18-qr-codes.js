/* ================================================================
   18. QR codes
   Join codes for the Combat Monitor and the Player screens.
   ================================================================ */

function pageLink(){return (state.settings.link||DEFAULT_LINK).replace(/#.*$/,'');}

function qrSvg(text){
  if(!window.qrcode)return '';
  try{var q=window.qrcode(0,'M'); q.addData(text); q.make(); return q.createSvgTag({cellSize:6,margin:2,scalable:true});}catch(e){return '';}
}

function renderQr(){
  var el=document.getElementById('qrwrap'); if(!el)return;
  document.body.classList.toggle('qropen',!!ui.qrOpen);
  if(!ui.qrOpen){el.innerHTML='';return;}
  var base=pageLink(), items=[['Player screens','#player','Players scan this and pick their character.'],['Combat Monitor','#monitor','For the TV or second monitor. If it opens the DM screen instead, choose View \u2192 Combat Monitor once on that device.']];
  el.innerHTML='<div class="scrim open" data-act="qrClose"></div><div class="qrmodal" role="dialog" aria-label="QR codes"><div class="dhead"><h2>QR codes</h2><button type="button" class="btn small" id="qrClose" data-act="qrClose">Done</button></div>'+
    '<div class="qrbody"><label class="qrlink">Page link<input type="text" data-qrlink value="'+esc(base)+'" spellcheck="false"></label>'+
    '<div class="qrgrid">'+items.map(function(it){var svg=qrSvg(base+it[1]); return '<figure class="qrcard"><div class="qrbox">'+(svg||'<span class="ph-note">The QR maker didn\u2019t load. Use the link below instead.</span>')+'</div><figcaption><b>'+it[0]+'</b><small>'+esc(base+it[1])+'</small><span>'+it[2]+'</span></figcaption></figure>';}).join('')+'</div>'+
    '<p class="help">Players need to be invited to this page and signed in. Share it from the page\u2019s Share menu first.</p></div></div>';
}

