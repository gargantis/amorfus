// FINAL spec check: hints + shapeEdited + guard G1 + hE=0.2 (majority rule, edited cells only) + axis sharp pins, k=6
import { meshChunk, worldPos, watertight, volume } from './sn.mjs';
const G1 = [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5];
const FINAL = { k: 6, guard: G1, hAir: 0.2, hAirEditedOnly: true, editedAirRule: 'none', sharpMode: 'axis', hintedLambda: 0 };
const P = (m, x, y, z) => { for (let v = 0; v < m.V; v++) if (m.cx[v] + m.bx0 === x && m.cy[v] + m.by0 === y && m.cz[v] + m.bz0 === z) return worldPos(m, v); return null; };
const maxZnear = (m, r) => { let t = -9; for (let v = 0; v < m.V; v++) { const p = worldPos(m, v); if (Math.abs(p[0] - .5) <= r && Math.abs(p[1] - .5) <= r) t = Math.max(t, p[2]); } return t; };
const minZnear = (m, r) => { let t = 9; for (let v = 0; v < m.V; v++) { const p = worldPos(m, v); if (Math.abs(p[0] - .5) <= r && Math.abs(p[1] - .5) <= r) t = Math.min(t, p[2]); } return t; };
for (const mode of ['hinted', 'binary-fallback']) {
  const out = [];
  const g0 = mode === 'hinted' ? 0.3 : 0.0;
  const f = (x, y, z) => g0 - (z + 0.5) + (mode === 'hinted' ? 0 : 0.5); // binary: ground top at z=0
  const hint = mode === 'hinted' ? f : null;
  const opt = { ...FINAL, hint };
  const gnd = (x, y, z) => (f(x, y, z) > 0 ? 1 : 0);
  // bump
  const b = (x, y, z) => !x && !y && z === (mode === 'hinted' ? 0 : 0);
  let m = meshChunk((x, y, z) => (b(x, y, z) || gnd(x, y, z) ? 1 : 0), -6, -6, -6, 12, { ...opt, edited: b });
  out.push(`bump +${(maxZnear(m, 0.6) - g0).toFixed(2)}`);
  const d = (x, y, z) => !x && !y && z === -1;
  m = meshChunk((x, y, z) => (!d(x, y, z) && gnd(x, y, z) ? 1 : 0), -6, -6, -6, 12, { ...opt, edited: d });
  out.push(`dent -${(g0 - minZnear(m, 0.6)).toFixed(2)}`);
  const iso = (x, y, z) => !x && !y && z === 4;
  m = meshChunk((x, y, z) => (iso(x, y, z) ? 1 : 0), -6, -6, -6, 12, { ...opt, hint: null, edited: iso });
  out.push(`floating block vol ${volume(m).toFixed(2)}`);
  const pil = (x, y, z) => !x && !y && z >= 0 && z < 6;
  m = meshChunk((x, y, z) => (pil(x, y, z) || gnd(x, y, z) ? 1 : 0), -6, -6, -6, 12, { ...opt, edited: pil });
  out.push(`pillar w ${(P(m, 1, 1, 3)[0] - P(m, 0, 0, 3)[0]).toFixed(2)}`);
  // tunnel through a hill (surface z=5.3 hinted)
  const fh = (x, y, z) => 5.3 - (z + 0.5);
  for (const [lab, D, W, H] of [['1x2', (x, y, z) => x === 0 && (z === 0 || z === 1), 1, 2], ['2x3', (x, y, z) => (x === 0 || x === 1) && z >= 0 && z <= 2, 2, 3]]) {
    m = meshChunk((x, y, z) => (D(x, y, z) ? 0 : fh(x, y, z) > 0 ? 1 : 0), -6, -6, -6, 12, { ...opt, hint: mode === 'hinted' ? fh : null, edited: D });
    let minW = 9, minH = 9;
    for (let z = 0; z <= H; z++) minW = Math.min(minW, P(m, W, 0, z)[0] - P(m, 0, 0, z)[0]);
    for (let x = 0; x <= W; x++) minH = Math.min(minH, P(m, x, 0, H)[2] - P(m, x, 0, 0)[2]);
    out.push(`dug ${lab} clear ${minW.toFixed(2)}x${minH.toFixed(2)}`);
  }
  // built doorway: smooth placed wall (edited) 1 thick, 4 tall, with 1x2 opening of natural air
  const wall = (x, y, z) => x === 0 && z >= 0 && z < 4 && !(y === 0 && z <= 1);
  m = meshChunk((x, y, z) => (wall(x, y, z) || gnd(x, y, z) ? 1 : 0), -6, -6, -6, 12, { ...opt, edited: wall });
  { let minW = 9; for (let z = 0; z <= 2; z++) minW = Math.min(minW, P(m, 0, 1, z)[1] - P(m, 0, 0, z)[1]); const hh = P(m, 0, 0, 2)[2] - Math.max(g0, 0); out.push(`built door clear ${minW.toFixed(2)}x${hh.toFixed(2)}`); }
  console.log(mode.padEnd(16), out.join(' | '));
}
