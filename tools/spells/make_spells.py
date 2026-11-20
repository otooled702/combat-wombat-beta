"""Make src/data/spells.json from the SRD 5.2 spell list (Open5e API, CC BY 4.0).

    python3 tools/spells/make_spells.py            rebuild src/data/spells.json from the saved download
    python3 tools/spells/make_spells.py --fetch    download the list again first (needs curl and internet)

All the judgement lives in the rule tables below: which spells are really "damage" or
"condition" spells (NO_DMG, NO_COND), fixes to conditions (COND_FIX), spells where the damage
type is a choice (TYPE_OPTS), dart/ray/beam counts (COUNT) and single-part overrides (SINGLE).
Then run  python3 build.py  and the Spells tests.
"""
import json,re,gzip,os,sys,subprocess,time
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(os.path.dirname(HERE))
RAW=os.path.join(HERE,'spells_raw.json.gz')
if '--fetch' in sys.argv:
    url="https://api.open5e.com/v2/spells/?format=json&limit=100&document__key=srd-2024"; allrows=[]
    while url:
        d=json.loads(subprocess.run(['curl','-sL','-m','40',url],capture_output=True,text=True).stdout); allrows+=d['results']; url=d['next']; time.sleep(.3)
    with gzip.open(RAW,'wt',encoding='utf-8') as f: json.dump(allrows,f)
    print('downloaded',len(allrows),'spells')
rows=json.load(gzip.open(RAW,'rt',encoding='utf-8'))
AB={'strength':'str','dexterity':'dex','constitution':'con','intelligence':'int','wisdom':'wis','charisma':'cha'}
CLS={'Bard':'Bd','Cleric':'Cl','Druid':'Dr','Paladin':'Pa','Ranger':'Rn','Sorcerer':'So','Warlock':'Wl','Wizard':'Wz'}
TYPES=['Acid','Bludgeoning','Cold','Fire','Force','Lightning','Necrotic','Piercing','Poison','Psychic','Radiant','Slashing','Thunder']
CONDS=['Blinded','Charmed','Deafened','Frightened','Grappled','Incapacitated','Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious']
# damage-ish spells that are NOT a direct damage effect on a target (healing, buffs, riders, summons, special cases)
NO_DMG=set("""Alter Self|Bane|Bestow Curse|Bless|Blink|Confusion|Conjure Animals|Conjure Elemental|Conjure Fey|Conjure Minor Elementals|Conjure Woodland Beings|Contact Other Plane|Contagion|Control Weather|Cure Wounds|Dimension Door|Divine Favor|Divine Smite|Dream|Earthquake|Ensnaring Strike|Faithful Hound|False Life|Fire Shield|Forbiddance|Freedom of Movement|Gaseous Form|Geas|Guidance|Healing Word|Heroes' Feast|Hex|Hunter's Mark|Mass Cure Wounds|Mass Healing Word|Meld into Stone|Phantasmal Force|Power Word Kill|Prayer of Healing|Prismatic Spray|Prismatic Wall|Ray of Enfeeblement|Regenerate|Reincarnate|Resistance|Searing Smite|Shining Smite|Spike Growth|Teleport|Time Stop|Wish|Web|Eyebite""".split('|'))
# conditions the text scan wrongly finds, or that are too complicated for one tap
NO_COND=set("""Antipathy/Sympathy|Calm Emotions|Command|Conjure Elemental|Conjure Fey|Contact Other Plane|Contagion|Divine Word|Dream|Freedom of Movement|Freezing Sphere|Gaseous Form|Geas|Haste|Imprisonment|Magic Circle|Magic Jar|Prismatic Spray|Prismatic Wall|Telekinesis|Hypnotic Pattern|Conjure Woodland Beings""".split('|'))
COND_FIX={'Flesh to Stone':['Restrained','Petrified'],'Hypnotic Pattern':['Charmed'],'Web':['Restrained'],'Eyebite':['Unconscious','Frightened','Poisoned'],'Sleep':['Incapacitated'],'Hideous Laughter':['Incapacitated','Prone'],"Tasha's Hideous Laughter":['Incapacitated','Prone'],'Blindness/Deafness':['Blinded','Deafened'],'Divine Word':[],'Earthquake':['Prone']}
TYPE_OPTS={'Chromatic Orb':['acid','cold','fire','lightning','poison','thunder'],"Dragon's Breath":['acid','cold','fire','lightning','poison'],'Sorcerous Burst':['acid','cold','fire','lightning','poison','psychic','thunder'],'Spirit Guardians':['radiant','necrotic'],'Wall of Ice':['cold'],'Prismatic Spray':[]}
SINGLE={'Acid Arrow':('4d4','acid'),'Spirit Guardians':('3d8','radiant'),'Storm of Vengeance':('2d6','thunder'),'Tsunami':('6d10','bludgeoning'),'Vitriolic Sphere':('10d4','acid'),'Wall of Ice':('10d6','cold'),'Wall of Thorns':('7d8','piercing'),'Weird':('10d10','psychic')}
TYPE_OPTS.update({'Spirit Guardians':['radiant','necrotic'],'Wall of Thorns':['piercing','slashing']})
# healing spells (SRD 5.2): hl = dice or a fixed number, hm = add the caster's spellcasting modifier,
# hu = amount when cast with a higher slot, hf = 'full' (back to full hit points), hx = amount is divided between the targets.
# hd = in combat by default (Prayer of Healing takes 10 minutes, so it stays out).
def _up(base_lv, n, die, step):
    return {str(l): '%dd%d' % (n + step * (l - base_lv), die) for l in range(base_lv + 1, 10)}
HEAL={'Cure Wounds':{'hl':'2d8','hm':1,'hu':_up(1,2,8,2),'hd':1},
      'Healing Word':{'hl':'2d4','hm':1,'hu':_up(1,2,4,2),'hd':1},
      'Mass Cure Wounds':{'hl':'5d8','hm':1,'hu':_up(5,5,8,1),'hd':1},
      'Mass Healing Word':{'hl':'2d4','hm':1,'hu':_up(3,2,4,1),'hd':1},
      'Prayer of Healing':{'hl':'2d8','hm':1,'hu':_up(2,2,8,1),'hd':0},
      'Heal':{'hl':'70','hu':{str(l):str(70+10*(l-6)) for l in range(7,10)},'hd':1},
      'Mass Heal':{'hl':'700','hx':1,'hd':1},
      'Power Word Heal':{'hf':'full','hd':1}}
COUNT={'Magic Missile':{'x':3,'xl':1,'xb':1},'Scorching Ray':{'x':3,'xl':1,'xb':2},'Eldritch Blast':{'xt':[1,2,3,4]}}
def parts_of(d):
    out=[]
    for m in re.finditer(r'(\d+d\d+(?:\s*\+\s*\d+)?)\s+(%s)\s+damage'%'|'.join(TYPES),d):
        p=(m.group(1).replace(' ',''),m.group(2).lower())
        if p not in out: out.append(p)
    return out
def short_time(t):
    t=(t or '').lower(); return {'action':'A','bonus_action':'BA','reaction':'R'}.get(t,t.replace('minute','min').replace('hour','h'))
out=[]
for r in rows:
    n=r['name']; d=r['desc'] or ''; dl=d.lower()
    at='r' if 'ranged spell attack' in dl else ('m' if 'melee spell attack' in dl else 0)
    sv=AB.get(r['saving_throw_ability'] or '',0)
    dm=(r['damage_roll'] or '').replace(' ','')
    dt=list(r['damage_types'] or [])
    parts=parts_of(d)
    if n in NO_DMG: dm='';dt=[];parts=[]
    if dm and not parts: parts=[(dm,dt[0])] if dt else [(dm,'untyped')]
    if dm and parts and parts[0][0]!=dm and n not in ('Disintegrate','Finger of Death','Magic Missile'): dm=parts[0][0]
    if n in SINGLE: parts=[SINGLE[n]]; dm=SINGLE[n][0]; dt=[SINGLE[n][1]]
    half=bool(re.search(r'half as much damage|half damage',dl))
    cd=[]
    if (sv or at) and n not in NO_COND:
        for c in CONDS:
            if re.search(r'(has|have|having|becomes?|is|are)\s+(the\s+)?%s\b'%c,d) or re.search(r'%s condition'%c,d): cd.append(c)
    if n in COND_FIX: cd=COND_FIX[n]
    if n in NO_COND: cd=[]
    up={};cu=[]
    for o in (r['casting_options'] or []):
        m=re.match(r'slot_level_(\d)',o['type'])
        if m and o.get('damage_roll'): up[m.group(1)]=o['damage_roll'].replace(' ','')
        m=re.match(r'player_level_(\d+)',o['type'])
        if m and o.get('damage_roll'): cu.append(o['damage_roll'].replace(' ',''))
    if len(parts)>1: up={}
    e={'n':n,'l':r['level'],'s':r['school']['name'][:3],'cl':[CLS[c['name']] for c in r['classes'] if c['name'] in CLS],'t':short_time(r['casting_time']),'r':r['range_text'] or '','du':(r['duration'] or '').replace('instantaneous','Instant'),'co':bool(r['concentration'])}
    if sv:e['sv']=sv
    if at:e['at']=at
    if dm:
        e['dm']=dm
        e['dp']=([[a,b,0 if (n=='Ice Knife' and i==0) else 1] for i,(a,b) in enumerate(parts)]) if len(parts)>1 else None
        if n in TYPE_OPTS: e['dt']=TYPE_OPTS[n]
        else: e['dt']=[p[1] for p in parts] if len(parts)==1 else list(dict.fromkeys(dt)) or [parts[0][1]]
        if dm and sv: e['ok']='half' if half else 'none'
        if up:e['up']=up
        if cu:e['cu']=cu
    if e.get('dp') is None: e.pop('dp',None)
    if cd:e['cd']=cd
    if n in COUNT:
        for k,v in COUNT[n].items(): e[k]=v
    if r['shape_type']: e['sh']=('%s %s ft'%(r['shape_type'],r['shape_size'])) if r['shape_size'] else r['shape_type']
    if n in HEAL:
        h=dict(HEAL[n]); hd=h.pop('hd'); e.update(h)
    e['df']=1 if ('dm' in e or 'cd' in e or (n in HEAL and HEAL[n]['hd'])) else 0
    out.append(e)
json.dump(out,open(os.path.join(ROOT,'src','data','spells.json'),'w'),separators=(',',':'))
missing=[n for n in HEAL if n not in [e['n'] for e in out]]
assert not missing, missing
print('healing:',[(e['n'],e.get('hl') or e.get('hf')) for e in out if 'hl' in e or 'hf' in e])
print(len(out),'in combat by default:',sum(e['df'] for e in out),'| damage',sum('dm' in e for e in out),'| conditions',sum('cd' in e for e in out),'| bytes',len(json.dumps(out,separators=(',',':'))))
print('multi-part:',[(e['n'],e['dp']) for e in out if e.get('dp')])
print('type choices:',[(e['n'],e['dt']) for e in out if 'dm' in e and len(e['dt'])>1 and not e.get('dp')])
print('cantrip tiers:',[(e['n'],[e['dm']]+e['cu']) for e in out if e['l']==0 and 'cu' in e])
print('default list:',', '.join(e['n'] for e in out if e['df']))
