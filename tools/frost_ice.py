"""Write frost_ice.css: Frost's straight stripes replaced by ice streaks (stretched frost texture + jagged scratches)."""
import math, random, urllib.parse, os
random.seed(7)
W, H = 2400, 1500
ANG = math.radians(-62)          # same lean as the old stripes (about 104-113 degrees)

def scratch():
    # a long, slightly jagged line that drifts along the lean, thinning out at both ends
    L = random.uniform(500, 1500); a = ANG + math.radians(random.uniform(-5, 5))
    x, y = random.uniform(-200, W + 200), random.uniform(-200, H + 200)
    pts, n = [], int(L / 28)
    for i in range(n + 1):
        t = i / n
        pts.append((x + math.cos(a) * L * t + random.uniform(-2.2, 2.2), y + math.sin(a) * L * t + random.uniform(-2.2, 2.2)))
        if random.random() < .08: a += math.radians(random.uniform(-6, 6))
    d = 'M' + ' L'.join('%.1f %.1f' % p for p in pts)
    w = random.choice([.6, .8, 1, 1.3, 1.8]); o = random.uniform(.35, .8)
    hi = f'<path d="{d}" stroke="#fff" stroke-opacity="{o:.2f}" stroke-width="{w}" fill="none" stroke-linecap="round" mask="url(#fade)"/>'
    lo = f'<path d="{d}" transform="translate(1.2 1.4)" stroke="#5E8FB8" stroke-opacity="{o*.35:.2f}" stroke-width="{w*.8:.2f}" fill="none" stroke-linecap="round" mask="url(#fade)"/>'
    return lo + hi

defs = ('<defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feTurbulence type="fractalNoise" baseFrequency="0.0012 0.022" numOctaves="3" seed="4"/>'
        '<feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 2.2 -1.22"/></filter>'
        '<filter id="h" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.0035" numOctaves="4" seed="9"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1.2 -0.5"/></filter>'
        '<radialGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset=".75" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
        f'<mask id="fade"><rect width="{W}" height="{H}" fill="url(#g)"/></mask></defs>')
streaks = f'<g transform="rotate(-62 {W/2} {H/2})"><rect x="-{W}" y="-{H}" width="{W*3}" height="{H*3}" filter="url(#s)"/></g>'
svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}">{defs}{streaks}<rect width="{W}" height="{H}" filter="url(#h)" opacity=".55"/>' + ''.join(scratch() for _ in range(12)) + '</svg>'
uri = 'data:image/svg+xml,' + urllib.parse.quote(svg, safe=" =:/'-.,()")

# a fainter version of the same ice for the frosted cards
import re
svg_c = re.sub(r'stroke-opacity="([0-9.]+)"', lambda m: 'stroke-opacity="%.2f"' % (float(m.group(1)) * .45), svg)   # every scratch at 45%
uri_c = 'data:image/svg+xml,' + urllib.parse.quote(svg_c, safe=" =:/'-.,()")

css = f'''/* Mockup: Frost ice streaks instead of straight stripes */
:root[data-skin="frost"]{{
  --ice:url("{uri}");
  --page-img:var(--ice),linear-gradient(118deg,rgba(255,255,255,.5) 0%,rgba(255,255,255,0) 34%,rgba(140,188,228,.30) 62%,rgba(255,255,255,.40) 100%),linear-gradient(180deg,#B3D2EA 0%,#D8E9F6 45%,#F2F9FE 100%);
}}
:root[data-skin="frost"] :is(.panel,.row,.lnav,.dock,.top,.ctl,.pcard,.ph-row,.mem,.sheet,.cpanel,.qrmodal,.drawer,.rowmenu,.aoerow,.clopt){{
  background-image:linear-gradient(112deg,rgba(255,255,255,.55),rgba(255,255,255,0) 42%,rgba(176,212,240,.26))}}
/* cards are frosted glass in front of the ice: see-through tints, the streaks behind them blurred */
:root[data-skin="frost"] :is(.pcard,.row,.ph-row){{backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%)}}
:root[data-skin="frost"] .pcard.pc:not(.now){{background-color:color-mix(in srgb,var(--pc) 28%,rgba(255,255,255,.70))!important}}
:root[data-skin="frost"] .pcard.npc:not(.now){{background-color:color-mix(in srgb,var(--npc) 36%,rgba(255,255,255,.70))!important}}
:root[data-skin="frost"] .pcard.neutral:not(.now){{background-color:color-mix(in srgb,var(--neutral) 18%,rgba(255,255,255,.70))!important}}
:root[data-skin="frost"] .pcard.now{{background-color:rgba(255,255,255,.80)!important}}
/* one big ice image that covers the screen: no repeat seam */
:root[data-skin="frost"] body{{background-size:cover,100% 100%,100% 100%;background-repeat:no-repeat;background-position:center}}
'''
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'css', '13-skin-frost-ice.css'), 'w').write(css)
print(len(css))
