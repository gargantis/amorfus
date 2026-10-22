# Contact sheets for team 'table' via the shared lib/sheet.py.
#   python3 src/mksheets.py
import json, os, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = os.path.join(ROOT, '..', '..', 'lib', 'sheet.py')
cl = json.load(open(os.path.join(ROOT, 'res', 'classlist.json')))
classes = json.load(open(os.path.join(ROOT, 'res', 'classes.json')))['classes']
share = {int(k): v / 3 for k, v in cl['share'].items()}  # mean of the three samples' shares

def sheet(name, title, items, cols, cell=None):
    items = [it for it in items if os.path.exists(it['path'])]
    if not items:
        print('skip', name); return
    spec = {'out': os.path.join(ROOT, 'sheets', name), 'cols': cols, 'title': title, 'items': items}
    if cell: spec['cell'] = cell
    p = os.path.join(ROOT, 'sheets', name.replace('.png', '.json'))
    json.dump(spec, open(p, 'w'), indent=1)
    subprocess.run([sys.executable, LIB, p], check=True)

def lab(c):
    k = classes[c]
    flags = []
    if not k['plateau']: flags.append('non-Plateau')
    if k['nMat'] > 1: flags.append(f"{k['nMat']} mat")
    return f"c{c} {k['key']} {100*share.get(c,0):.1f}%" + (' ' + ','.join(flags) if flags else '')

def short(c):
    k = classes[c]
    return f"c{c} {k['key']} {100*share.get(c,0):.1f}%" + ('' if k['plateau'] else ' nonP')

top = cl['order'][:12]
for reg in ['FID-0.15', 'FINITE-4']:
    sheet(f'class-table-{reg}.png', f'Top 12 corner classes, {reg}, embedding E2c (infinite octants), n=16',
          [{'path': os.path.join(ROOT, 'img', 'classes', f'c{c}-{reg}-E2c-n16-clu.png'), 'label': short(c) + f'\n{reg} E2c n16'} for c in top], 4)

ctx = [1, 2, 95, 249, 97, 11]
items = []
for c in ctx:
    for emb, txt in [('E1m', '8 blocks alone'), ('E2m', '4^3 object'), ('E2c', 'infinite octants')]:
        items.append({'path': os.path.join(ROOT, 'img', 'classes', f'c{c}-FID-0.15-{emb}-n12-clu.png'), 'label': short(c) + f'\nFID-0.15 n12 {emb}: {txt}'})
sheet('context-embeddings.png', 'One class, three embeddings (FID-0.15, n=12)', items, 3)

od = os.path.join(ROOT, 'img', 'overlay')
if os.path.isdir(od):
    files = sorted(os.listdir(od))
    key = 'white = sim vertex, red = table (volume), orange = table (no volume), cyan = bevel'
    for grp, title in [('terrain', 'Terrain windows (n12), z slice through corners; ' + key),
                       ('builds', 'Builds (n12); ' + key),
                       ('cat', 'Catalogue (n12); ' + key)]:
        its = []
        for f in files:
            if not f.startswith(grp + '-') or not f.endswith('.png'): continue
            parts = f[:-4].split('-')
            its.append({'path': os.path.join(od, f), 'label': f[len(grp)+1:-4].replace('-FID', '\nFID').replace('-FINITE', '\nFINITE')})
        sheet(f'overlay-{grp}.png', title, its, 3 if grp == 'cat' else 4, [432, 400])
