/* ================================================================
   3. Runtime handles and UI state
   DOM handles and the throwaway UI state that is never saved.
   ================================================================ */

var app=document.getElementById('app'), toastEl=document.getElementById('toast');

var testMode=false, memStore=null, notes=[], undoStack=[], toastTimer=null, shellMode=null;
if(window.__BM_VIEW&&window.opener){try{memStore=window.opener.__bmRaw();}catch(e){}}   /* a monitor window starts from the DM window's table */

var lastNowId=null, bannerTimer=null;

var ui={owner:true,viewOverride:'',viewMenu:false,forcePhone:false,settingsOpen:false,mdelta:{},cinfo:{},cond:null,ready:null,libGroup:false,sheet:null,rosterInit:{},delta:{},libInit:{},libQty:{},editParty:null,preview:false,scrollNow:false};

var bc=null; try{bc=new BroadcastChannel(KEY);}catch(e){}

