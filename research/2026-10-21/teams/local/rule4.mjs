// Score a deterministic local rule for ambiguous contacts against the physics
// verdicts in res/t4-summary.json. Rule ("minority connects"):
//  - at a lattice edge whose 4 surrounding blocks (in the plane across the
//    edge) are a diagonal pair of material m1 and a diagonal pair of m2 != m1:
//      * m2 = air            -> m1 connects
//      * else count m1 and m2 blocks in the window 4 x 4 across the edge and
//        3 layers along it (the edge's layer +-1): the strictly smaller count
//        connects; equal -> nobody connects
//  - blocks touching only at a corner never connect.
// Output: per config the rule's verdict (A, B, both, none) and agreement per regime.
import { readFileSync, writeFileSync } from 'node:fs';
import { byName } from '../../lib/configs.mjs';
const A = 6, B = 7;
const plan = (rows, y = 0) => { const M = { A, B }; const o = []; rows.forEach((r, z) => [...r].forEach((ch, x) => { if (M[ch]) o.push([x, y, z, M[ch]]); })); return o; };
const box = (x0, y0, z0, x1, y1, z1, m) => { const o = []; for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) o.push([x, y, z, m]); return o; };
const ARMS = { A1: [[1, 0], [0, 1], [0, 0]], A2: [[2, 3], [3, 2], [3, 3]], B1: [[3, 1], [2, 0], [3, 0]], B2: [[0, 2], [1, 3], [0, 3]] };
const checker = (sa, sb, layers = 1) => { const cells = [[1, 1, A], [2, 2, A], [2, 1, B], [1, 2, B]]; for (let i = 0; i < sa - 1; i++) cells.push([...ARMS.A1[i], A], [...ARMS.A2[i], A]); for (let i = 0; i < sb - 1; i++) cells.push([...ARMS.B1[i], B], [...ARMS.B2[i], B]); const o = []; for (let y = 0; y < layers; y++) for (const [x, z, m] of cells) o.push([x, y, z, m]); return o; };
const CFG = {
  ...Object.fromEntries([[1, 1], [1, 2], [1, 4], [2, 1], [4, 1], [2, 2], [2, 4], [4, 2], [4, 4]].map(([a, b]) => [`checker-A${a}-B${b}`, checker(a, b)])),
  'diag-edge': byName('diag-edge').blocks, 'diag-edge-3v3': plan(['AA..', 'A.AA', '..A.']), 'diag-edge-3v1': plan(['AA.', 'A.A']),
  'diag-corner': byName('diag-corner').blocks, 'cube2-checker': byName('cube2-checker').blocks,
  'cube2-cornerA': box(0, 0, 0, 1, 1, 1, B).map((b) => ((b[0] + b[1] + b[2]) % 3 === 0 ? [b[0], b[1], b[2], A] : b)),
  'cube2-edgeA': box(0, 0, 0, 1, 1, 1, B).map((b) => (b[2] === 0 && b[0] === b[1] ? [b[0], b[1], b[2], A] : b)),
  'checker-2layer': checker(1, 1, 2),
  'slab-line': byName('slab-line').blocks, 'slab-line4': plan(['ABBB', 'BABB', 'BBAB', 'BBBA']),
  'slab-antiline': byName('slab-line').blocks.map(([x, y, z, m]) => [x, y, z, m === A ? B : A]),
  'slab-line-2high': [...byName('slab-line').blocks, ...byName('slab-line').blocks.map(([x, , z, m]) => [x, 1, z, m])],
};
function rule(blocks) {
  const at = new Map(blocks.map((b) => [`${b[0]},${b[1]},${b[2]}`, b[3]]));
  const get = (x, y, z) => at.get(`${x},${y},${z}`) ?? 0;
  const lo = [0, 1, 2].map((t) => Math.min(...blocks.map((b) => b[t])) - 1), hi = [0, 1, 2].map((t) => Math.max(...blocks.map((b) => b[t])) + 1);
  const connects = new Set(); const xs = [];
  for (const axis of [0, 1, 2]) {
    const [u, v] = [0, 1, 2].filter((t) => t !== axis);
    for (let a = lo[axis]; a <= hi[axis]; a++) for (let cu = lo[u] + 1; cu <= hi[u]; cu++) for (let cv = lo[v] + 1; cv <= hi[v]; cv++) {
      // edge along `axis` in block layer a, at lattice line (cu, cv) across it
      const P = (du, dv) => { const p = [0, 0, 0]; p[axis] = a; p[u] = cu + du; p[v] = cv + dv; return get(...p); };
      const q00 = P(-1, -1), q11 = P(0, 0), q10 = P(0, -1), q01 = P(-1, 0);
      if (!(q00 === q11 && q10 === q01 && q00 !== q10)) continue;
      const m1 = q00 || q10, m2 = q00 ? q10 : q00; // m1 solid; m2 the other (maybe air)
      if (q00 === 0 && q10 === 0) continue;
      if (m2 === 0) { connects.add(m1); xs.push({ axis, a, cu, cv, m1, m2, verdict: m1 }); continue; }
      let n1 = 0, n2 = 0;
      for (let da = -1; da <= 1; da++) for (let du = -2; du < 2; du++) for (let dv = -2; dv < 2; dv++) {
        const p = [0, 0, 0]; p[axis] = a + da; p[u] = cu + du; p[v] = cv + dv; const m = get(...p);
        if (m === q00) n1++; else if (m === q10) n2++;
      }
      const verdict = n1 < n2 ? q00 : n2 < n1 ? q10 : 0;
      if (verdict) connects.add(verdict);
      xs.push({ axis, a, cu, cv, m1: q00, m2: q10, n1, n2, verdict });
    }
  }
  const uA = connects.has(A), uB = connects.has(B);
  return { verdict: uA && uB ? 'both' : uA ? 'A' : uB ? 'B' : 'none', xs: xs.length, sample: xs.slice(0, 3) };
}
const phys = JSON.parse(readFileSync(new URL('./res/t4-summary.json', import.meta.url)));
const regs = ['FID-0.15', 'FID-0.05', 'FINITE-4', 'CAGE-0.25', 'FREE'];
const out = { rule: 'minority connects (4x4 across the edge, 3 layers along), ties none, air-X connects, corner-only never', configs: {}, agreement: {} };
for (const r of regs) out.agreement[r] = { agree: 0, disagree: 0, tie: 0, list: [] };
for (const [name, blocks] of Object.entries(CFG)) {
  const R = rule(blocks);
  const row = { rule: R.verdict, xEdges: R.xs, sample: R.sample, physics: {} };
  for (const reg of regs) {
    const p = phys.table[name]?.[reg]; if (!p) continue;
    row.physics[reg] = p.verdict;
    // compare on the deterministic variants (j0 and rev) when the seeds split
    const det = [p.outs[0], p.outs[4]].map((o) => o.replace(/[*!(].*$/, '')).filter((o) => o && o !== '-');
    const physV = p.agree ? p.verdict : (new Set(det).size === 1 ? det[0] : 'split');
    const ok = physV === R.verdict;
    out.agreement[reg][ok ? 'agree' : 'disagree']++;
    if (!p.agree) out.agreement[reg].tie++;
    if (!ok) out.agreement[reg].list.push(`${name}: rule ${R.verdict}, physics ${p.verdict}`);
  }
  out.configs[name] = row;
}
writeFileSync(new URL('./res/t4-rule-score.json', import.meta.url), JSON.stringify(out, null, 1));
for (const [n, row] of Object.entries(out.configs)) console.log(n.padEnd(16), 'rule', row.rule.padEnd(5), '| physics', JSON.stringify(row.physics));
for (const [r, a] of Object.entries(out.agreement)) console.log(r.padEnd(10), `agree ${a.agree} disagree ${a.disagree} (seed-split configs ${a.tie}, compared on j0/rev)`, a.list.join('; '));
