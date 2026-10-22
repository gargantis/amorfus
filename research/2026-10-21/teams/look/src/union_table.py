# Union table from results/union-<REGIME>.json → markdown on stdout
import json, os
L = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REG = ['FID-0.4','FID-0.25','FID-0.15','FID-0.1','FID-0.05','FID-0.15-g0.5','FID-0.15-g1.5','CAGE-0.15','CAGE-0.25','CAGE-0.4','FINITE-2','FINITE-4','FINITE-8','FREE150','FREE']
print('| regime | diag-edge: merged / connected (j0; s1 s2 s3) | diag-corner merged | sq2-checker: A,B phases at end; junction | slab-line: A phases at end; B; junctions 1-5 |')
print('|---|---|---|---|---|')
for r in REG:
    p = f'{L}/results/union-{r}.json'
    if not os.path.exists(p): continue
    d = json.load(open(p))['runs']
    def cell_edge(runs):
        return '; '.join(f"{'y' if x['unitedA'] else 'n'}/{'y' if x.get('junction') == 'A' else 'n'}" for x in runs)
    def cell_corner(runs):
        return ' '.join('y' if x['unitedA'] else 'n' for x in runs)
    def cell_checker(runs):
        return '; '.join(f"{x['end'].get('6',0)},{x['end'].get('7',0)} {x['junction']}" for x in runs)
    def cell_line(runs):
        return '; '.join(f"{x['end'].get('6',0)} {x['end'].get('7',0)} {x['junctions']}" for x in runs)
    print(f"| {r} | {cell_edge(d['diag-edge'])} | {cell_corner(d['diag-corner'])} | {cell_checker(d['sq2-checker'])} | {cell_line(d['slab-line'])} |")
