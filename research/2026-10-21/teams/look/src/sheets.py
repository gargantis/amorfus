# Contact sheets for team look: python3 src/sheets.py <name> → sheets/<name>*.png via lib/sheet.py
import json, os, subprocess, sys
L = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = os.path.join(os.path.dirname(os.path.dirname(L)), 'lib', 'sheet.py')
MIS = ['single','pair-same','pair-diff','L3-ABC','sq2-AABB','cube2-same','cube2-oneB','stairs','slab-dot','slab-line','slab-stripe','terrain-step','tunnel','pillar3','ring8','sq2-same','slab-halves']
def sheet(out, title, cols, items, cell=(240, 180)):
    spec = {'out': f'{L}/sheets/{out}.png', 'cols': cols, 'title': title, 'cell': list(cell), 'items': items}
    p = f'{L}/sheets/{out}.json'
    json.dump(spec, open(p, 'w'), indent=0)
    subprocess.run(['python3', LIB, p], check=True)
def spectrum(out, title, regs, cfgs, kind='view', cell=(240,180)):
    items = []
    for c in cfgs:
        for r in regs:
            path = f'{L}/img/{r}/{c}-{kind}.png'
            if not os.path.exists(path): path = f'{L}/img/{r}/{c}-view.png'
            items.append({'path': path, 'label': f'{c}\n{r}'})
    sheet(out, title, len(regs), items, cell)
which = sys.argv[1]
if which == 'fid':
    regs = ['BLOCKS','FID-0.4','FID-0.25','FID-0.15','FID-0.1','FID-0.05','FREE']
    spectrum('spectrum-fid-1', 'Spectrum, fidelity family (views; n 16, s 0.2, g 1). Rows: configuration; columns: regime', regs, MIS[:9])
    spectrum('spectrum-fid-2', 'Spectrum, fidelity family (views; n 16, s 0.2, g 1), continued', regs, MIS[9:])
if which == 'cf':
    regs = ['BLOCKS','CAGE-0.15','CAGE-0.25','CAGE-0.4','FINITE-2','FINITE-4','FINITE-8','FREE']
    spectrum('spectrum-cage-finite-1', 'Spectrum, cage and finite-time families (views; n 16, s 0.2, g 1)', regs, MIS[:9])
    spectrum('spectrum-cage-finite-2', 'Spectrum, cage and finite-time families (views), continued', regs, MIS[9:])
if which == 'slices':
    regs = ['BLOCKS','FID-0.25','FID-0.15','FID-0.1','FID-0.05','CAGE-0.15','CAGE-0.25','FINITE-2','FINITE-4','FINITE-8','FREE']
    spectrum('slices-1', 'Slices across regimes (labels re-blurred; black = film between bubbles, white = air surface)', regs, ['cube2-same','sq2-same','tunnel','terrain-step','stairs','pillar3'], 'slice', (200, 200))
    spectrum('slices-2', 'Slices across regimes, painted layers (plan at y = 0.5)', regs, ['slab-dot','slab-line','slab-stripe','slab-halves','ring8'], 'slice', (200, 200))
if which == 'g':
    regs = ['FID-0.15-g0.5','FID-0.15','FID-0.15-g1.5']
    cfgs = ['pair-diff','L3-ABC','sq2-AABB','cube2-oneB','slab-dot','slab-line','slab-stripe','terrain-step','slab-halves']
    items = []
    for c in cfgs:
        for r in regs:
            items.append({'path': f'{L}/img/{r}/{c}-view.png', 'label': f'{c}\n{r.replace("FID-0.15", "FID-0.15 g1") if r == "FID-0.15" else r}'})
        sec = 'sec' if os.path.exists(f'{L}/img/FID-0.15/{c}-sec.png') else 'slice'
        for r in regs:
            items.append({'path': f'{L}/img/{r}/{c}-{sec}.png', 'label': f'{c} ({sec})\n{r}'})
    sheet('film-tension-g', 'FID-0.15 with film tension g = 0.5 / 1 / 1.5 (views, then slices)', 6, items, (220, 165))
