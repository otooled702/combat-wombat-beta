/* ================================================================
   27c. Beta test accounts
   Only in the beta build (BETA, set by build.py). Real sign-in needs a server, which doesn't exist yet,
   so the beta offers fixed test accounts instead. They live only in this browser, anyone can use them,
   and each keeps its own table under its own storage key. The free account behaves like the demo.
   ================================================================ */

/* A function, not a var: 01- reads the current account before this file's vars are set. */
function betaAccounts(){return [
  {id:'sam',name:'Sam Rivera',email:'sam.yearly@example.com',plan:'year',seed:'sample',
   about:'Yearly subscriber with a campaign under way: a party, two saved encounters and starred creatures.'},
  {id:'riley',name:'Riley Chen',email:'riley.monthly@example.com',plan:'month',seed:'empty',
   about:'Monthly subscriber, brand new: an empty table to set up from scratch.'},
  {id:'casey',name:'Casey Moreno',email:'casey.free@example.com',plan:'free',seed:'sample',
   about:'No subscription: works like the public demo. Nothing is saved, and saving opens Subscribe.'}
];}
/* functions, not vars: 01- asks for the account before this file's vars are set */
function betaAcctKey(){return 'cw-beta-account';}
function betaCurrent(){var id=lsGet(betaAcctKey()); return betaAccounts().filter(function(a){return a.id===id;})[0]||null;}
function betaPlanLabel(p){return p==='year'?'Yearly plan':p==='month'?'Monthly plan':'No subscription';}
function betaInitials(n){return n.split(/\s+/).map(function(w){return w.charAt(0);}).join('').slice(0,2).toUpperCase();}

/* ---------- the sign-in screen (no account picked yet) ---------- */
function betaSignInScreen(){
  shellMode='signin'; applyTheme(); document.body.className='betasignin';
  app.innerHTML='<main class="betasign"><div class="betacard">'+
    '<div class="betabrand">'+logoSVG('', 'Combat Wombat')+'<span class="bword">combat wombat</span><span class="betatag">Beta</span></div>'+
    '<h1>Pick a test account</h1>'+
    '<p class="betalead">Real sign-in comes later. These test accounts live only in this browser and anyone can use them, so don’t put anything private in them.</p>'+
    '<ul class="betalist">'+betaAccounts().map(function(a){
      return '<li><button type="button" class="betapick" data-beta="pick" data-id="'+a.id+'">'+
        '<span class="betaav" aria-hidden="true">'+betaInitials(a.name)+'</span>'+
        '<span class="betawho"><b>'+esc(a.name)+'</b><small>'+esc(a.email)+'</small>'+
        '<span class="betaplan p-'+a.plan+'">'+betaPlanLabel(a.plan)+'</span>'+
        '<span class="betaabout">'+esc(a.about)+'</span></span></button></li>';}).join('')+'</ul>'+
    '<p class="betaver">Version '+esc(APP_VERSION)+'</p></div></main>';
  var f=app.querySelector('.betapick'); if(f)f.focus();
}

/* ---------- the account row at the bottom of the left menu ---------- */
function betaRender(){
  var el=document.getElementById('betaacct'); if(!el||!betaAcct)return;
  if(!el.dataset.on){
    el.dataset.on='1'; var a=betaAcct;
    el.innerHTML='<button type="button" class="betabtn" data-beta="menu" aria-haspopup="menu" aria-expanded="false" aria-controls="betamenu" title="Test account: '+esc(a.name)+'">'+
      '<span class="betaav" aria-hidden="true">'+betaInitials(a.name)+'</span>'+
      '<span class="betawho nl"><b>'+esc(a.name)+'</b><small>'+betaPlanLabel(a.plan)+' · test account</small></span></button>'+
      '<div class="betamenu" id="betamenu" role="menu" aria-label="Test account" hidden>'+
      '<p class="betainfo">'+esc(a.email)+'<br>Saved in this browser only<br>Version '+esc(APP_VERSION)+'</p>'+
      '<button type="button" role="menuitem" class="betamitem" data-beta="reset">Reset this account</button>'+
      '<button type="button" role="menuitem" class="betamitem" data-beta="switch">Switch account</button></div>';
  }
}
function betaMenu(open){
  var b=document.querySelector('#betaacct .betabtn'), m=document.getElementById('betamenu'); if(!b||!m)return;
  m.hidden=!open; b.setAttribute('aria-expanded',open?'true':'false');
  if(open){var f=m.querySelector('.betamitem'); if(f)f.focus();}
}
function betaForget(){
  /* this account's table, its live snapshot and its claimed character */
  try{[KEY,SNAP_KEY,CLAIM_KEY].forEach(function(k){localStorage.removeItem(k);});}catch(e){}
}
if(BETA){
  document.addEventListener('click',function(e){
    var t=e.target; if(!t||!t.closest)return;
    var b=t.closest('[data-beta]');
    if(!b){var m=document.getElementById('betamenu'); if(m&&!m.hidden&&!t.closest('#betaacct'))betaMenu(false); return;}
    switch(b.dataset.beta){
      case 'pick':lsSet(betaAcctKey(),b.dataset.id); location.reload(); break;
      case 'menu':var mm=document.getElementById('betamenu'); betaMenu(mm&&mm.hidden); break;
      case 'reset':
        if(window.confirm('Reset '+betaAcct.name+'’s test account? Its table goes back to how it started.')){betaForget(); location.reload();}
        break;
      case 'switch':try{localStorage.removeItem(betaAcctKey());}catch(x){} location.reload(); break;
    }
  });
  document.addEventListener('keydown',function(e){
    var m=document.getElementById('betamenu');
    if(e.key==='Escape'&&m&&!m.hidden){e.preventDefault(); e.stopImmediatePropagation(); betaMenu(false); var b=document.querySelector('#betaacct .betabtn'); if(b)b.focus();}
  },true);
}
