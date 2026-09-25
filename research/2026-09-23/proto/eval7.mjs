import { meshChunk, worldPos } from './sn.mjs';
const G1 = [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5];
const P = (m, x, y, z) => { for (let v = 0; v < m.V; v++) if (m.cx[v] + m.bx0 === x && m.cy[v] + m.by0 === y && m.cz[v] + m.bz0 === z) return worldPos(m, v); return null; };
// minimal clearance of the 1x2 tunnel cross-section (y=0 plane): min over wall vertex pairs
for (const hE of [0, 0.1, 0.2, 0.3, 0.5]) {
  const f = (x, y, z) => 5.3 - (z + 0.5);
  const dug = (x, y, z) => x === 0 && (z === 0 || z === 1);
  const dug2 = (x, y, z) => (x === 0 || x === 1) && (z >= 0 && z <= 2);
  const r = [];
  for (const [lab, D] of [['1x2', dug], ['2x3', dug2]]) {
    const occ = (x, y, z) => (D(x, y, z) ? 0 : f(x, y, z) > 0 ? 1 : 0);
    const m = meshChunk(occ, -6, -6, -6, 12, { k: 6, guard: G1, hint: f, edited: D, hintedLambda: 0, hEdited: hE });
    const W = lab === '1x2' ? 1 : 2, H = lab === '1x2' ? 2 : 3;
    let minW = 9, minH = 9;
    for (let z = 0; z <= H; z++) minW = Math.min(minW, P(m, W, 0, z)[0] - P(m, 0, 0, z)[0]);
    for (let x = 0; x <= W; x++) minH = Math.min(minH, P(m, x, 0, H)[2] - P(m, x, 0, 0)[2]);
    r.push(`${lab}: min width ${minW.toFixed(2)} min height ${minH.toFixed(2)} (corner (0,0,0)->${P(m, 0, 0, 0).map(t => t.toFixed(2))})`);
  }
  console.log(`hEdited ${hE}: ` + r.join(' | '));
}
