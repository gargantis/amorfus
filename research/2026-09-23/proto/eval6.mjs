import { meshChunk, worldPos, watertight, volume } from './sn.mjs';
const G1 = [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5];
const base = { k: 6, guard: G1, hintedLambda: 0 };
const P = (m, x, y, z) => { for (let v = 0; v < m.V; v++) if (m.cx[v] + m.bx0 === x && m.cy[v] + m.by0 === y && m.cz[v] + m.bz0 === z) return worldPos(m, v); return null; };
const fx = a => a.map(t => t.toFixed(2)).join(',');
// (a) 1x2 tunnel dug along y through solid hinted ground (surface at z=5.3)
{
  const f = (x, y, z) => 5.3 - (z + 0.5);
  const dug = (x, y, z) => x === 0 && (z === 0 || z === 1);
  const occ = (x, y, z) => (dug(x, y, z) ? 0 : f(x, y, z) > 0 ? 1 : 0);
  for (const [lab, extra] of [['symmetric (no edited-air rule)', {}], ['edited-air octants forbidden', { edited: dug }]]) {
    const m = meshChunk(occ, -6, -6, -6, 12, { ...base, hint: f, edited: extra.edited, hintedLambda: 0 });
    // with no edited info, the dug blocks are just binary air with hint disagreement -> saturated
    const w = P(m, 1, 0, 1)[0] - P(m, 0, 0, 1)[0], h = P(m, 0, 0, 2)[2] - P(m, 0, 0, 0)[2];
    console.log(`tunnel 1x2 ${lab.padEnd(32)} width ${w.toFixed(2)} height ${h.toFixed(2)} corner(0,0,0)->${fx(P(m, 0, 0, 0))} corner(1,0,2)->${fx(P(m, 1, 0, 2))} wt ${watertight(m)}`);
  }
}
// (b) bump: place block on hinted ground at 0.3; (c) dent: remove block below
{
  const f = (x, y, z) => 0.3 - (z + 0.5);
  const ground = mm => { let z = 0, n = 0; for (let v = 0; v < mm.V; v++) { const p = worldPos(mm, v); if (Math.hypot(p[0], p[1]) > 4 && Math.hypot(p[0], p[1]) < 5) { z += p[2]; n++; } } return z / n; };
  const plc = (x, y, z) => x === 0 && y === 0 && z === 0;
  let m = meshChunk((x, y, z) => (plc(x, y, z) || f(x, y, z) > 0 ? 1 : 0), -6, -6, -6, 12, { ...base, hint: f, edited: plc });
  let top = -9; for (let v = 0; v < m.V; v++) top = Math.max(top, m.W[3 * v + 2]);
  console.log(`place 1 block on hinted ground (surface ${ground(m).toFixed(2)}): apex ${top.toFixed(2)} -> bump ${(top - ground(m)).toFixed(2)}`);
  const rem = (x, y, z) => x === 0 && y === 0 && z === -1;
  m = meshChunk((x, y, z) => (!rem(x, y, z) && f(x, y, z) > 0 ? 1 : 0), -6, -6, -6, 12, { ...base, hint: f, edited: rem });
  let bot = 9; for (let v = 0; v < m.V; v++) { const p = worldPos(m, v); if (Math.abs(p[0]-0.5) < 1 && Math.abs(p[1]-0.5) < 1) bot = Math.min(bot, p[2]); }
  console.log(`remove 1 block from hinted ground: pit bottom ${bot.toFixed(2)} -> dent ${(ground(m) - bot).toFixed(2)}; rim corner (0,0,0)->${fx(P(m, 0, 0, 0))}`);
  // isolated placed block floating in natural air
  const iso = (x, y, z) => x === 0 && y === 0 && z === 3;
  m = meshChunk((x, y, z) => (iso(x, y, z) || f(x, y, z) > 0 ? 1 : 0), -6, -6, -6, 12, { ...base, hint: f, edited: iso });
  console.log(`floating placed block volume ~ ${(volume(m)).toFixed(2)} (includes closed ground part? n/a) ; corner(0,0,3)->${fx(P(m, 0, 0, 3))}`);
}
