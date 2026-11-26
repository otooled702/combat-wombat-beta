
(function(){
var SELF_SRC=document.currentScript?document.currentScript.textContent:'', QR_SRC=(document.getElementById('qrlib')||{}).textContent||'', HEAD_HTML=document.head?document.head.innerHTML:'';

'use strict';

/* ================================================================
   1. Constants and static data
   Keys, condition rules text, skins, ability names.
   ================================================================ */

/* The demo build (python3 build.py --demo) sets DEMO: a sample fight, nothing kept, a tour and a Subscribe window.
   It keeps its own storage keys and channels so it never touches a real table in the same browser. */
var DEMO=false/*@demo*/;
/* The beta build (dist/beta.html) adds test accounts that live only in this browser: each has its own
   storage, and the "free" one behaves exactly like the demo. See 27c-beta-accounts.js. */
var BETA=false/*@beta*/;
var APP_VERSION='0.9.0-beta.3';
var betaAcct=BETA?betaCurrent():null;
if(betaAcct&&betaAcct.plan==='free')DEMO=true;
var KEY=BETA?'cw-beta-'+(betaAcct?betaAcct.id:'signed-out'):(DEMO?'combat-wombat-demo':'initiative-tracker-v1');

var CONDITIONS=['Blinded','Charmed','Deafened','Exhaustion','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious'];

var EXTRA_CONDS=['Concentrating','Bane','Bless','Faerie Fire'];

var SPELL_ROUNDS={'Bane':10,'Bless':10,'Faerie Fire':10};

var COND_INFO={
  'Concentrating':'Holding a spell that needs Concentration. When damaged, make a Constitution save (DC 10 or half the damage, whichever is higher, max 30). It ends if the caster is Incapacitated or dies, or casts another Concentration spell.',
  'Bane':'Up to three creatures that fail a Charisma save subtract 1d4 from every attack roll and saving throw while it lasts. Concentration, up to 1 minute.',
  'Bless':'Up to three chosen creatures add 1d4 to every attack roll and saving throw while it lasts. Concentration, up to 1 minute.',
  'Faerie Fire':'Creatures that fail a Dexterity save are outlined in light. Attack rolls against them have Advantage if the attacker can see them, and they can\u2019t benefit from being Invisible. Concentration, up to 1 minute.',
  'Blinded':'Can\u2019t see, and automatically fails any check that needs sight. Attack rolls against it have Advantage; its own attack rolls have Disadvantage.',
  'Charmed':'Can\u2019t attack the charmer or target them with harmful abilities or magic. The charmer has Advantage on social ability checks against it.',
  'Deafened':'Can\u2019t hear, and automatically fails any check that needs hearing.',
  'Exhaustion':'Levels stack, up to 6. Each level subtracts 2 from D20 Tests and 5 ft. from Speed. Level 6 is death. A Long Rest removes one level.',
  'Frightened':'Disadvantage on ability checks and attack rolls while the source of fear is in line of sight, and it can\u2019t willingly move closer to that source.',
  'Grappled':'Speed is 0. Disadvantage on attack rolls against anyone but the grappler. The grappler can drag or carry it, paying extra movement.',
  'Incapacitated':'Can\u2019t take actions, Bonus Actions or Reactions. Concentration is broken. Can\u2019t speak. Disadvantage on Initiative rolls.',
  'Invisible':'Can\u2019t be seen without special senses. Attack rolls against it have Disadvantage; its own attack rolls have Advantage. Advantage on Initiative rolls.',
  'Paralyzed':'Incapacitated, can\u2019t move or speak. Automatically fails Strength and Dexterity saves. Attack rolls against it have Advantage, and any hit from within 5 ft. is a Critical Hit.',
  'Petrified':'Turned to stone. Incapacitated, can\u2019t move or speak, unaware of surroundings. Attack rolls against it have Advantage. Fails Strength and Dexterity saves. Resistance to all damage and immune to Poisoned.',
  'Poisoned':'Disadvantage on attack rolls and ability checks.',
  'Prone':'Can only crawl, unless it stands up (costs half its Speed). Disadvantage on its attack rolls. Attacks against it have Advantage from within 5 ft. and Disadvantage from farther away.',
  'Restrained':'Speed is 0. Attack rolls against it have Advantage; its own attack rolls have Disadvantage. Disadvantage on Dexterity saves.',
  'Stunned':'Incapacitated. Automatically fails Strength and Dexterity saves. Attack rolls against it have Advantage.',
  'Unconscious':'Incapacitated, can\u2019t move or speak, unaware of surroundings. Drops what it holds and falls Prone. Automatically fails Strength and Dexterity saves. Attack rolls against it have Advantage, and any hit from within 5 ft. is a Critical Hit.'
};

var SKINS=[
  {id:'spark',name:'Color Spray',mode:'light',pv:{bg:'#F8F8F2',card:'#FFFFFF',now:'#577BFF',a:'#577BFF',b:'#EE4B45'}},
  {id:'light',name:'Moonlight',mode:'light',pv:{bg:'#E3E9EB',card:'#F4F7F8',now:'#6A4FD6',a:'#1F7DBD',b:'#B8334A'}},
  {id:'daylight',name:'Daylight',mode:'light',pv:{bg:'linear-gradient(160deg,#F7E9BE,#EBD08A)',card:'#FFF8E3',now:'#D4A017',a:'#2A76B5',b:'#B8402F'}},
  {id:'medieval',name:'Arcane',mode:'light',pv:{bg:'radial-gradient(at 50% -10%,#5A3A22,#2A1912 70%)',card:'#EDDDB3',now:'#7B3FBF',a:'#24508F',b:'#8E1B24'}},
  {id:'frost',name:'Frost',mode:'light',pv:{bg:'linear-gradient(135deg,#BFD9EE,#E8F3FB)',card:'#FFFFFF',now:'#6C5CE7',a:'#2B7BBF',b:'#D6384F'}},
  {id:'sparkd',name:'Dancing Lights',mode:'dark',pv:{bg:'#000A08',card:'#121715',now:'#6B8BFF',a:'#6B8BFF',b:'#FF5C57'}},
  {id:'slate',name:'Underdark',mode:'dark',pv:{bg:'#0E1A21',card:'#16252E',now:'#A78BFA',a:'#5BB8EC',b:'#E4566C'}},
  {id:'water',name:'Underwater',mode:'dark',pv:{bg:'linear-gradient(180deg,#0A5287,#052B4A 55%,#02152B)',card:'#0C4770',now:'#FFD84D',a:'#5EE6D2',b:'#FF6F8E'}},
  {id:'forest',name:'Woodland',mode:'dark',pv:{bg:'radial-gradient(at 18% -10%,#2F5A33,#14261A 65%)',card:'#1F3A28',now:'#7CC4FF',a:'#8FD694',b:'#E5775F'}},
  {id:'mountain',name:'Mountain',mode:'dark',pv:{bg:'linear-gradient(115deg,#1C2126 58%,#2C363E 58%)',card:'#29323A',now:'#F4F8FB',a:'#8FD3FF',b:'#FF7C7C'}},
  {id:'fire',name:'Fire',mode:'dark',pv:{bg:'linear-gradient(0deg,#8A3410,#140A08 72%)',card:'#241210',now:'#FFC21A',a:'#6FB8FF',b:'#E5214F'}},
  {id:'feywild',name:'Feywild',mode:'dark',pv:{bg:'radial-gradient(circle at 14% 14%,rgba(255,61,219,.55),transparent 55%),radial-gradient(circle at 88% 88%,rgba(51,221,255,.45),transparent 55%),#12062B',card:'#2A1360',now:'#C8FF3D',a:'#33DDFF',b:'#FF3D6E'}}
];
/* A little picture of the skin: its page, a player card, an enemy card and the Now colour. */
function skinPicHTML(k){var v=k.pv; return '<span class="swp" style="background:'+v.bg+'"><i style="background:'+v.card+';border-top-color:'+v.a+'"></i><i style="background:'+v.card+';border-top-color:'+v.b+'"></i><b style="background:'+v.now+'"></b></span>';}

var SKINS_OK=SKINS.map(function(k){return k.id;});

var ABIL=[['str','STR'],['dex','DEX'],['con','CON'],['int','INT'],['wis','WIS'],['cha','CHA']];

var LIVE_NS=BETA?KEY+'-':(DEMO?'cw-demo-':''), SNAP_KEY=LIVE_NS?LIVE_NS+'snap':'bm-live-snap', CLAIM_KEY=LIVE_NS?LIVE_NS+'claim':'bm-claim', DEFAULT_LINK='https://claude.ai/artifact/UsKqBKxAzzh9WAy7t4rdXy';

