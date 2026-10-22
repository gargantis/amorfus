# Contact sheets for the verifier report (uses lib/sheet.py).
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont
V = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = os.path.dirname(os.path.dirname(V))
LOOK = os.path.join(S, 'teams', 'look')
img = lambda *p: os.path.join(V, 'img', *p)
def blank(text):
    p = img('blank-' + text.replace(' ', '_') + '.png')
    if not os.path.exists(p):
        im = Image.new('RGB', (360, 270), (235, 235, 235)); d = ImageDraw.Draw(im)
        d.text((20, 120), text, fill=(90, 90, 90), font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16)); im.save(p)
    return p
def R(name):
    out = {}
    for f in os.listdir(os.path.join(V, 'res')):
        if f.endswith('.json') and f.startswith(name + '@'):
            out[f[len(name) + 1:-5]] = json.load(open(os.path.join(V, 'res', f)))['runs']
    return out
def sheet(spec):
    p = os.path.join(V, 'sheets', spec['name'] + '.json')
    spec = {'out': os.path.join(V, 'sheets', spec['name'] + '.png'), **{k: v for k, v in spec.items() if k != 'name'}}
    json.dump(spec, open(p, 'w'), indent=1)
    subprocess.run(['python3', os.path.join(S, 'lib', 'sheet.py'), p], check=True)

C = R('C15-V0'); B = R('BLOCKS'); F = R('FREE')
def ex(path, alt):
    return path if os.path.exists(path) else blank(alt)

# ---- sheet 1: constraint scenes and the look ----
c = C['n20']
rows = [
  ('tunnel', 'need 1.90 x 0.70', 'clear %s x %s' % (c['tunnel']['open']['1.5']['clearH'], c['tunnel']['open']['1.5']['clearW'])),
  ('room2', 'need 1.90 x 1.70', 'clear %s x %s' % (c['room2']['open']['1']['clearH'], c['room2']['open']['1']['clearW'])),
  ('trench', 'need width 0.70', 'min width %s, floor +%s' % (c['trench']['gap']['1']['minW'], c['trench']['floor']['maxAbs'])),
  ('single', 'diag/axis 1.74', 'diag/axis %s, extent %s' % (c['single']['diagOverAxis'], c['single']['ext'][0])),
  ('stairs', 'treads flat', 'treads max |dy| %s' % max(t['maxAbs'] for t in c['stairs']['treads'])),
  ('terrain-step', 'terraces flat', 'terraces |dy| %s / %s' % (c['terrain-step']['flatLow']['maxAbs'], c['terrain-step']['flatHigh']['maxAbs'])),
  ('ring8', 'hole 1.0', 'hole about 0.7'),
]
items = []
for name, ref, txt in rows:
    items += [
      {'path': ex(img('BLOCKS@n20-img', name + '-view.png'), 'no image'), 'label': f'{name}: blocks\n{ref}'},
      {'path': img('C15-V0@n20', name + '-view.png'), 'label': f'C15 n20\n{txt}'},
      {'path': ex(img('C15-V0@n20', name + '-slice.png'), 'no slice'), 'label': 'C15 n20, section'},
      {'path': ex(img('FREE@n16', name + '-view.png'), 'FREE not run') if name != 'terrain-step' else os.path.join(LOOK, 'img', 'FREE', 'terrain-step-view.png'), 'label': 'FREE n16' + ('\n(look team run, not converged)' if name == 'terrain-step' else '')},
    ]
sheet({'name': 'final-1-constraints', 'cols': 4, 'cell': [330, 248], 'title': 'C15 = BOX0-PAINT-0.15-0.02 at n 20, caps 0.15 / 0. Labels: measured on labels', 'items': items})

# ---- sheet 2: painted patterns ----
rowsP = [
  ('slab-line', 'n20', 'C15-V0@n20', 'FREE@n16', 'BLOCKS@n20-img', '1-thick slab; band 0.71, sd 0.41'),
  ('slab2-line', 'n20', 'C15-V0@n20', 'FREE@n16', 'BLOCKS@n20-img', 'same line on 2-thick ground'),
  ('big2-line', 'n16', 'C15-V0@n16', 'FREE@n12', 'BLOCKS@n16', 'line 2+ blocks from edges'),
  ('checker2', 'n20', 'C15-V0@n20', 'FREE@n16', 'BLOCKS@n20-img', 'checker on 2-thick ground'),
  ('text-AZ', 'n16', 'C15-V0@n16', 'FREE@n12', 'BLOCKS@n16', 'pixel letters A, Z'),
]
items = []
for name, nn, cdir, fdir, bdir, txt in rowsP:
    cr = C[nn][name]; pa = cr['paint']
    lab = f"area x{pa['areaRatio']:.2f}, parts {pa['parts0']}->{pa['parts']}, wrong {pa['blocksWrong']}"
    if name == 'slab-line': lab = f"band {cr['band']['mean']:.2f}, sd {cr['band']['sd']:.2f}, ends {cr['bandEnd0']['mean']:.2f}"
    if name == 'slab2-line': lab = f"middle band {cr['band']['mean']:.2f}, parts 6->{pa['parts']}"
    items += [
      {'path': img(bdir, name + '-view.png'), 'label': f'{name}: blocks\n{txt}'},
      {'path': img(cdir, name + '-view.png'), 'label': f'C15 {nn}\n{lab}'},
      {'path': img(cdir, name + '-slice.png'), 'label': f'C15 {nn}, plan, top layer'},
      {'path': img(fdir, name + '-view.png'), 'label': f'FREE {fdir.split("@")[1]}'},
    ]
sheet({'name': 'final-2-paint', 'cols': 4, 'cell': [330, 248], 'title': 'Paint under C15 (paint fidelity 0.02): a band only on a 1-thick slab', 'items': items})

# ---- sheet 3: seams, labels vs render field ----
def sd(reg, n, g='1'):
    return json.load(open(os.path.join(V, 'res', f'seams-{reg}-g{g}@n{n}.json')))['runs']['halves4']
items = []
for reg, n in [('FID-0.15', 16), ('FID-0.15', 24), ('C15-V0', 24), ('FINITE-4', 24), ('CAGE-0.25', 24), ('FREE', 16)]:
    d = sd(reg, n)
    items.append({'path': img('seamzoom', f'halves4-{reg}@n{n}.png'), 'label': f'{reg} n{n}: label notch {d["lab"]["depth"]:.3f}\nrender-field groove {d["D"]["depth"]:.3f}'})
sheet({'name': 'final-3-seams', 'cols': 3, 'cell': [480, 336], 'title': 'A|B seam (x = 2) in a 1-thick slab, section z = 2: label cells by colour, render surface D = 0 in yellow', 'items': items})

# ---- sheet 4: where the claims break ----
items = [
  {'path': img('C15-V05@n20', 'slab-line-view.png'), 'label': 'slab-line, C15 caps 0.15/0.05, n20\nband holds (sd 0.055)'},
  {'path': img('C15-V05@n24', 'slab-line-view.png'), 'label': 'slab-line, C15 caps 0.125/0.042, n24\nline drains to corners (band 0.01)'},
  {'path': img('C10-V05@n24', 'slab-line-view.png'), 'label': 'slab-line, C10 caps 0.125/0.042, n24\nline drains to corners (band 0.03)'},
  {'path': img('C15-V0-km05@n16', 'big2-line-view.png'), 'label': 'big2-line, C15 paint fid. 0.05, n16\nstill one blob'},
  {'path': img('C15-V0-km10@n16', 'big2-line-view.png'), 'label': 'big2-line, C15 paint fid. 0.10, n16\nstill one blob'},
  {'path': img('C15-V0-km10@n16', 'slab-line-view.png'), 'label': 'slab-line, C15 paint fid. 0.10, n16\nband sd 0.29 (zigzag back)'},
  {'path': img('NOVOL-1@n20', 'tunnel-slice.png'), 'label': 'tunnel, NOVOL-1 n20 (listed regime)\nclear 1.90 x 0.70 at all 3 cuts'},
  {'path': img('NOVOL-1@n20', 'single-view.png'), 'label': 'single, NOVOL-1 n20\ndiag/axis 1.21, keeps 2/3 volume'},
  {'path': img('NOVOL-1@n20', 'room2-slice.png'), 'label': 'room2, NOVOL-1 n20\nclear 1.80 x 1.50: fails'},
  {'path': img('CAGE-0.05@n20', 'tunnel-slice.png'), 'label': 'tunnel, CAGE-0.05 n20 (listed regime)\nclear 1.90 x 0.90'},
  {'path': img('CAGE-0.05@n20', 'single-view.png'), 'label': 'single, CAGE-0.05 n20\ndiag/axis 1.42 (blocks 1.74)'},
  {'path': img('CAGE-0.05@n20', 'room2-slice.png'), 'label': 'room2, CAGE-0.05 n20\nclear 1.90 x 1.90'},
]
sheet({'name': 'final-4-limits', 'cols': 3, 'cell': [360, 270], 'title': 'Where the claims break: PLAN caps at n 24, higher paint fidelity, listed regimes that keep the tunnel at n 20', 'items': items})
