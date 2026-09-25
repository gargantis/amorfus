import { meshChunk, worldPos, volume, watertight } from './sn.mjs';

const f = (x, d = 3) => (Math.round(x * 10 ** d) / 10 ** d).toFixed(d);
function vAt(m, x, y, z) { // world corner -> vertex position
  for (let v = 0; v < m.V; v++) if (m.cx[v] + m.bx0 === x && m.cy[v] + m.by0 === y && m.cz[v] + m.bz0 === z) return worldPos(m, v);
  return null;
}

const variants = [
  { name: 'corner k0 (=cubes)', init: 'corner', k: 0 },
  { name: 'centroid k0 (naive SN, NoCubes default)', init: 'centroid', k: 0 },
  { name: 'corner k2 l.5 h.5', init: 'corner', k: 2 },
  { name: 'corner k4 l.5 h.5 (hypothesis)', init: 'corner', k: 4 },
  { name: 'corner k8 l.5 h.5', init: 'corner', k: 8 },
  { name: 'corner k4 l1.0 h.5 (undamped)', init: 'corner', k: 4, lambda: 1.0 },
  { name: 'corner k4 gibson-links', init: 'corner', k: 4, links: 'gibson' },
  { name: 'centroid k2 l.5 h.5', init: 'centroid', k: 2 },
  { name: 'centroid k4 l.5 h.5', init: 'centroid', k: 4 },
  { name: 'corner k4 h.35', init: 'corner', k: 4, clamp: 0.35 },
  { name: 'centroid k4 h.35', init: 'centroid', k: 4, clamp: 0.35 },
  { name: 'corner k4 taubin(.5,-.53)', init: 'corner', k: 4, taubinMu: -0.53 },
  { name: 'corner k8 taubin(.5,-.53)', init: 'corner', k: 8, taubinMu: -0.53 },
];

const ground = (x, y, z) => (z < 0 ? 1 : 0);
const scen = {
  bump: (x, y, z) => (z < 0 || (x === 0 && y === 0 && z === 0) ? 1 : 0),
  dent: (x, y, z) => (z < 0 && !(x === 0 && y === 0 && z === -1) ? 1 : 0),
  iso: (x, y, z) => (x === 0 && y === 0 && z === 0 ? 1 : 0),
  wall: (x, y, z) => (z < 0 || (x === 0 && z >= 0 && z < 5) ? 1 : 0),
  pillar: (x, y, z) => (z < 0 || (x === 0 && y === 0 && z >= 0 && z < 6) ? 1 : 0),
  slab: (x, y, z) => (z === 0 ? 1 : 0),
  twoByTwo: (x, y, z) => (z < 0 || (x >= 0 && x < 2 && y >= 0 && y < 2 && z === 0) ? 1 : 0),
};

for (const va of variants) {
  const o = { ...va, apron: (va.k ?? 4) + 3 };
  const r = [];
  // bump: apex = max z over vertices
  let m = meshChunk(scen.bump, -6, -6, -6, 12, o);
  let top = -1e9; for (let v = 0; v < m.V; v++) top = Math.max(top, m.W[3 * v + 2]);
  const apex = vAt(m, 0, 0, 1);
  r.push(`bump h=${f(top)}`);
  // bump footprint: how far from block does ground rise > 0.01
  // dent: min z of pit
  m = meshChunk(scen.dent, -6, -6, -6, 12, o);
  let bot = 1e9; for (let v = 0; v < m.V; v++) { const z = m.W[3 * v + 2]; if (z > -1.6) bot = Math.min(bot, z); }
  r.push(`dent d=${f(-bot)}`);
  // isolated block
  m = meshChunk(scen.iso, -6, -6, -6, 12, o);
  r.push(`iso vol=${f(volume(m))} wt=${watertight(m)}`);
  // 2x2 slab on ground (a 'placed pad')
  m = meshChunk(scen.twoByTwo, -6, -6, -6, 12, o);
  top = -1e9; for (let v = 0; v < m.V; v++) top = Math.max(top, m.W[3 * v + 2]);
  r.push(`2x2pad h=${f(top)}`);
  // wall thickness at mid height, mid y
  m = meshChunk(scen.wall, -6, -6, -6, 12, o);
  let a = vAt(m, 0, 0, 3), b = vAt(m, 1, 0, 3);
  r.push(`wall t=${f(b[0] - a[0])} top=${f(vAt(m, 0, 0, 5)[2])}`);
  // pillar
  m = meshChunk(scen.pillar, -6, -6, -6, 12, o);
  a = vAt(m, 0, 0, 3); b = vAt(m, 1, 1, 3);
  r.push(`pillar w=${f(b[0] - a[0])} top=${f(vAt(m, 0, 0, 6)[2])}`);
  // slab thickness (infinite floating slab, 1 thick)
  m = meshChunk(scen.slab, -6, -6, -6, 12, o);
  a = vAt(m, 0, 0, 0); b = vAt(m, 0, 0, 1);
  r.push(`slab t=${f(b[2] - a[2])}`);
  console.log(va.name.padEnd(42), r.join(' | '));
}
