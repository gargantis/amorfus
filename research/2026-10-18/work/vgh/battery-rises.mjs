// VGS battery 1: rises and steps with the REAL controller.
//   node work/vgs/battery-rises.mjs [variant,...]
import { MeshWorld, run, follow, spawn, natural, placed, binary, STONE, f2, yawTo } from './phys.mjs';

const variants = (process.argv[2] ?? 'cubes,hints,gs-ctx,gs-mls').split(',');
const PHASES = [-0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45];
const tests = [];
const T = (name, fn, body) => tests.push({ name, fn, body });
const EAST = { move: [0, 1], yaw: -Math.PI / 2 };

// --- 1-block rises (must be walkable) ---
T('1-rise binary: walk up', (x, y) => (y < 8 ? binary(y) : y === 8 && x >= 12 ? placed() : { v: 0 }), (w) => {
  const r = run(w, spawn(6.5, 8.1, 16.5), EAST, 3);
  return { pass: r.s.position[0] > 14 && r.s.position[1] > 8.6 && r.maxPen < 0.05, detail: `x ${f2(r.s.position[0])} y ${f2(r.s.position[1])} pen ${f2(r.maxPen)}` };
});
for (const ph of PHASES) {
  T(`1-rise on natural ground φ${ph}: walk up`, (x, y) => (y === 8 && x >= 12 ? placed() : natural(y, 8 + ph)), (w) => {
    const r = run(w, spawn(6.5, 8.2 + ph, 16.5), EAST, 3);
    return { pass: r.s.position[0] > 14 && r.s.position[1] > 8.6 && r.maxPen < 0.05, detail: `x ${f2(r.s.position[0])} y ${f2(r.s.position[1])} pen ${f2(r.maxPen)}` };
  });
}
// --- 2-block rises (must be blocked) ---
const rise2 = (ph) => (x, y) => ((y === 8 || y === 9) && x >= 12 ? placed() : ph === null ? binary(y) : natural(y, 8 + ph));
const blockedCheck = (r) => ({ pass: r.s.position[0] < 11.75, detail: `x ${f2(r.s.position[0])} y ${f2(r.s.position[1])} maxY ${f2(r.maxY)}` });
for (const ph of [null, ...PHASES]) {
  const tag = ph === null ? 'binary' : `natural φ${ph}`;
  T(`2-rise ${tag}: walk`, rise2(ph), (w) => blockedCheck(run(w, spawn(6.5, 8.6, 16.5), EAST, 3)));
  T(`2-rise ${tag}: sprint from 10 back`, rise2(ph), (w) => blockedCheck(run(w, spawn(2.5, 8.6, 16.5), { ...EAST, sprint: true }, 4)));
  T(`2-rise ${tag}: sprint+jump`, rise2(ph), (w) => blockedCheck(run(w, spawn(2.5, 8.6, 16.5), (s) => ({ ...EAST, sprint: true, jump: s.onGround && s.position[0] > 9.5 }), 4)));
  for (const deg of [30, 60]) {
    const a = (deg * Math.PI) / 180;
    T(`2-rise ${tag}: sprint at ${deg}° to the wall`, rise2(ph), (w) => blockedCheck(run(w, spawn(4.5, 8.6, 8.5), { move: [0, 1], yaw: yawTo(Math.cos(a), Math.sin(a)), sprint: true }, 4)));
  }
}
// 1 step then +2 riser
T('1-step then 2-high riser (sprint)', (x, y) => {
  if (y < 8) return binary(y);
  const h = x < 12 ? 0 : x < 14 ? 1 : 3;
  return y < 8 + h ? placed() : { v: 0 };
}, (w) => { const r = run(w, spawn(6.5, 8.1, 16.5), { ...EAST, sprint: true }, 4); return { pass: r.s.position[0] < 14.0, detail: `x ${f2(r.s.position[0])} y ${f2(r.s.position[1])}` }; });
// 2-high wall on a natural slope (wall foot on hinted 1:3 slope, approach downhill side)
for (const ph of [0, 0.3]) {
  T(`2-high wall on natural 1:4 slope φ${ph}: sprint uphill into it`, (x, y) => {
    const top = 8 + ph + (x + 0.5 - 12) / 4;
    if (x >= 16 && x < 18 && y >= Math.floor(8 + ph + (16.5 - 12) / 4) && y < Math.floor(8 + ph + (16.5 - 12) / 4) + 2) return placed();
    return natural(y, top);
  }, (w) => { const r = run(w, spawn(9.5, 9.5, 16.5), { ...EAST, sprint: true }, 4); return { pass: r.s.position[0] < 16.0, detail: `x ${f2(r.s.position[0])} y ${f2(r.s.position[1])}` }; });
}

const out = {};
for (const t of tests) {
  const row = [];
  for (const v of variants) {
    const w = new MeshWorld(t.fn, v).build(0, 0, 0);
    let res;
    try { res = t.body(w); } catch (e) { res = { pass: false, detail: 'ERR ' + e.message }; }
    row.push(`${res.pass ? 'PASS' : 'FAIL'} ${res.detail}`);
    (out[t.name] ??= {})[v] = res;
  }
  console.log(t.name.padEnd(52) + row.map((r) => r.padEnd(44)).join(''));
}
for (const v of variants) {
  const n = tests.filter((t) => out[t.name][v].pass).length;
  console.log(`${v}: ${n}/${tests.length} pass`);
}
