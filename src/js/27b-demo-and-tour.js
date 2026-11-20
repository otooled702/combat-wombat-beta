/* ================================================================
   27b. Demo and tour
   Only active in the demo build (DEMO, set by build.py). The DM screen opens on a sample fight every
   time, nothing is kept, a banner says so, saving opens the Subscribe window, and a short tour
   points at the main features. Clicks use data-demo="name" so they stay out of the DM switch.
   ================================================================ */

var DEMO_PRICE={month:'$5.99',year:'$50',yearPerMonth:'$4.17',saving:'30%'};
var DEMO_CHECKOUT={month:'',year:''};   /* checkout links go here once payments exist */
var DEMO_TOUR_KEY='cw-demo-toured';

/* The DM screen of the demo always starts from the sample table; the Monitor window and phone tabs
   read whatever the DM screen is showing. */
function demoIsDmView(){
  if(window.__BM_VIEW)return false;
  return !/^#(monitor|players?|phone|player|selftest)/i.test(location.hash||'');
}
function demoData(){
  var el=document.getElementById('demodata'), t=el&&el.textContent?el.textContent.trim():'';
  return (t&&t!=='null')?t:null;
}

/* ---------- the banner ---------- */
function demoRender(){
  if(!DEMO)return;
  var bar=document.getElementById('demobar');
  if(bar&&!bar.dataset.on){
    bar.dataset.on='1'; bar.hidden=false;
    bar.innerHTML='<span class="demotag">Demo</span><span class="demotxt">Try everything. Nothing is saved: reloading starts this fight again.</span>'+
      '<span class="demobtns"><button type="button" class="btn small" data-demo="tour">Take the tour</button>'+
      '<button type="button" class="btn small primary" data-demo="subscribe">Subscribe</button></span>';
  }
  if(ui.tour!=null)tourPlace();
}

/* ---------- Subscribe window ---------- */
function payOpen(reason){
  var prev=ui.pay; ui.pay={reason:reason||'',plan:prev&&prev.plan||'year',back:document.activeElement};
  payRender(); var f=document.querySelector('#paywrap .payplan[aria-checked=true]'); if(f)f.focus();
}
function payClose(){
  var back=ui.pay&&ui.pay.back; ui.pay=null; payRender();
  if(back&&back.isConnected&&back.focus)back.focus({preventScroll:true});
}
function payRender(){
  var w=document.getElementById('paywrap');
  if(!ui.pay){if(w)w.remove(); return;}
  if(!w){w=document.createElement('div'); w.id='paywrap'; document.body.appendChild(w);}
  var P=ui.pay, y=P.plan==='year', plan=function(v,name,price,per,note){var on=P.plan===v;
    return '<button type="button" role="radio" aria-checked="'+on+'" class="payplan" data-demo="plan" data-v="'+v+'" tabindex="'+(on?0:-1)+'">'+
      '<b>'+name+'</b><span class="payprice">'+price+'<small>'+per+'</small></span><span class="paynote">'+note+'</span></button>';};
  w.innerHTML='<div class="scrim open" data-demo="payclose"></div><div class="qrmodal paymodal" role="dialog" aria-modal="true" aria-labelledby="payTitle">'+
    '<div class="dhead"><h2 id="payTitle">Keep your table</h2><button type="button" class="btn iconbtn" data-demo="payclose" aria-label="Close">'+ICONS.close+'</button></div>'+
    '<div class="qrbody paybody">'+
    '<p class="payreason">'+(P.reason?esc(P.reason)+' is part of the full Combat Wombat. ':'')+'In this demo nothing is saved.</p>'+
    '<div class="payplans" role="radiogroup" aria-label="Plan">'+
      plan('year','Yearly',DEMO_PRICE.year,' a year','About '+DEMO_PRICE.yearPerMonth+' a month: '+DEMO_PRICE.saving+' less')+
      plan('month','Monthly',DEMO_PRICE.month,' a month','Billed every month')+'</div>'+
    '<ul class="payfeat">'+['Your party, encounters and campaigns, saved','On every device you sign in to','Your own creatures, NPCs and pictures','Every skin, and new ones as they arrive']
      .map(function(t){return '<li><span class="payck" aria-hidden="true">✓</span>'+t+'</li>';}).join('')+'</ul>'+
    '<div class="paybtns"><button type="button" class="btn primary" data-demo="paygo">Subscribe for '+(y?DEMO_PRICE.year+' a year':DEMO_PRICE.month+' a month')+'</button>'+
    '<button type="button" class="btn ghost" data-demo="payclose">Keep trying the demo</button></div></div></div>';
}

/* Saving is what the subscription is for: in the demo these open the Subscribe window instead. */
var DEMO_GATES=[
  ['[data-act=encSave],[data-act=encSaveAs]','Saving encounters'],
  ['[data-act=saveLib],[data-mm=star],[data-mm=stdstar],[data-cfgo],[data-mm=fnew],[data-mm=tofolder]','Saving creatures and NPCs to your Library'],
  ['.filebtn','Pictures on cards'],
  ['[data-act^=cloud]','Saving to your account']
];
function demoGate(t){
  for(var i=0;i<DEMO_GATES.length;i++)if(t.closest(DEMO_GATES[i][0]))return DEMO_GATES[i][1];
  return null;
}
if(DEMO){
  document.addEventListener('click',function(e){
    var t=e.target; if(!t||!t.closest)return;
    var why=demoGate(t);
    if(why){e.preventDefault(); e.stopImmediatePropagation(); payOpen(why); return;}
    var b=t.closest('[data-demo]'); if(!b)return;
    switch(b.dataset.demo){
      case 'subscribe':payOpen(''); break;
      case 'payclose':payClose(); break;
      case 'plan':ui.pay.plan=b.dataset.v; payRender(); var pb=document.querySelector('#paywrap [data-v="'+b.dataset.v+'"]'); if(pb)pb.focus(); break;
      case 'paygo':var url=DEMO_CHECKOUT[ui.pay.plan]; if(url)window.open(url,'_blank','noopener'); else toast('Checkout isn’t connected yet: this is the demo.'); break;
      case 'tour':tourStart(); break;
      case 'tournext':tourGo(1); break;
      case 'tourback':tourGo(-1); break;
      case 'tourend':tourEnd(); break;
    }
  },true);
  document.addEventListener('submit',function(e){
    var f=e.target; if(f&&f.querySelector&&f.querySelector('[data-cfgo]')){e.preventDefault(); e.stopImmediatePropagation(); payOpen('Saving creatures and NPCs to your Library');}
  },true);
  document.addEventListener('keydown',function(e){
    if(ui.pay){
      if(e.key==='Escape'){e.preventDefault(); e.stopImmediatePropagation(); payClose(); return;}
      var t=e.target;
      if(t&&t.classList&&t.classList.contains('payplan')&&/^Arrow(Left|Right|Up|Down)$/.test(e.key)){
        e.preventDefault(); ui.pay.plan=ui.pay.plan==='year'?'month':'year'; payRender();
        var nb=document.querySelector('#paywrap .payplan[aria-checked=true]'); if(nb)nb.focus();
      }
      return;
    }
    if(ui.tour!=null&&e.key==='Escape'){e.preventDefault(); e.stopImmediatePropagation(); tourEnd();}
  },true);
  window.addEventListener('resize',function(){if(ui.tour!=null)tourPlace();});
  window.addEventListener('scroll',function(){if(ui.tour!=null)tourPlace();},true);
}

/* ---------- tour ---------- */
var TOUR=[
  {t:'Welcome to Combat Wombat',x:'This is a sample fight: four heroes against a goblin ambush. Try anything. Nothing is saved, so you can’t break it.'},
  {s:'#list .row',t:'Everyone in initiative order',x:'Each creature gets a card, in turn order. Players are blue, enemies red. The four goblins share one card.'},
  {s:'#ctlmain [data-act=rfiToggle]',t:'Ask the table to roll',x:'Shows “Roll for initiative!” on the TV and on every player’s phone.'},
  {s:'#dock [data-act=next]',t:'Run the turns',x:'Start combat, then Next turn moves down the order. The Right arrow key does it too, and Undo takes back any mistake.'},
  {s:'#list .row .hpact',t:'Damage and healing',x:'Type a number and press Damage or Heal. Half and double damage are one tap.'},
  {s:'#dock [data-act=targetOpen]',t:'Hit many at once',x:'Fireball the goblins: pick the targets, roll their saves, and apply damage, healing or conditions in one step. Spells set it up for you.'},
  {s:'#lnav [data-nav=monitor]',t:'Put it on the TV',x:'Open the Combat Monitor on a second screen. Big, readable cards show the whole table whose turn it is.'},
  {s:'#lnav [data-act=qrOpen]',t:'Players follow on their phones',x:'Players scan a QR code and pick their character. Their phone buzzes when they’re up next and when it’s their turn.'},
  {s:'#lnav [data-act=libOpen]',t:'331 creatures, 339 spells',x:'The full SRD 5.2 bestiary and spell list. Add a creature to the fight in one tap, with its stats.'},
  {s:'#lnav [data-act=settingsOpen]',t:'Make it yours',x:'Thirteen looks, from Daylight to Watercolor, plus sounds, timers and how much players see.'},
  {s:'#demobar [data-demo=subscribe]',t:'Keep your table',x:'Subscribe to save your party, encounters and creatures, on every device: '+DEMO_PRICE.month+' a month or '+DEMO_PRICE.year+' a year.'}
];
function tourStart(){ui.tour=0; tourRender(true); try{sessionStorage.setItem(DEMO_TOUR_KEY,'1');}catch(e){}}
function tourEnd(){ui.tour=null; tourRender(false);}
function tourGo(d){var n=ui.tour+d; if(n<0)return; if(n>=TOUR.length){tourEnd(); return;} ui.tour=n; tourRender(true);}
function tourTarget(st){
  if(!st.s)return null; var el=document.querySelector(st.s);
  if(!el||!el.getClientRects().length)return null;
  var r=el.getBoundingClientRect(); return (r.width&&r.height)?el:null;
}
function tourRender(focus){
  var w=document.getElementById('tourwrap');
  if(ui.tour==null){if(w)w.remove(); return;}
  if(!w){w=document.createElement('div'); w.id='tourwrap'; document.body.appendChild(w);}
  var i=ui.tour, st=TOUR[i], last=i===TOUR.length-1;
  w.innerHTML='<div class="tourspot" aria-hidden="true"></div>'+
    '<div class="tourpop" role="dialog" aria-modal="false" aria-labelledby="tourTitle" aria-describedby="tourText" tabindex="-1">'+
    '<p class="tourstep">'+(i+1)+' of '+TOUR.length+'</p><h2 id="tourTitle">'+esc(st.t)+'</h2><p id="tourText">'+esc(st.x)+'</p>'+
    '<div class="tourbtns"><button type="button" class="btn small ghost" data-demo="tourend">End tour</button><span class="tourgap"></span>'+
    (i?'<button type="button" class="btn small" data-demo="tourback">Back</button>':'')+
    '<button type="button" class="btn small primary" data-demo="tournext">'+(last?'Finish':(i?'Next':'Show me around'))+'</button></div></div>';
  var el=tourTarget(st);
  if(el){var r=el.getBoundingClientRect(); if(r.top<0||r.bottom>innerHeight)el.scrollIntoView({block:'center'});}
  tourPlace();
  if(focus){var pop=w.querySelector('.tourpop'); if(pop)pop.focus({preventScroll:true});}
}
function tourPlace(){
  var w=document.getElementById('tourwrap'); if(!w||ui.tour==null)return;
  var st=TOUR[ui.tour], el=tourTarget(st), spot=w.querySelector('.tourspot'), pop=w.querySelector('.tourpop'); if(!pop)return;
  var pw=pop.offsetWidth, ph=pop.offsetHeight, m=12, x, y;
  if(!el){spot.hidden=true; x=(innerWidth-pw)/2; y=Math.max(m,(innerHeight-ph)/2);}
  else{
    var r=el.getBoundingClientRect(), pad=6; spot.hidden=false;
    spot.style.left=(r.left-pad)+'px'; spot.style.top=(r.top-pad)+'px'; spot.style.width=(r.width+pad*2)+'px'; spot.style.height=(r.height+pad*2)+'px';
    if(r.bottom+m+ph<=innerHeight-m){y=r.bottom+m+pad; x=r.left;}
    else if(r.top-m-ph>=m){y=r.top-m-pad-ph; x=r.left;}
    else if(r.right+m+pw<=innerWidth-m){x=r.right+m+pad; y=r.top;}
    else {x=r.left-m-pad-pw; y=r.top;}
  }
  x=Math.max(m,Math.min(x,innerWidth-pw-m)); y=Math.max(m,Math.min(y,innerHeight-ph-m));
  pop.style.left=Math.round(x)+'px'; pop.style.top=Math.round(y)+'px';
}

/* First visit in this tab: offer the tour. A reload keeps the fight fresh but doesn't nag again. */
function demoBoot(){
  if(shellMode!=='dm')return;
  var seen=false; try{seen=sessionStorage.getItem(DEMO_TOUR_KEY)==='1';}catch(e){}
  if(!seen)setTimeout(function(){if(ui.tour==null&&!ui.pay)tourStart();},500);
}
