# Summary tables from res/*.json -> res/table-<name>.txt
#   python3 src/table.py <outname> <file1.json> [file2.json ...]
import json, sys, os
out = sys.argv[1]
files = sys.argv[2:]
R = {}
for f in files:
    d = json.load(open(f))
    R[os.path.basename(f)[:-5]] = d['runs']

def g(d, *ks):
    for k in ks:
        if d is None: return None
        d = d.get(k) if isinstance(d, dict) else None
    return d

lines = []
def row(*c): lines.append(' | '.join(str(x) for x in c))

row('regime', 'tunnel clearH/clearW (3 cuts)', 'room2 clearH/clearW min', 'trench minW / floor dev', 'single ext / diag/axis / cornerReq', 'pillar wMin/height', 'ring hole', 'cube2 cornerReq lab', 'flat max|dy| (terrain lo/hi, stairs, slab-line B, slab-halves, room/tunnel roofs)', 'delta (single, cube2, tunnel)')
for name, r in R.items():
    t = g(r, 'tunnel', 'open') or {}
    tun = ' '.join(f"{v['clearH']}/{v['clearW']}" for v in t.values()) if t else '-'
    ro = g(r, 'room2', 'open') or {}
    room = f"{min(v['clearH'] for v in ro.values())}/{min(v['clearW'] for v in ro.values())}" if ro else '-'
    tr = g(r, 'trench')
    trs = f"{min(v['minW'] for v in tr['gap'].values())} / {tr['floor']['maxAbs']}" if tr else '-'
    s = g(r, 'single')
    ss = f"{s['ext']} / {s['diagOverAxis']} / {g(s,'corner','Req')}" if s else '-'
    p = g(r, 'pillar3')
    ps = f"{p['widthMin']}/{p['height']}" if p else '-'
    ri = g(r, 'ring8')
    rs = f"{ri['holeWidthX']}" if ri else '-'
    cu = g(r, 'cube2-same', 'corner', 'Req')
    fl = []
    for k in [('terrain-step', 'flatLow'), ('terrain-step', 'flatHigh')]:
        fl.append(g(r, *k, 'maxAbs'))
    st = g(r, 'stairs', 'treads')
    fl.append(max(x['maxAbs'] for x in st) if st else None)
    sl = g(r, 'slab-line', 'flatB')
    fl.append(max(x['maxAbs'] for x in sl) if sl else None)
    fl.append(max(g(r, 'slab-halves', 'flatA', 'maxAbs') or 0, g(r, 'slab-halves', 'flatB', 'maxAbs') or 0) if g(r, 'slab-halves') else None)
    fl.append(g(r, 'room2', 'flatTop', 'maxAbs')); fl.append(g(r, 'tunnel', 'flatTop', 'maxAbs'))
    de = [g(r, 'single', 'delta'), g(r, 'cube2-same', 'delta'), g(r, 'tunnel', 'delta')]
    row(name, tun, room, trs, ss, ps, rs, cu, fl, de)

row('')
row('regime', 'scene', 'steps(conv)', 'A area ratio', 'A parts start->end', 'blocks wrong', 'gained/lost (blocks^2)', 'line width (mid / ends)', 'A below top layer (blocks^3)', 'junctions')
PAINT = ['slab-line', 'slab2-line', 'slab-dot', 'slab2-dot', 'slab-stripe', 'slab2-stripe', 'diag2', 'Lturn', 'cross', 'xdiag', 'checker1', 'checker2', 'text-AZ', 'stripe-alone', 'stripe-patch', 'step-line', 'terrain-step', 'trench-gd']
for name, r in R.items():
    for sc in PAINT:
        x = r.get(sc)
        if not x: continue
        pa = x.get('paint') or x.get('grass') or x.get('paintLow')
        if sc == 'step-line':
            pa = {k: (x['paintLow'][k] + x['paintHigh'][k]) if isinstance(x['paintLow'][k], (int, float)) else None for k in x['paintLow']}
            pa['areaRatio'] = round(pa['area'] / pa['area0'], 4)
        if not pa: continue
        lw = ''
        if 'band' in x: lw = f"{x['band']['mean']}±{x['band']['sd']} / {x.get('bandEnd0',{}).get('mean')} {x.get('bandEnd1',{}).get('mean')}"
        elif 'mid' in x: lw = f"{x['mid']['mean']}±{x['mid']['sd']} / {x.get('end0',{}).get('mean')} {x.get('end1',{}).get('mean')}"
        elif 'leg1' in x: lw = f"{x['leg1']['mean']}±{x['leg1']['sd']}, {x['leg2']['mean']}±{x['leg2']['sd']} / {x['end1']['mean']} {x['end2']['mean']}"
        elif 'arm' in x: lw = f"{x['arm']['mean']}±{x['arm']['sd']}"
        elif 'stripeMid' in x: lw = f"{x['stripeMid']['mean']}±{x['stripeMid']['sd']} / free end {x['stripeFreeEnd']['mean']} near patch {x['stripeNearPatch']['mean']}"
        row(name, sc, f"{x['steps']}{'' if x['converged'] else ' nc'}", pa.get('areaRatio'), f"{pa.get('parts0')}->{pa.get('parts')}", f"{pa.get('blocksWrong')}/{pa.get('blocks')}", f"{pa.get('gained')}/{pa.get('lost')}", lw, g(x, 'Abelow', 'end'), x.get('junctions', ''))
open(out, 'w').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
