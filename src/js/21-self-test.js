/* ================================================================
   21. Self-test
   Open the page with #selftest to run these rules checks. They run on a scratch
   table, so nothing you have saved is touched.
   ================================================================ */

function runSelfTests(){
  var R=[], keepState=state;
  testMode=true; shellMode='selftest';
  function ok(name,cond,info){R.push({n:name,ok:!!cond,i:cond?'':(info===undefined?'':String(info))});}
  function table(){state=fresh(); notes=[]; undoStack=[]; return state;}
  function pc(name,init,hp){
    var m=hp||24, c=addCombatant({name:name,kind:'pc',init:init,hp:m,maxHp:m,partyId:'p_'+name});
    state.party.push({id:'p_'+name,name:name,player:'P',maxHp:m,hp:m}); state.combatants.sort(cmp); return c;
  }
  function npc(name,init,hp){var c=addCombatant({name:name,kind:'npc',disp:'enemy',init:init,hp:hp,maxHp:hp}); state.combatants.sort(cmp); return c;}
  function turn(){var c=byId(state.turnId); return c&&c.name;}
  function names(){return state.combatants.map(function(c){return c.name;}).join();}
  var a,b,o,h,g,snap,ev;
  try{
    /* turn engine */
    table(); a=pc('Rowan',15); o=npc('Ogre',12,59); b=pc('Alric',9);
    ok('creatures sort by initiative',names()==='Rowan,Ogre,Alric',names());
    nextTurn(); ok('the first turn goes to the top of the order',turn()==='Rowan'&&state.round===1);
    nextTurn(); nextTurn(); ok('turns follow initiative',turn()==='Alric');
    nextTurn(); ok('the order wraps into a new round',turn()==='Rowan'&&state.round===2);
    prevTurn(); ok('previous turn steps back across a round',turn()==='Alric'&&state.round===1);
    table(); a=pc('Rowan',15); o=npc('Ogre',12,59); b=pc('Alric',9); nextTurn(); nextTurn(); removeInner(o.id);
    ok('removing the current creature passes the turn on',turn()==='Alric');

    /* hit points */
    table(); h=pc('Hal',10,20); h.temp=8; hpDamage(h,5);
    ok('temp HP absorbs damage first',h.temp===3&&h.hp===20);
    hpDamage(h,6); ok('damage past temp HP reaches hit points',h.temp===0&&h.hp===17);
    hpHeal(h,99); ok('healing stops at the maximum',h.hp===20);
    hpTemp(h,5); hpTemp(h,3); ok('temp HP keeps the higher value',h.temp===5);
    var band=function(x,m){return hpClass({hp:x,maxHp:m});};
    ok('health bands: 76% healthy, 75% wounded, 50% bloodied, 9% critical, 0 down',band(76,100)==='ok'&&band(75,100)==='wound'&&band(51,100)==='wound'&&band(50,100)==='mid'&&band(10,100)==='mid'&&band(9,100)==='crit'&&band(0,100)==='zero');

    /* death */
    table(); h=pc('Hal',10,20); hpDamage(h,20); ensureDeath(h);
    ok('a player at 0 starts death saves and falls Unconscious',h.hp===0&&!!h.death&&h.conditions.some(function(c){return c.name==='Unconscious'&&c.auto;}));
    hpDamage(h,1); ok('damage at 0 adds a death save failure',h.death.f===1);
    deathApply(h,'nat1'); ok('a natural 1 adds two failures, and three kill',h.death.dead===true);
    table(); h=pc('Hal',10,20); hpDamage(h,20); ensureDeath(h); deathApply(h,'success'); deathApply(h,'success'); deathApply(h,'success');
    ok('three successes stabilise',h.death.stable===true);
    hpHeal(h,3); ensureDeath(h); ok('healing clears death saves and the Unconscious condition',!h.death&&!h.conditions.some(function(c){return c.name==='Unconscious';}));
    table(); h=pc('Hal',10,20); hpDamage(h,20); ensureDeath(h); deathApply(h,'nat20'); ensureDeath(h);
    ok('a natural 20 brings them back at 1 HP',h.hp===1&&!h.death);
    table(); h=pc('Hal',10,20); hpDamage(h,45); ok('massive damage kills outright',!!h.death&&h.death.dead===true);

    /* groups */
    table(); g=addCombatant({name:'Goblin',kind:'npc',disp:'enemy',init:8,members:makeMembers(3,7)});
    memDamage(g,g.members[0],10); ok('group members take damage separately',g.members[0].hp===0&&g.members[1].hp===7);
    ok('a group is not down until every member is',!isDown(g));
    g.members.forEach(function(m){m.hp=0;}); ok('all members at 0 means the group is down',isDown(g));
    memHeal(g.members[1],99); ok('member healing is capped at their maximum',g.members[1].hp===7);
    ok('numbering continues past existing names',numberedNames('Goblin',1)[0]==='Goblin 2');

    /* conditions */
    table(); a=pc('Rowan',15); o=npc('Ogre',12,59); b=pc('Alric',9); nextTurn();
    addCondition(o.id,{name:'Prone',dur:'start',owner:o.id,n:1,level:1,custom:''}); ok('a condition can be added',o.conditions.length===1);
    nextTurn(); ok('a start-of-turn condition ends when that turn begins, and says so',o.conditions.length===0&&liveEnded(o).length===1);
    nextTurn(); ok('the ended marker clears on the next turn change',liveEnded(o).length===0);
    table(); a=pc('Rowan',15); o=npc('Ogre',12,59); b=pc('Alric',9); nextTurn();
    addCondition(o.id,{name:'Stunned',dur:'end',owner:o.id,n:1,level:1,custom:''}); nextTurn();
    ok('an end-of-turn condition waits for that creature\u2019s turn',o.conditions.length===1); nextTurn();
    ok('and ends when that turn is over',o.conditions.length===0);
    table(); a=pc('Rowan',15); o=npc('Ogre',12,59); b=pc('Alric',9); nextTurn();
    addCondition(o.id,{name:'Bless',dur:'rounds',n:1,level:1,custom:''}); nextTurn(); nextTurn(); ok('a one-round condition is still on mid-round',o.conditions.length===1);
    nextTurn(); ok('and ends at the same point in the next round',o.conditions.length===0);

    /* reactions, readied actions, legendary actions */
    table(); a=pc('Rowan',15); o=npc('Ogre',12,59); nextTurn(); a.rx=true; nextTurn(); nextTurn();
    ok('a reaction comes back at the start of its own turn',a.rx===false);
    a.ready={trigger:'x'}; nextTurn(); nextTurn(); ok('a readied action expires at the start of their next turn',a.ready===null);
    state.settings.reactionReset='round'; a.rx=true; o.rx=true; nextTurn(); ok('reactions can refresh at the start of the round instead',a.rx===true&&o.rx===true);
    nextTurn(); ok('and do, when the round turns over',a.rx===false&&o.rx===false);
    o.leg={max:3,left:0,rmax:3,rleft:3}; nextTurn(); ok('legendary actions refill on the creature\u2019s own turn',o.leg.left===3);

    /* what phones may see */
    table(); state.settings.npcHp='status'; a=pc('Rowan',15); o=npc('Ogre',12,59); var sneak=npc('Assassin',20,33); sneak.hidden=true;
    a.sheet=blankSheet(); a.sheet.notes='secret plan'; state.party[0].sheet=a.sheet;
    snap=buildSnapshot(); var txt=JSON.stringify(snap), og=snap.c.filter(function(c){return c.n==='Ogre';})[0], rw=snap.c.filter(function(c){return c.n==='Rowan';})[0];
    ok('hidden creatures never appear in the snapshot',txt.indexOf('Assassin')<0);
    ok('enemy hit points are not sent while shown as a word',!(og.hp&&og.hp.h));
    ok('players get exact hit points',rw.hp.h===24);
    ok('private notes are never sent',txt.indexOf('secret plan')<0);

    /* what phones may ask for */
    shellMode='dm'; table(); a=pc('Rowan',15); state.claims.p_Rowan='key1';
    applyPhoneOp('key1',{t:'dmg',v:5,id:'1'}); ok('a claimed phone can hurt its own character',a.hp===19);
    applyPhoneOp('stranger',{t:'dmg',v:5}); ok('a phone that has not claimed the character is ignored',a.hp===19);
    applyPhoneOp('key1',{t:'next'}); applyPhoneOp('key1',{t:'turn',v:1}); applyPhoneOp('key1',{t:'init',v:99});
    ok('phones cannot change the turn order or initiative',!state.started&&state.turnId===null&&a.init===15);
    applyPhoneOp('key1',{t:'dmg',v:99999}); ok('absurd amounts are refused',a.hp===19);
    applyPhoneOp('key1',{t:'cadd',n:'Hasted<script>'}); ok('unknown conditions are refused',a.conditions.length===0);
    applyPhoneOp('key1',{t:'stats',f:'ac',v:'  18 '}); ok('players can set their own AC',state.party[0].sheet&&state.party[0].sheet.ac==='18');
    applyPhoneOp('key1',{t:'stats',f:'ab:str:s',v:'99'}); ok('ability scores outside 1 to 30 are refused',!state.party[0].sheet.ab.str.score);
    applyPhoneOp('key1',{t:'statsb',v:{mh:'31',sp:'30 ft.'}}); ok('a batch of stats is applied together',state.party[0].maxHp===31&&state.party[0].sheet.speed==='30 ft.');
    state.settings.phoneEdit=false; var before=a.hp; applyPhoneOp('key1',{t:'dmg',v:3}); ok('the DM can switch phone editing off',a.hp===before); state.settings.phoneEdit=true;

    /* claims */
    table(); pc('Rowan',15); pc('Alric',9); released={}; knownPeers={};
    handlePeers([{key:'k1',id:'a',presence:{cl:'p_Rowan'}}]); ok('the first phone to claim gets the character',state.claims.p_Rowan==='k1');
    handlePeers([{key:'k1',id:'a',presence:{cl:'p_Rowan'}},{key:'k2',id:'b',presence:{cl:'p_Rowan'}}]); ok('a second phone cannot take a claimed character',state.claims.p_Rowan==='k1');
    handlePeers([{key:'k1',id:'a',presence:{cl:'p_Alric'}}]); ok('switching characters releases the old one',!state.claims.p_Rowan&&state.claims.p_Alric==='k1');
    released.k1='p_Alric'; delete state.claims.p_Alric; handlePeers([{key:'k1',id:'a',presence:{cl:'p_Alric'}}]);
    ok('a character the DM released is not instantly re-claimed',!state.claims.p_Alric);
    state.claims.p_Rowan='p:ghost'; handlePeers([]); ok('claims from phones that disappeared are dropped',!state.claims.p_Rowan);
    shellMode='selftest';

    /* sound and flash events */
    table(); a=pc('Rowan',15); o=npc('Ogre',12,59); var s1=Sfx.summary(); hpDamage(o,10); ev=Sfx.diff(s1,Sfx.summary());
    ok('a small hit is a small hit',ev.some(function(e){return e.s==='hitSmall'&&e.amt===10;}));
    s1=Sfx.summary(); hpDamage(o,30); ev=Sfx.diff(s1,Sfx.summary()); ok('a big hit is a big hit',ev.some(function(e){return e.s==='hitBig';}));
    s1=Sfx.summary(); hpHeal(o,5); ev=Sfx.diff(s1,Sfx.summary()); ok('healing is a heal',ev.some(function(e){return e.s==='heal'&&e.k==='heal';}));
    s1=Sfx.summary(); hpDamage(o,99); ev=Sfx.diff(s1,Sfx.summary()); ok('dropping an enemy to 0 is a defeat',ev.some(function(e){return e.s==='defeat';}));
    s1=Sfx.summary(); hpDamage(a,24); ensureDeath(a); ev=Sfx.diff(s1,Sfx.summary()); ok('dropping a player to 0 is a down',ev.some(function(e){return e.s==='down';}));
    table(); a=pc('Rowan',15); o=npc('Ogre',12,59); s1=Sfx.summary(); nextTurn(); ev=Sfx.diff(s1,Sfx.summary());
    ok('starting combat sounds the horn',ev.length>0&&ev[0].s==='start');
    s1=Sfx.summary(); nextTurn(); ev=Sfx.diff(s1,Sfx.summary()); ok('an enemy turn is an enemy turn',ev.some(function(e){return e.s==='turnFoe';}));
    s1=Sfx.summary(); nextTurn(); ev=Sfx.diff(s1,Sfx.summary()); ok('a new round gets its own sound',ev.some(function(e){return e.s==='round';}));
    sneakyHide(); function sneakyHide(){o.hidden=true; var x=Sfx.summary(); hpDamage(o,3); ev=Sfx.diff(x,Sfx.summary()); ok('hidden creatures make no sound or flash',!ev.some(function(e){return e.id===o.id;}));}

    /* small helpers */
    ok('allies count as the players\u2019 side, neutrals do not',isSide({kind:'npc',disp:'ally'})&&!isSide({kind:'npc',disp:'neutral'})&&sideClass({kind:'npc',disp:'enemy'})==='npc');
    ok('colour-blind role marks are shape plus word',roleMark({kind:'pc'}).indexOf('Player')>0&&roleMark({kind:'npc',disp:'enemy'}).indexOf('Foe')>0);
  }catch(e){ok('the self-test crashed: '+e.message,false,e.stack);}
  testMode=false; state=keepState; shellMode='selftest';
  var bad=R.filter(function(r){return !r.ok;}).length;
  document.body.className='selftest';
  app.innerHTML='<div class="stpage"><h1>Self-test</h1><p class="stsum '+(bad?'bad':'ok')+'">'+(R.length-bad)+' of '+R.length+' checks passed'+(bad?' \u2014 '+bad+' failed':'')+'</p>'+
    '<p class="help">These ran on a scratch table. Nothing you have saved was touched.</p><ul class="stlist">'+
    R.map(function(r){return '<li class="'+(r.ok?'pass':'fail')+'"><b>'+(r.ok?'\u2713':'\u2717')+'</b><span>'+esc(r.n)+(r.i?'<br><small>'+esc(r.i)+'</small>':'')+'</span></li>';}).join('')+'</ul></div>';
  window.__selftest={passed:R.length-bad,failed:bad,failures:R.filter(function(r){return !r.ok;}).map(function(r){return r.n+(r.i?' :: '+r.i:'');})};
}

