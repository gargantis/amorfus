# Summary tables from results/<REGIME>.json → stdout (markdown) and results/summary.json
import json, os, sys
L = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REG = ['BLOCKS','FID-0.4','FID-0.25','FID-0.15','FID-0.1','FID-0.05','FID-0.15-g0.5','FID-0.15-g1.5','CAGE-0.15','CAGE-0.25','CAGE-0.4','FINITE-2','FINITE-4','FINITE-8','FREE']
if len(sys.argv) > 2: REG = sys.argv[2].split(',')
R = {r: json.load(open(f'{L}/results/{r}.json'))['runs'] for r in REG if os.path.exists(f'{L}/results/{r}.json')}
def g(r, c, *path):
    v = R.get(r, {}).get(c)
    for p in path:
        if v is None: return None
        v = v[p] if isinstance(v, dict) and p in v else (v[p] if isinstance(v, list) and isinstance(p, int) and p < len(v) else None)
    return v
f = lambda v, d=2: '—' if v is None else (f'{v:.{d}f}' if isinstance(v, (int, float)) and not isinstance(v, bool) else str(v))
which = sys.argv[1] if len(sys.argv) > 1 else 'all'
out = {}
def table(title, cols):
    print(f'\n### {title}\n')
    print('| regime | ' + ' | '.join(c[0] for c in cols) + ' |')
    print('|---|' + '---|' * len(cols))
    for r in REG:
        if r not in R: continue
        def sc(fn):
            try: return fn(r)
            except Exception: return None
        row = [sc(c[1]) for c in cols]
        out.setdefault(title, {})[r] = row
        print(f'| {r} | ' + ' | '.join(f(v, c[2] if len(c) > 2 else 2) for v, c in zip(row, cols)) + ' |')
MIS0 = ['single','pair-same','pair-diff','L3-ABC','sq2-AABB','cube2-same','cube2-oneB','stairs','slab-dot','slab-line','slab-stripe','terrain-step','tunnel','pillar3','ring8','sq2-same','slab-halves']
import statistics as st
MIS = [c for c in MIS0 if all(c in R[r] for r in R)]
safe = lambda fn: (lambda r: (lambda: fn(r))() if True else None)
table('Shape change Δ (sub-cells whose material changed / block volume), mean and max over 17 configs; steps; time', [
  ('Δ mean', lambda r: st.mean([g(r,c,'shapeChange') for c in MIS]), 3),
  ('Δ max', lambda r: max(g(r,c,'shapeChange') for c in MIS), 3),
  ('Δ single', lambda r: g(r,'single','shapeChange'), 3),
  ('Δ terrain', lambda r: g(r,'terrain-step','shapeChange'), 3),
  ('steps median', lambda r: st.median([g(r,c,'steps') for c in MIS]), 0),
  ('steps max', lambda r: max(g(r,c,'steps') for c in MIS), 0),
  ('not converged', lambda r: ' '.join(c for c in MIS if not g(r,c,'converged')) or '0'),
  ('total sim s', lambda r: sum(g(r,c,'ms') for c in MIS)/1000, 1),
  ('terrain s', lambda r: g(r,'terrain-step','ms')/1000, 1),
])
table('Rounding (lab = labels, D = render field); R = circle fit, Req = from the 45° inset', [
  ('cube2 edge R lab', lambda r: g(r,'cube2-same','edge','lab','R')),
  ('cube2 edge Req lab', lambda r: g(r,'cube2-same','edge','lab','Req')),
  ('cube2 edge R D', lambda r: g(r,'cube2-same','edge','D','R')),
  ('cube2 corner Req lab', lambda r: g(r,'cube2-same','corner','lab','Req')),
  ('cube2 face bulge lab', lambda r: g(r,'cube2-same','edge','lab','faceU'), 3),
  ('sq2 plan R lab', lambda r: g(r,'sq2-same','edgePlan','lab','R')),
  ('sq2 plan Req lab', lambda r: g(r,'sq2-same','edgePlan','lab','Req')),
  ('sq2 sect R lab', lambda r: g(r,'sq2-same','edgeSection','lab','R')),
  ('sq2 sect Req lab', lambda r: g(r,'sq2-same','edgeSection','lab','Req')),
  ('sq2 thick lab', lambda r: g(r,'sq2-same','thickness','lab'), 3),
  ('single corner Req lab', lambda r: g(r,'single','corner','lab','Req')),
])
table('Constraints (labels / D)', [
  ('single min extent lab', lambda r: min(g(r,'single','extent','lab') or [None]) if g(r,'single','extent','lab') else None, 3),
  ('single min extent D', lambda r: min(g(r,'single','extent','D')) if g(r,'single','extent','D') else None, 3),
  ('pillar width min lab', lambda r: g(r,'pillar3','widthMin','lab'), 3),
  ('pillar height lab', lambda r: g(r,'pillar3','height','lab'), 3),
  ('tunnel W mid lab', lambda r: g(r,'tunnel','widthMid','lab'), 3),
  ('tunnel H mid lab', lambda r: g(r,'tunnel','heightMid','lab'), 3),
  ('tunnel clearH@0.7 lab', lambda r: g(r,'tunnel','clear','lab','clearHeightAtW'), 3),
  ('tunnel clearH@0.7 D', lambda r: g(r,'tunnel','clear','D','clearHeightAtW'), 3),
  ('tunnel floor lab', lambda r: g(r,'tunnel','floor','lab'), 3),
  ('terrain low centre dy lab', lambda r: g(r,'terrain-step','topLowCentre','lab'), 3),
  ('terrain high centre dy lab', lambda r: g(r,'terrain-step','topHighCentre','lab'), 3),
  ('terrain flat |dy| max lab', lambda r: max(x for x in [g(r,'terrain-step','flatLow','lab','maxAbs'), g(r,'terrain-step','flatHigh','lab','maxAbs')] if x is not None) if g(r,'terrain-step','flatLow','lab','maxAbs') is not None else None, 3),
  ('stairs treads dy lab', lambda r: ' '.join(f(x,3) for x in (g(r,'stairs','treads','lab') or []))),
  ('ring hole W lab', lambda r: g(r,'ring8','holeWidthX','lab'), 3),
])
table('Flat faces away from edges (max |dy| from the original plane, labels; D in brackets)', [
  ('slab-dot top', lambda r: g(r,'slab-dot','flatTop','lab','maxAbs'), 3),
  ('slab-dot top D', lambda r: g(r,'slab-dot','flatTop','D','maxAbs'), 3),
  ('slab-stripe B top', lambda r: g(r,'slab-stripe','flatTopB','lab','maxAbs'), 3),
  ('slab-halves top', lambda r: g(r,'slab-halves','flatTop','lab','maxAbs'), 3),
  ('slab-halves top D', lambda r: g(r,'slab-halves','flatTop','D','maxAbs'), 3),
  ('slab-line B top', lambda r: g(r,'slab-line','flatTopB','lab','maxAbs'), 3),
  ('terrain low', lambda r: g(r,'terrain-step','flatLow','lab','maxAbs'), 3),
  ('terrain high', lambda r: g(r,'terrain-step','flatHigh','lab','maxAbs'), 3),
  ('vol lab worst phase', lambda r: max(g(r,c,'vol','labWorstPhaseRel') for c in MIS), 4),
  ('vol D total worst', lambda r: max(abs(g(r,c,'vol','DTotalRel')) for c in MIS), 4),
])
table('Seams and painted features', [
  ('halves groove depth lab', lambda r: g(r,'slab-halves','groove','lab','depth'), 3),
  ('halves flat-orig lab', lambda r: g(r,'slab-halves','groove','lab','flatVsOrig'), 3),
  ('halves groove depth D', lambda r: g(r,'slab-halves','groove','D','depth'), 3),
  ('halves opening D w1', lambda r: g(r,'slab-halves','groove','D','angles',0,'opening'), 1),
  ('halves opening D w2', lambda r: g(r,'slab-halves','groove','D','angles',1,'opening'), 1),
  ('AABB groove depth lab', lambda r: g(r,'sq2-AABB','groove','lab','depth'), 3),
  ('AABB groove depth D', lambda r: g(r,'sq2-AABB','groove','D','depth'), 3),
  ('stripe seam depth lab', lambda r: g(r,'slab-stripe','seamGroove','lab','depth'), 3),
  ('stripe A top lab min/max', lambda r: (lambda s: None if not s else f"{s['min']:.3f}/{s['max']:.3f}")(g(r,'slab-stripe','stripeTop','lab'))),
  ('line band mean top', lambda r: g(r,'slab-line','bandTop','mean'), 3),
  ('line band sd top', lambda r: g(r,'slab-line','bandTop','sd'), 3),
  ('line band sd mid', lambda r: g(r,'slab-line','bandMid','sd'), 3),
  ('line junctions', lambda r: g(r,'slab-line','junctions')),
  ('line A phases', lambda r: g(r,'slab-line','phasesEnd','6')),
  ('dot top extent', lambda r: g(r,'slab-dot','dotTopExtentX_lab'), 3),
])
json.dump(out, open(f'{L}/results/summary-{which}.json','w'), indent=1, default=str)
