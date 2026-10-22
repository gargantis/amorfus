# Cell-exact tunnel clearance table → stdout (markdown)
import json, os
L = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
print('| regime | n | clear height at width 0.70 (z = 0.75 / 1.5 / 2.25) | clear width at height 1.90 | pass (cell-exact, labels) | D-field clear height at 0.70 (z = 1.5) |')
print('|---|---|---|---|---|---|')
for r in ['BLOCKS','FID-0.4','FID-0.25','FID-0.15','FID-0.1','FID-0.05','FID-0.15-g0.5','FID-0.15-g1.5','CAGE-0.15','CAGE-0.25','CAGE-0.4','FINITE-2','FINITE-4','FINITE-8','FREE','NV-FID-0.15','BOX-NV-FID-0.15','BOX-FID-0.15','BOX0-FID-0.15','BOX0-PAINT-0.15-0.02','BOX0-PAINT-0.1-0.02','FID-0.25@n20','FID-0.15@n20','BOX20-FID-0.15']:
    d = json.load(open(f'{L}/results/{r}.json')); t = d['runs']['tunnel']; c = t['clearCells']
    zs = ['0.75', '1.5', '2.25']
    h = ' / '.join('%.3f' % c[z]['clearHeightAtW'] for z in zs)
    w = ' / '.join('%.3f' % c[z]['clearWidthAtH'] for z in zs)
    ok = 'yes' if all(c[z]['pass'] for z in zs) else 'no'
    print(f"| {r} | {d.get('n', 16)} | {h} | {w} | {ok} | {t['clear']['D']['clearHeightAtW']:.3f} |")
