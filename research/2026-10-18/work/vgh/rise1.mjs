// VGH: a PLACED 1-block rise (one row of placed blocks, x >= 12, y = 8) on
// natural (hinted) ground whose surface is at 8 + φ, swept finely over the
// hint phase φ. PLAN §14: "Walk up a built smooth 1-block rise". The gh
// battery tested φ 0, 0.25, 0.45 only; vgs's battery-rises found φ −0.45
// failing under gh-cc8b. Also the riser profile from an exact slice.
//   node work/vgh/rise1.mjs [variants] [step]
import { MeshWorld, run, spawn, natural, placed, f2, yawTo } from './phys.mjs';
import { meshWorld, slice } from './viz.mjs';

const variants = (process.argv[2] ?? 'hints,gs-ctx,gh-cc8b').split(',');
const step = Number(process.argv[3] ?? 0.05);
const PH = [];
for (let p = -0.49; p <= 0.4901; p += step) PH.push(Math.round(p * 100) / 100);
const scene = (ph) => (x, y) => (y === 8 && x >= 12 ? placed() : natural(y, 8 + ph));
const tries = [
  ['walk', { move: [0, 1], yaw: -Math.PI / 2 }, 6.5, 16.5],
  ['sprint', { move: [0, 1], yaw: -Math.PI / 2, sprint: true }, 6.5, 16.5],
  ['walk30', { move: [0, 1], yaw: yawTo(Math.cos(0.52), Math.sin(0.52)) }, 6.5, 10.5],
  ['walk60', { move: [0, 1], yaw: yawTo(Math.cos(1.05), Math.sin(1.05)) }, 8.5, 6.5],
];
/** profile metrics on the slice z = 16.5: the tallest part of the riser
 *  steeper than 50° (a wall the player must step over), and the max angle. */
function riser(mesh) {
  const segs = slice(mesh, 2, 16.5).filter((s) => Math.max(s[0], s[2]) > 10 && Math.min(s[0], s[2]) < 14);
  // vertical extent of segments steeper than 50°
  let wall = 0, maxAng = 0, wallLo = Infinity, wallHi = -Infinity;
  for (const [u0, y0, u1, y1] of segs) {
    const du = Math.abs(u1 - u0), dy = Math.abs(y1 - y0);
    const ang = (Math.atan2(dy, du) * 180) / Math.PI;
    if (ang > maxAng) maxAng = ang;
    if (ang > 50) { wall += dy; wallLo = Math.min(wallLo, y0, y1); wallHi = Math.max(wallHi, y0, y1); }
  }
  return { wall, maxAng, wallLo, wallHi };
}
const rows = {};
for (const v of variants) rows[v] = [];
console.log(`placed 1-block rise on natural ground 8+φ; cells: number of the ${tries.length} approaches (${tries.map((t) => t[0]).join(', ')}) that walk up; wall = vertical extent of >50° riser segments (step-up 0.6)`);
for (const ph of PH) {
  const line = [`φ${ph >= 0 ? '+' : ''}${ph.toFixed(2)}`];
  for (const v of variants) {
    const w = new MeshWorld(scene(ph), v).build(0, 0, 0);
    let up = 0;
    const fails = [];
    for (const [label, inp, x0, z0] of tries) {
      const r = run(w, spawn(x0, 8.2 + ph, z0), inp, 3.5, { probe: false });
      const ok = r.s.position[0] > 14 && r.s.position[1] > 8.6;
      if (ok) up++; else fails.push(`${label}@${f2(r.s.position[0])},${f2(r.s.position[1])}`);
    }
    const pr = riser(meshWorld(scene(ph), v));
    rows[v].push(up);
    line.push(`${v} ${up}/${tries.length} wall ${pr.wall.toFixed(2)} [${f2(pr.wallLo)}..${f2(pr.wallHi)}] max ${pr.maxAng.toFixed(0)}°${fails.length ? ' ' + fails.join(' ') : ''}`);
  }
  console.log(line.join(' | '));
}
for (const v of variants) {
  const bad = rows[v].map((u, i) => (u < tries.length ? PH[i] : null)).filter((p) => p !== null);
  console.log(`${v}: phases with a failed approach: ${bad.length}/${PH.length} ${bad.length ? `(${bad.join(', ')})` : ''}`);
}
