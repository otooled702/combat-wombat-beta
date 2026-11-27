/* ================================================================
   26b. Spell library
   The Library's Spells tab: tags to filter by, your own spells, and the form that makes or edits one
   (an SRD spell is never changed: "Edit a copy" makes your own version). Your spells live in
   state.customSpells in the same shape as spells.json, so the Target window uses them as they are.
   Clicks use data-spl="name".
   ================================================================ */

var SPL_TAGS=[['all','All'],['damage','Damage'],['heal','Healing'],['condition','Condition'],['utility','Utility'],['yours','Yours']];
var SPL_TIMES=[['A','Action'],['BA','Bonus action'],['R','Reaction'],['1min','1 minute'],['10min','10 minutes'],['1h','1 hour']];
var SPL_DICE=/^\d+(d\d+)?([+-]\d+(d\d+)?)*$/;

function splEsc(v){return esc(v==null?'':String(v));}

/* ---- Descriptions: the SRD rules text (light Markdown: paragraphs, **bold**, *italic*, "- " bullets, | tables |) ---- */
function spMdInline(t){
  return esc(t).replace(/\*\*_(.+?)_\*\*|_\*\*(.+?)\*\*_|\*\*\*(.+?)\*\*\*/g,function(m,a,b,c){return '<b><i>'+(a||b||c)+'</i></b>';})
    .replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/(^|[^\w*])\*([^*\n]+?)\*(?!\w)/g,'$1<i>$2</i>').replace(/(^|[^\w])_([^_\n]+?)_(?!\w)/g,'$1<i>$2</i>');
}
function spMd(t){
  var out=[], lines=String(t||'').split('\n'), i=0;
  while(i<lines.length){
    var ln=lines[i].trim();
    if(!ln){i++;continue;}
    if(ln.charAt(0)==='|'){
      var rows=[]; while(i<lines.length&&lines[i].trim().charAt(0)==='|'){rows.push(lines[i].trim());i++;}
      var cells=function(r){return r.replace(/^\||\|$/g,'').split('|').map(function(c){return c.trim();});};
      var body=rows.filter(function(r,k){return !(k===1&&/^[|\-:\s]+$/.test(r));});
      out.push('<div class="sptblwrap"><table class="sptbl"><thead><tr>'+cells(body[0]).map(function(c){return '<th scope="col">'+spMdInline(c)+'</th>';}).join('')+'</tr></thead><tbody>'+
        body.slice(1).map(function(r){return '<tr>'+cells(r).map(function(c){return '<td>'+spMdInline(c)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>');
      continue;
    }
    if(/^[-*] /.test(ln)){
      var items=[]; while(i<lines.length&&/^[-*] /.test(lines[i].trim())){items.push(lines[i].trim().slice(2));i++;}
      out.push('<ul>'+items.map(function(x){return '<li>'+spMdInline(x)+'</li>';}).join('')+'</ul>'); continue;
    }
    out.push('<p>'+spMdInline(ln.replace(/^#+\s*/,''))+'</p>'); i++;
  }
  return out.join('');
}
/* The facts line (casting time, range, components, duration), the description, and what a higher slot or level adds. */
function spInfoHTML(x){
  var facts=[['Casting time',spCastTime(x)+(x.ri?' or ritual':'')],['Range',x.r],['Area',x.sh],['Components',x.cm],['Duration',(x.co?'Concentration, up to ':'')+(x.du||'')]]
    .filter(function(f){return f[1];});
  var hi=x.hi?'<p class="sphi"><b>'+(x.l===0?'Cantrip upgrade.':'Using a higher-level spell slot.')+'</b> '+spMdInline(x.hi)+'</p>':'';
  return '<dl class="spfacts">'+facts.map(function(f){return '<div><dt>'+f[0]+'</dt><dd>'+splEsc(f[1])+'</dd></div>';}).join('')+'</dl>'+
    (x.ds?'<div class="sptext">'+spMd(x.ds)+'</div>':'<p class="help">No description yet.'+(x.custom?' Add one with Edit.':'')+'</p>')+hi;
}
/* A Description toggle. Its text is only built when it is opened (the Library lists 339 spells), and the open ones stay open
   across redraws: ui.spdOpen holds the Target window's choice, ui.lib.spdesc the spells opened in the Library. */
function spDescHTML(x,where){
  var open=where==='target'?!!ui.spdOpen:!!(ui.lib&&ui.lib.spdesc&&ui.lib.spdesc[x.n]);
  return '<details class="spdesc" data-spd="'+where+'" data-n="'+splEsc(x.n)+'"'+(open?' open':'')+'><summary>Description</summary><div class="spdbody">'+(open?spInfoHTML(x):'')+'</div></details>';
}
function splFiltered(){
  var L=ui.lib, q=(L.spq||'').trim().toLowerCase(), lv=L.splv==null?'':L.splv, cl=L.spcl||'', tag=L.sptag||'all';
  return spellsAll().filter(function(x){
    if(q&&x.n.toLowerCase().indexOf(q)<0)return false;
    if(lv!==''&&String(x.l)!==String(lv))return false;
    if(cl&&(x.cl||[]).indexOf(cl)<0)return false;
    if(tag==='yours')return !!x.custom;
    return tag==='all'||spTags(x).indexOf(tag)>=0;
  }).sort(function(a,b){return a.n.localeCompare(b.n);});
}
function renderSpellsTab(el,head){
  var L=ui.lib;
  if(L.spform){el.innerHTML=head+splFormHTML(L.spform); var nf=el.querySelector('[data-spff=n]'); if(nf&&!L.spform.focused){L.spform.focused=true; nf.focus(); nf.select();} return;}
  var tag=L.sptag||'all', lv=L.splv==null?'':L.splv, cl=L.spcl||'', list=splFiltered(), mine=(state.customSpells||[]).length;
  var opt=function(v,on,l){return '<option value="'+splEsc(v)+'"'+(on?' selected':'')+'>'+splEsc(l)+'</option>';};
  var rows=list.map(function(x){
    var meta=spLv(x)+' · '+(SP_SCHOOL[x.s]||x.s||'')+((x.cl&&x.cl.length)?' · '+x.cl.map(function(k){return SP_CLASS[k];}).join(', '):'');
    var acts=x.custom?
      '<button type="button" class="btn small iconbtn" data-spl="edit" data-n="'+splEsc(x.n)+'" aria-label="Edit '+splEsc(x.n)+'" title="Edit">'+ICONS.pencil+'</button>'+
      '<button type="button" class="btn small iconbtn" data-spl="del" data-n="'+splEsc(x.n)+'" aria-label="Delete '+splEsc(x.n)+'" title="Delete">×</button>':
      '<button type="button" class="btn small iconbtn" data-spl="copy" data-n="'+splEsc(x.n)+'" aria-label="Edit a copy of '+splEsc(x.n)+'" title="Edit a copy: make your own version">'+ICONS.pencil+'</button>';
    return '<div class="mmrow sprow2" data-spn="'+splEsc(x.n)+'"><span class="mmname static"><span class="mmtitle"><b>'+splEsc(x.n)+'</b>'+(x.custom?'<em class="sprec yours">yours</em>':'')+(x.co?'<em class="sprec">concentration</em>':'')+'</span>'+
      '<small>'+splEsc(meta)+'</small>'+spTagChips(x)+'</span><span class="spsum">'+splEsc(spEffect(x)||'No damage, healing or condition')+'</span><span class="spacts">'+acts+'</span>'+spDescHTML(x,'lib')+'</div>';
  }).join('');
  el.innerHTML=head+'<div class="mmctl"><input type="search" class="mmsearch" data-spf="q" placeholder="Search spells…" value="'+splEsc(L.spq||'')+'" aria-label="Search spells" autocomplete="off">'+
    '<button type="button" class="btn small mmnew" data-spl="new" aria-label="New spell">+ New<span class="mmnewx">\u00a0spell</span></button>'+
    '<div class="mmbar"><div class="mmisland spisl" role="group" aria-label="Tags"><div class="seg sm sptagseg" role="radiogroup" aria-label="Show spells tagged">'+
      SPL_TAGS.map(function(o){return '<button type="button" role="radio" aria-checked="'+(tag===o[0])+'" data-spl="tag" data-v="'+o[0]+'">'+o[1]+(o[0]==='yours'&&mine?' <span class="mmcnt">'+mine+'</span>':'')+'</button>';}).join('')+'</div></div>'+
    '<div class="mmisland spisl" role="group" aria-label="Filter"><select data-spf="lv" aria-label="Level">'+opt('',lv==='','All levels')+opt('0',lv==='0','Cantrips')+[1,2,3,4,5,6,7,8,9].map(function(l){return opt(String(l),lv===String(l),'Level '+l);}).join('')+'</select>'+
      '<select data-spf="cl" aria-label="Class">'+opt('',cl==='','All classes')+Object.keys(SP_CLASS).map(function(k){return opt(k,cl===k,SP_CLASS[k]);}).join('')+'</select></div></div></div>'+
    '<p class="help spintro"><b id="spcount">'+list.length+'</b> spell'+(list.length===1?'':'s')+'. Tags come from what a spell does. The Target window’s Spells tab filters by the same tags. Make your own with + New, or edit a copy of any spell.</p>'+
    '<div class="mmlist" id="splibList">'+(rows||'<p class="help">No spell matches.'+(tag==='yours'?' Make one with + New.':'')+'</p>')+'</div>'+
    '<p class="mmfoot">Spell data from the System Reference Document 5.2 © Wizards of the Coast LLC, licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>. Not affiliated with or endorsed by Wizards of the Coast.</p></div></div>';
}

/* ---------- the form ---------- */
function splPer(base,up,l){
  /* "per slot level above": the difference between the base dice and one level up, when it is simple */
  var u=up&&up[String(l+1)]; if(!base||!u)return '';
  var a=/^(\d+)d(\d+)$/.exec(base), b=/^(\d+)d(\d+)$/.exec(u);
  if(a&&b&&a[2]===b[2]&&+b[1]>+a[1])return (b[1]-a[1])+'d'+a[2];
  if(/^\d+$/.test(base)&&/^\d+$/.test(u)&&+u>+base)return String(u-base);
  return '';
}
function splDraft(x,mode){
  x=x||{};
  return {mode:mode, orig:mode==='edit'?x.n:null, base:mode==='copy'?x.n:(x.base||null),
    n:mode==='copy'?x.n+' (custom)':(x.n||''), l:x.l==null?1:x.l, s:x.s||'Evo', t:x.t||'A', r:x.r||'', du:x.du||'Instant', co:!!x.co, cl:(x.cl||[]).slice(),
    at:x.at||'', sv:x.sv||'', ok:x.ok||'half', dm:(x.dp&&x.dp[0])?x.dp[0][0]:(x.dm||''), dt:(x.dp&&x.dp[0])?x.dp[0][1]:((x.dt&&x.dt[0])||'fire'), dper:splPer(x.dm,x.up,x.l),
    cd:(x.cd&&x.cd[0])||'', hl:x.hf==='full'?'':(x.hl||''), hm:!!x.hm, hmx:!!x.hmx, hper:splPer(x.hl,x.hu,x.l), hf:x.hf==='full', dp:mode==='copy'&&x.dp?x.dp:null,
    cm:x.cm||'', ds:x.ds||'', hi:x.hi||'', sh:x.sh||'', ri:!!x.ri, err:''};
}
function splFormHTML(F){
  var opt=function(v,cur,l){return '<option value="'+splEsc(v)+'"'+(String(cur)===String(v)?' selected':'')+'>'+splEsc(l)+'</option>';};
  var fld=function(k,label,html,cls){return '<label class="spf'+(cls?' '+cls:'')+'"><span>'+label+'</span>'+html+'</label>';};
  var txt=function(k,v,ph){return '<input type="text" data-spff="'+k+'" name="'+k+'" value="'+splEsc(v)+'" autocomplete="off"'+(ph?' placeholder="'+splEsc(ph)+'"':'')+'>';};
  var title=F.mode==='edit'?'Edit '+F.orig:(F.mode==='copy'?'Your copy of '+F.base:'New spell');
  return '<form class="spform" data-spform novalidate><div class="spfhead"><h3>'+splEsc(title)+'</h3>'+(F.mode==='copy'?'<p class="help">The original stays as it is. Your copy is saved as your own spell.</p>':'')+'</div>'+
    (F.err?'<p class="sperr" role="alert">'+splEsc(F.err)+'</p>':'')+
    '<fieldset><legend>About</legend><div class="spfgrid">'+
      fld('n','Name',txt('n',F.n,''),'wide')+
      fld('l','Level','<select data-spff="l" name="l">'+opt(0,F.l,'Cantrip')+[1,2,3,4,5,6,7,8,9].map(function(l){return opt(l,F.l,'Level '+l);}).join('')+'</select>')+
      fld('s','School','<select data-spff="s" name="s">'+Object.keys(SP_SCHOOL).map(function(k){return opt(k,F.s,SP_SCHOOL[k]);}).join('')+'</select>')+
      fld('t','Casting time','<select data-spff="t" name="t">'+SPL_TIMES.map(function(o){return opt(o[0],F.t,o[1]);}).join('')+'</select>')+
      fld('r','Range',txt('r',F.r,'Example: 60 feet'))+
      fld('du','Duration',txt('du',F.du,'Example: 1 minute'))+
      fld('cm','Components',txt('cm',F.cm,'Example: V, S, M (a feather)'))+
      '<label class="spf spck"><input type="checkbox" data-spff="co" name="co"'+(F.co?' checked':'')+'><span>Concentration</span></label>'+
    '</div><div class="spcls" role="group" aria-label="Classes"><span class="spcl-lab">Classes</span>'+Object.keys(SP_CLASS).map(function(k){return '<label class="spck"><input type="checkbox" name="cl" value="'+k+'"'+(F.cl.indexOf(k)>=0?' checked':'')+'><span>'+SP_CLASS[k]+'</span></label>';}).join('')+'</div></fieldset>'+
    '<fieldset><legend>To hit or save</legend><div class="spfgrid">'+
      fld('at','Attack roll','<select data-spff="at" name="at">'+opt('',F.at,'None')+opt('r',F.at,'Ranged spell attack')+opt('m',F.at,'Melee spell attack')+'</select>')+
      fld('sv','Saving throw','<select data-spff="sv" name="sv">'+opt('',F.sv,'None')+ABIL.map(function(a){return opt(a[0],F.sv,a[1]);}).join('')+'</select>')+
      fld('ok','On a successful save','<select data-spff="ok" name="ok">'+opt('half',F.ok,'Half damage')+opt('none',F.ok,'No damage')+'</select>')+
    '</div></fieldset>'+
    '<fieldset><legend>What it does</legend><p class="help">Fill in any that apply. The tags follow from these: damage, healing, a condition, or none of them (utility).</p><div class="spfgrid">'+
      fld('dm','Damage dice',txt('dm',F.dm,'Example: 8d6'))+
      fld('dt','Damage type','<select data-spff="dt" name="dt">'+DMG_TYPES.filter(function(t){return t!=='untyped';}).map(function(t){return opt(t,F.dt,dmgTypeLabel(t));}).join('')+'</select>')+
      fld('dper','More damage per slot level above',txt('dper',F.dper,'Example: 1d6'))+
      fld('cd','Condition','<select data-spff="cd" name="cd">'+opt('',F.cd,'None')+CONDITIONS.map(function(c){return opt(c,F.cd,c);}).join('')+'</select>')+
      fld('hl','Healing dice or amount',txt('hl',F.hl,'Example: 2d8'))+
      fld('hper','More healing per slot level above',txt('hper',F.hper,'Example: 2d8'))+
      '<label class="spf spck"><input type="checkbox" data-spff="hm" name="hm"'+(F.hm?' checked':'')+'><span>Add the caster’s spellcasting modifier to healing</span></label>'+
      '<label class="spf spck"><input type="checkbox" data-spff="hmx" name="hmx"'+(F.hmx?' checked':'')+'><span>Also raises maximum hit points (like Aid)</span></label>'+
      '<label class="spf spck"><input type="checkbox" data-spff="hf" name="hf"'+(F.hf?' checked':'')+'><span>Heals to full hit points</span></label>'+
    '</div></fieldset>'+
    '<fieldset><legend>Description</legend><p class="help">Shown under Description in the Library and the Target window. Plain text; **bold** works.</p>'+
      '<label class="spf"><span>What the spell does</span><textarea data-spff="ds" name="ds" rows="5">'+splEsc(F.ds)+'</textarea></label>'+
      '<label class="spf"><span>'+(Number(F.l)===0?'Cantrip upgrade':'Using a higher-level spell slot')+'</span><textarea data-spff="hi" name="hi" rows="2">'+splEsc(F.hi)+'</textarea></label>'+
    '</fieldset>'+
    '<div class="spfbtns"><button type="submit" class="btn primary">Save spell</button><button type="button" class="btn" data-spl="cancel">Cancel</button></div></form>';
}
function splUp(base,per,l){
  /* dice at each higher slot: 8d6 with 1d6 per level -> 9d6, 10d6... */
  if(!base||!per||l<1)return null;
  var a=/^(\d+)d(\d+)$/.exec(base), p=/^(\d+)d(\d+)$/.exec(per), out={};
  for(var s=l+1;s<=9;s++){var k=s-l;
    if(a&&p&&a[2]===p[2])out[s]=(+a[1]+k*p[1])+'d'+a[2];
    else if(/^\d+$/.test(base)&&/^\d+$/.test(per))out[s]=String(+base+k*per);
    else if(p)out[s]=base+'+'+(k*p[1])+'d'+p[2];
    else if(/^\d+$/.test(per))out[s]=base+'+'+(k*per);
  }
  return out;
}
function splBuild(f,F){
  var g=function(k){var v=f.querySelector('[name="'+k+'"]'); return v?v.value.trim():'';};
  var ck=function(k){var v=f.querySelector('[name="'+k+'"]'); return !!(v&&v.checked);};
  var clean=function(v){return v.replace(/\s+/g,'').toLowerCase();};
  var n=g('n'), l=parseInt(g('l'),10)||0, dm=clean(g('dm')), dper=clean(g('dper')), hl=clean(g('hl')), hper=clean(g('hper')), hf=ck('hf');
  if(!n)return {err:'Give the spell a name.'};
  var lc=n.toLowerCase(), clash=SPELLS.some(function(x){return x.n.toLowerCase()===lc;})||(state.customSpells||[]).some(function(x){return x.n.toLowerCase()===lc&&x.n!==F.orig;});
  if(clash)return {err:'There’s already a spell called “'+n+'”. Pick another name.'};
  var bad=[['Damage dice',dm],['More damage per slot level',dper],['Healing',hl],['More healing per slot level',hper]].filter(function(p){return p[1]&&!SPL_DICE.test(p[1]);})[0];
  if(bad)return {err:bad[0]+': use dice like 2d8 or a number like 10.'};
  var x={id:F.id||uid(),custom:true,n:n,l:l,s:g('s'),cl:Array.prototype.map.call(f.querySelectorAll('[name=cl]:checked'),function(i){return i.value;}),t:g('t'),r:g('r'),du:g('du')||'Instant',co:ck('co')};
  ['cm','ds','hi'].forEach(function(k){var v=g(k); if(v)x[k]=v.slice(0,6000);});
  if(F.sh)x.sh=F.sh; if(F.ri)x.ri=1;
  if(F.base)x.base=F.base;
  var at=g('at'), sv=g('sv'); if(at)x.at=at; if(sv)x.sv=sv;
  if(dm){
    x.dm=dm; x.dt=[g('dt')||'fire']; if(sv)x.ok=g('ok')||'half';
    if(F.dp&&clean(F.dp[0][0])===dm&&F.dp[0][1]===x.dt[0])x.dp=F.dp;   /* a copied two-part spell keeps its second part */
    var up=splUp(dm,dper,l); if(up&&!x.dp)x.up=up;
    if(l===0){var c=/^(\d+)d(\d+)$/.exec(dm); if(c)x.cu=[2,3,4].map(function(k){return (k*c[1])+'d'+c[2];});}   /* cantrips grow at levels 5, 11 and 17 */
  }
  var cd=g('cd'); if(cd)x.cd=[cd];
  if(hf)x.hf='full';
  else if(hl){x.hl=hl; if(ck('hm'))x.hm=1; if(ck('hmx'))x.hmx=1; var hu=splUp(hl,hper,l); if(hu)x.hu=hu;}
  return {spell:x};
}

{
  // <details> fires "toggle" on itself only (it does not bubble), so listen while it travels down
  document.addEventListener('toggle',function(e){
    var d=e.target; if(!d||!d.classList||!d.classList.contains('spdesc'))return;
    var x=spellGet(d.dataset.n); if(!x)return;
    if(d.open){var b=d.querySelector('.spdbody'); if(b&&!b.firstChild)b.innerHTML=spInfoHTML(x);}
    if(d.dataset.spd==='target')ui.spdOpen=d.open;
    else if(ui.lib){ui.lib.spdesc=ui.lib.spdesc||{}; if(d.open)ui.lib.spdesc[x.n]=1; else delete ui.lib.spdesc[x.n];}
  },true);
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-spl]'); if(!b||!ui.lib)return;
    var L=ui.lib, n=b.dataset.n;
    switch(b.dataset.spl){
      case 'tag':L.sptag=b.dataset.v; renderLib(); break;
      case 'new':L.spform=splDraft({l:1},'new'); renderLib(); break;
      case 'copy':L.spform=splDraft(spellGet(n),'copy'); renderLib(); break;
      case 'edit':{var x=spellGet(n); if(x&&x.custom){L.spform=splDraft(x,'edit'); L.spform.id=x.id;} renderLib(); break;}
      case 'cancel':L.spform=null; renderLib(); break;
      case 'del':{var gone=spellGet(n); if(!gone||!gone.custom)break;
        toast('Deleted “'+n+'”',true);
        mutate(function(){state.customSpells=state.customSpells.filter(function(x){return x.n!==n;}); state.spellRecent=(state.spellRecent||[]).filter(function(y){return y!==n;});});
        renderLib(); break;}
    }
  });
  document.addEventListener('submit',function(e){
    var f=e.target; if(!f.hasAttribute||!f.hasAttribute('data-spform')||!ui.lib||!ui.lib.spform)return;
    e.preventDefault();
    var F=ui.lib.spform, r=splBuild(f,F);
    if(r.err){
      /* keep what was typed, show the message */
      Array.prototype.forEach.call(f.querySelectorAll('[data-spff]'),function(i){F[i.dataset.spff]=i.type==='checkbox'?i.checked:i.value;});
      F.cl=Array.prototype.map.call(f.querySelectorAll('[name=cl]:checked'),function(i){return i.value;});
      F.err=r.err; renderLib(); var er=document.querySelector('.sperr'); if(er)er.scrollIntoView({block:'nearest'}); return;
    }
    var x=r.spell, old=F.orig;
    mutate(function(){
      state.customSpells=(state.customSpells||[]).filter(function(y){return !(old&&y.n===old);});
      state.customSpells.push(x);
      if(old&&old!==x.n)state.spellRecent=(state.spellRecent||[]).map(function(y){return y===old?x.n:y;});
      notes.push('Saved spell “'+x.n+'”');
    });
    ui.lib.spform=null; ui.lib.sptag='yours'; ui.lib.spq=''; ui.lib.splv=''; ui.lib.spcl=''; renderLib(); toast('Saved “'+x.n+'” to your spells');
  });
}
