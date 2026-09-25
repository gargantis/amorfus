import { meshChunk, worldPos } from './sn.mjs';
const G1 = [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5];
// tunnel along y: air at x=0, z in {0,1}; everything else solid within region
for (const [name, o] of [['k6 G1 hAir.2', { k: 6, guard: G1, hAir: 0.2 }]]) {
  for (const [label, W] of [
    ['1x2 tunnel', (x, y, z) => (x === 0 && (z === 0 || z === 1) ? 0 : 1)],
    ['1x1 tunnel', (x, y, z) => (x === 0 && z === 0 ? 0 : 1)],
    ['2x2 tunnel', (x, y, z) => ((x === 0 || x === 1) && (z === 0 || z === 1) ? 0 : 1)],
    ['1-wide trench 2 deep', (x, y, z) => (z >= 0 || (x === 0 && z >= -2) ? 0 : 1)],
  ]) {
    const m = meshChunk(W, -6, -6, -6, 12, o);
    // cross-section at y = 0 corner plane: min free width at mid-height and free height at x=0.5 line
    const P = new Map(); for (let v = 0; v < m.V; v++) { const c = [m.cx[v] + m.bx0, m.cy[v] + m.by0, m.cz[v] + m.bz0]; if (c[1] === 0) P.set(c[0] + ',' + c[2], worldPos(m, v)); }
    const g = (x, z) => P.get(x + ',' + z);
    let s;
    if (label === '1x2 tunnel') s = `width@z=1: ${(g(1, 1)[0] - g(0, 1)[0]).toFixed(2)}, corners(0,0)->${g(0, 0).map(t => t.toFixed(2)).slice(0, 3)} ; height ~ ${(g(0, 2)[2] - g(0, 0)[2]).toFixed(2)}..${(g(1, 2)[2] - g(1, 0)[2]).toFixed(2)}`;
    if (label === '1x1 tunnel') s = `diag corners (0,0)->(1,1): dx ${(g(1, 1)[0] - g(0, 0)[0]).toFixed(2)} dz ${(g(1, 1)[2] - g(0, 0)[2]).toFixed(2)}`;
    if (label === '2x2 tunnel') s = `width@z=1: ${(g(2, 1)[0] - g(0, 1)[0]).toFixed(2)}, height@x=1: ${(g(1, 2)[2] - g(1, 0)[2]).toFixed(2)}`;
    if (label === '1-wide trench 2 deep') s = `width@z=-1: ${(g(1, -1)[0] - g(0, -1)[0]).toFixed(2)}, floor z ${g(0, -2)[2].toFixed(2)}/${g(1, -2)[2].toFixed(2)}`;
    console.log(name.padEnd(12), label.padEnd(22), s);
  }
}
