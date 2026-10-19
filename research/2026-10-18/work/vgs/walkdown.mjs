import { MeshWorld, run, spawn, binary, placed, f2 } from './phys.mjs';
for (const n of [1, 2, 4]) {
  const fn = (x, y) => { if (y < 8) return binary(y); const h = x < 6 ? 0 : x >= 26 ? 0 : Math.min(12, Math.floor((26 - x) / n)); return y < 8 + h ? placed() : { v: 0 }; };
  const row = [];
  for (const v of ['hints', 'gs-ctx', 'gs-mls']) {
    const w = new MeshWorld(fn, v).build(0, 0, 0);
    const top = Math.min(12, Math.floor((26 - 8) / n));
    const r = run(w, spawn(8.5, 8 + top + 1, 16.5), { move: [0, 1], yaw: -Math.PI / 2 }, 6);
    row.push(`${v} end x ${f2(r.s.position[0])} y ${f2(r.s.position[1])} pen ${f2(r.maxPen)}`);
  }
  console.log(`walk DOWN built 1:${n} stairs: ${row.join(' | ')}`);
}
