// Cross-section of the tall-foot bypass riser (scene A of bypass-sweep.mjs) at z = 16.5.
import { meshWorld, slice, plotProfiles, steepest, IMG } from './viz.mjs';
import { natural, placed } from './phys.mjs';
import { join } from 'node:path';
const COL = { cubes: [120, 120, 120], hints: [30, 90, 220], 'gs-ctx': [240, 140, 0], 'gs-mls': [220, 20, 20] };
for (const ph of [0, 0.3]) {
  const fn = (x, y) => (x >= 12 && y === 9 ? placed() : natural(y, 8 + ph + (x + 0.5 >= 12 ? 1 : 0)));
  const lines = [];
  const notes = [];
  for (const v of ['cubes', 'hints', 'gs-ctx', 'gs-mls']) {
    const segs = slice(meshWorld(fn, v), 2, 16.5);
    lines.push({ segs, rgb: COL[v], w: v === 'gs-mls' ? 2 : 1 });
    // riser = the part of the profile between x 10.5 and 13.5
    const rs = segs.filter((s) => Math.min(s[0], s[2]) > 10.5 && Math.max(s[0], s[2]) < 13.5);
    // walkability: max slope among riser segments
    notes.push(`${v}: steepest riser segment ${steepest(rs, 8 + ph + 0.05, 9.95).toFixed(0)}°`);
  }
  const cells = (u, y) => { const c = fn(u, y, 16); return c.v === 0 ? 0 : c.edited ? 2 : 1; };
  const f = plotProfiles(join(IMG, `bypass-A-phase${ph}-profile.png`), { u0: 9, u1: 15, y0: 7, y1: 11, S: 100, cells, lines, marks: [{ a: [10, 8 + ph], b: [10 + 2 / Math.tan((50 * Math.PI) / 180), 10 + ph], rgb: [0, 150, 0] }] });
  console.log(f, '\n  ' + notes.join('\n  '));
}
