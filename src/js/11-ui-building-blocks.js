/* ================================================================
   11. UI building blocks
   Switches, segmented controls, pips.
   ================================================================ */

function swHTML(act,on,label,disabled,title,extra){
  return '<button type="button" class="swbtn'+(on?' on':'')+'" role="switch" aria-checked="'+(on?'true':'false')+'" data-act="'+act+'"'+(extra||'')+(disabled?' disabled':'')+(title?' title="'+esc(title)+'"':'')+'><span class="swtrack"><i></i></span><span class="swlab">'+label+'</span></button>';
}

function segHTML(grp,key,cur,opts,cls){
  return '<div class="seg'+(cls?' '+cls:'')+'" role="radiogroup">'+opts.map(function(o){
    return '<button type="button" role="radio" aria-checked="'+(String(cur)===String(o[0])?'true':'false')+'" data-act="seg" data-grp="'+grp+'" data-key="'+key+'" data-val="'+o[0]+'">'+o[1]+'</button>';}).join('')+'</div>';
}

function pips(n,max){var o='';for(var i=0;i<max;i++)o+=(i<n?'\u25cf':'\u25cb');return o;}

function failPips(n){var o='';for(var i=0;i<3;i++)o+=(i<n?'\u2715':'\u25cb');return o;}

