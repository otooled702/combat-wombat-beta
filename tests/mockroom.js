(function(){const O=window.BroadcastChannel; window.BroadcastChannel=function(n){ if(n==='bm-live'){return {postMessage(){},close(){},set onmessage(f){}}} return new O(n); };})();
/*NOLOCAL*/
(function(){
  const OWNER = !!window.__OWNER__, EDITOR = !!window.__EDITOR__, ADMIN = OWNER || EDITOR, UID = window.__UID__ || ('u_'+Math.random().toString(36).slice(2,8));
  const tab = Math.random().toString(36).slice(2,8);
  const ch = new BroadcastChannel('mockroom');
  const others = {};      // peer -> {presence,by}
  let myPres = {};
  const topicHandlers = {}, peerHandlers = [];
  function me(){ return {peer:tab,by:UID,isMe:true,sameTab:true,kind:'viewer',guest:false,presence:myPres,updatedAt:Date.now()}; }
  function peers(){ return [me()].concat(Object.keys(others).map(k=>({peer:k,by:others[k].by,isMe:others[k].by===UID,sameTab:false,kind:'viewer',guest:false,presence:others[k].presence,updatedAt:Date.now()}))); }
  function firePeers(joined){ const p=peers(); peerHandlers.forEach(h=>h({peers:p,joined:joined||[],left:[],updated:[]})); }
  const room = {
    emit(topic,data){
      if(!ADMIN) return Promise.reject({code:'not_permitted',message:'admin only'});
      const s=JSON.stringify(data); if(new TextEncoder().encode(s).length>4096) return Promise.reject({code:'invalid_argument',message:'too big'});
      ch.postMessage({k:'emit',topic,data,peer:tab,by:UID}); return Promise.resolve();
    },
    on(topic,h){ (topicHandlers[topic]=topicHandlers[topic]||[]).push(h); return ()=>{}; },
    presence(patch){ Object.keys(patch).forEach(k=>{ if(patch[k]===null)delete myPres[k]; else myPres[k]=patch[k]; });
      if(JSON.stringify(myPres).length>4096) return Promise.reject({code:'invalid_argument'});
      ch.postMessage({k:'pres',peer:tab,by:UID,presence:JSON.parse(JSON.stringify(myPres))}); firePeers(); return Promise.resolve(); },
    peers(){ return peers(); },
    onPeers(h){ peerHandlers.push(h); setTimeout(()=>h({peers:peers(),joined:peers(),left:[],updated:[]}),0); return ()=>{}; },
    connected(){ return true; }, onConnection(h){ setTimeout(()=>h(true),0); return ()=>{}; },
  };
  ch.onmessage = e => { const m=e.data;
    if(m.k==='emit'){ (topicHandlers[m.topic]||[]).forEach(h=>h({topic:m.topic,data:m.data,peer:m.peer,by:m.by,isMe:m.by===UID,sameTab:false,kind:'viewer',guest:false})); }
    else if(m.k==='pres'){ const isNew=!others[m.peer]; others[m.peer]={presence:m.presence,by:m.by}; if(isNew) ch.postMessage({k:'pres',peer:tab,by:UID,presence:JSON.parse(JSON.stringify(myPres))}); firePeers(isNew?[1]:[]); }
  };
  const user = { isOwner:async()=>OWNER, canEdit:async()=>ADMIN, id:async()=>UID, can:async()=>null, me:async()=>({id:UID,name:'',isOwner:OWNER,canEdit:ADMIN}) };

  // Account database stand-in. Two "devices" are two browser contexts sharing one store held by the test runner.
  // Mirrors the platform rule used at publish: the "dm" path is readable and writable by the owner only.
  function mkdb(){
    const ok = p => ADMIN || !p.startsWith('dm/');   // the 'dm' path: Editors and the owner (read: 'admin', write: 'admin')
    const snapOf = raw => { const d = raw ? JSON.parse(raw) : null; return {id:'', exists:!!d, data:()=>d||undefined, metadata:{fromCache:false,hasPendingWrites:false}}; };
    return { doc(path){ return {
      path, id:path.split('/').pop(),
      async get(){ return snapOf(ok(path) ? await window.__dbget(path) : null); },
      async set(data){ if(!ok(path)) throw {code:'invalid_argument',message:'not allowed'};
        const raw=JSON.stringify(data); if(raw.length>262144) throw {code:'invalid_argument',message:'document too large'};
        await window.__dbset(path, raw); },
      onSnapshot(next){ let last, stop=false; const tick=async()=>{ if(stop) return;
          const raw = ok(path) ? await window.__dbget(path) : null;
          if(raw!==last){ last=raw; next(snapOf(raw)); } setTimeout(tick,150); }; tick(); return ()=>{stop=true;}; } }; } };
  }
  window.claude = { use: async (n)=> n==='room'?room : n==='user'?user : (n==='db'&&window.__DB__)?mkdb() : null };
})();
