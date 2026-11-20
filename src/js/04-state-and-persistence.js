/* ================================================================
   4. State and persistence
   The saved state, loading, saving, undo snapshots.
   ================================================================ */

var LIB_OK=false;
function fresh(){return {v:2,libV:2,stars:[],folders:[],folderOf:{},rev:0,ep:uid(),party:[],library:[],encounters:[],encName:null,encCamp:null,images:{},claims:{},opSeen:[],combatants:[],round:0,started:false,paused:false,rfi:false,turnId:null,seq:0,
  settings:{trackPC:true,trackNPC:true,pcHp:'exact',npcHp:'status',autoStats:false,cardMode:'scroll',crowd:'shrink',skin:'spark',skinV:2,fontSize:'normal',reactionReset:'turn',rxShow:'pc',acShow:'default',imgShow:'on',phoneEdit:true,tvQr:false,sfxTv:true,sfxDm:false,sfxVol:'med',sfxTurn:true,sfxHit:true,sfxEnd:true,sfxCond:true,sfxTimer:true,fxFlash:true,fxNums:'pc',cbMarks:false,showNames:true},
  timer:{mode:'off',secs:60,showPlayers:true,elapsed:0,startedAt:null,running:false}};}

/* Fills in whatever a saved table is missing. Local saves and the account copy both come through here,
   so a new saved field needs its default in this one place. */
var LIST_FIELDS=['party','library','encounters','combatants','stars','folders','opSeen','spellRecent'], MAP_FIELDS=['folderOf','images','claims','spellOpt'];
function normalise(s){
  var out=Object.assign(fresh(),s);
  out.settings=Object.assign(fresh().settings,s.settings||{});
  out.timer=Object.assign(fresh().timer,s.timer||{});
  LIST_FIELDS.forEach(function(k){out[k]=out[k]||[];});
  MAP_FIELDS.forEach(function(k){out[k]=out[k]||{};});
  if(LIB_OK)libMigrate(out);
  return out;
}

function load(){
  var raw=lsGet(KEY);
  if(DEMO&&demoIsDmView()){var dd=demoData(); if(dd){raw=dd; lsSet(KEY,dd);}}
  else if(betaAcct&&!raw&&betaAcct.seed==='sample'){var bd=demoData(); if(bd){raw=bd; lsSet(KEY,bd);}}   /* a test account's first visit */
  if(!raw) raw=memStore;
  if(raw){ try{
    var s=JSON.parse(raw), out=normalise(s);
    pruneImages(out);
    if(!(s.settings&&s.settings.skinV)){out.settings.skinV=2; if(!s.settings||!s.settings.skin||s.settings.skin==='slate')out.settings.skin='spark';}   /* Spark replaced Slate as the factory look */
    if(out.settings.skin==='chalk')out.settings.skin='slate';   /* Chalkboard was retired: Underdark is the closest dark skin */
    if(SKINS_OK.indexOf(out.settings.skin)<0)out.settings.skin='spark';
    return out;
  }catch(e){} }
  return fresh();
}

var state=load();

function pruneImages(st){
  var used={}; function mark(o){if(o&&o.sheet&&o.sheet.img)used[o.sheet.img]=1;}
  (st.party||[]).forEach(mark); (st.library||[]).forEach(mark); (st.combatants||[]).forEach(mark);
  Object.keys(st.images||{}).forEach(function(k){if(!used[k])delete st.images[k];});
}

function snap(){var im=state.images; state.images=undefined; var out=JSON.stringify(state); state.images=im; return out;}

function readImage(file,cb){
  var fr=new FileReader();
  fr.onload=function(){
    var im=new Image();
    im.onload=function(){
      var max=640, k=Math.min(1,max/Math.max(im.width,im.height)), cv=document.createElement('canvas');
      cv.width=Math.max(1,Math.round(im.width*k)); cv.height=Math.max(1,Math.round(im.height*k));
      cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);
      var url=file.type==='image/png'?cv.toDataURL('image/png'):cv.toDataURL('image/jpeg',.82);
      if(url.length>200000){   /* keep every picture small enough to save to the account */
        var c2=document.createElement('canvas'); c2.width=cv.width; c2.height=cv.height;
        var x2=c2.getContext('2d'); x2.fillStyle='#fff'; x2.fillRect(0,0,c2.width,c2.height); x2.drawImage(cv,0,0);
        url=c2.toDataURL('image/jpeg',.7);
      }
      cb(url);
    };
    im.src=fr.result;
  };
  fr.readAsDataURL(file);
}

function persist(){
  state.rev=(state.rev||0)+1;
  if(testMode)return;
  var raw=JSON.stringify(state); memStore=raw; liveSoon(); Cloud.soon(); pushMonitor(raw);
  lsSet(KEY,raw);
  try{if(bc)bc.postMessage({t:Date.now()});}catch(e){}
}

/* Which face this device shows. Precedence: a choice made in this session, then the link's
   ending (#monitor, #player, #dm; the old #players and #phone still work), then the choice
   remembered on this device, then the default. Anyone who is not the owner only ever gets the
   Player screen. The remembered choice exists because the Claude app can drop a link's ending. */
function viewHash(){return ({monitor:'monitor',players:'monitor',player:'player',phone:'player',dm:'dm'})[(location.hash||'').replace('#','').toLowerCase()]||'';}
function currentView(){
  if(ui.forcePhone)return 'player';
  if(window.__BM_VIEW)return window.__BM_VIEW;   /* set by the DM window on a Combat Monitor window it built */
  if(ui.viewOverride)return ui.viewOverride;
  var h=viewHash(); if(h)return h;
  var v=lsGet('bm-view')||'';
  return (v==='monitor'||v==='player')?v:'dm';
}
function isPlayerWindow(){return currentView()==='monitor';}   /* "player window" is the Combat Monitor */
function setView(v){
  ui.viewOverride=v; ui.viewMenu=false;
  lsSet('bm-view',v==='dm'?'':v);
  shellMode=null; render();
}

function byId(id){return state.combatants.find(function(c){return c.id===id;});}

function cmp(a,b){return (b.init-a.init)||(a.seq-b.seq);}

