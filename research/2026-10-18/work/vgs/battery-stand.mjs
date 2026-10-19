// VGS battery 3: standing still. Idle drift on built slopes (many spots,
// 60 and 20 Hz), standing near the edge of placed 1-high floors (binary and
// natural ground), 1-thick floating floors, walking along a 1-wide beam and
// along the top of a 1-wide wall.
import { MeshWorld, run, spawn, natural, placed, binary, STONE, PLANKS, f2 } from './phys.mjs';

const variants = (process.argv[2] ?? 'cubes,hints,gs-ctx,gs-mls').split(',');
const rows = [];
const R = (name, fn, body) => rows.push({ name, fn, body });

// --- idle drift on built staircases / ramps: settle, then 5 s idle ---
const stair = (n) => (x, y) => { if (y < 8) return binary(y); const h = x < 6 ? 0 : Math.min(14, Math.floor((x - 6) / n) + 1); return y < 8 + h ? placed() : { v: 0 }; };
function drift(w, x, z, y0, dt) {
  const a = run(w, spawn(x, y0, z), {}, 1.5, { dt, probe: false });
  const b = run(w, a.s, {}, 5, { dt, probe: false });
  const d = Math.hypot(b.s.position[0] - a.s.position[0], b.s.position[2] - a.s.position[2]);
  return { d, dy: b.s.position[1] - a.s.position[1], on: a.s.onGround, y: a.s.position[1] };
}
for (const n of [1, 2, 3, 4, 8]) {
  R(`built 1:${n} stairs: idle drift, worst of 9 spots ×2 rates`, stair(n), (w) => {
    let worst = 0, worstAt = '', notOn = 0;
    for (const dt of [1 / 60, 1 / 20]) for (let k = 0; k < 9; k++) {
      const x = 6 + 2 * n + (k * n) / 9 + 0.05;
      const r = drift(w, x, 16.5, 8 + Math.min(14, (x - 6) / n) + 2, dt);
      if (!r.on) notOn++;
      if (r.d > worst) { worst = r.d; worstAt = `x ${f2(x)} ${Math.round(1 / dt)}Hz`; }
    }
    return { pass: worst < 1e-3 && notOn === 0, detail: `max drift ${worst.toExponential(1)} (${worstAt}) notOnGround ${notOn}` };
  });
}
R('built mound r6.4: idle drift on flanks (16 spots)', (x, y, z) => (y < 8 ? binary(y) : Math.hypot(x + 0.5 - 16, y + 0.5 - 8, z + 0.5 - 16) < 6.4 ? placed() : { v: 0 }), (w) => {
  let worst = 0, at = '';
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * 2 * Math.PI, rr = 2 + (k % 4);
    const r = drift(w, 16 + rr * Math.cos(a), 16 + rr * Math.sin(a), 15.5, 1 / 60);
    if (r.d > worst) { worst = r.d; at = `r ${rr} a ${f2(a)}`; }
  }
  return { pass: worst < 1e-3, detail: `max drift ${worst.toExponential(1)} ${at}` };
});
// --- standing near the edge of a placed 1-high floor (6×6 platform) ---
const platform = (ground) => (x, y, z) => (y === 8 && x >= 12 && x < 18 && z >= 12 && z < 18 ? placed(PLANKS) : ground(y));
for (const [gname, ground] of [['binary', (y) => binary(y)], ['natural φ0.3', (y) => natural(y, 8.3)], ['natural φ-0.3', (y) => natural(y, 7.7)]]) {
  R(`6×6 placed floor on ${gname}: centre height, edge stance`, platform(ground), (w) => {
    const c = run(w, spawn(15, 9.5, 15), {}, 1.5, { probe: false }).s;
    const out = [`centre y ${f2(c.position[1])}`];
    let slid = 0;
    for (const inset of [1.0, 0.5, 0.3, 0.1]) {
      const a = run(w, spawn(12 + inset, 9.5, 15), {}, 1.5, { probe: false }).s;
      const b = run(w, a, {}, 5, { probe: false }).s;
      const d = Math.hypot(b.position[0] - a.position[0], b.position[2] - a.position[2]);
      if (d > 1e-3) slid++;
      out.push(`${inset}:y${f2(a.position[1])}${d > 1e-3 ? ` SLID ${f2(d)}` : ''}`);
    }
    return { pass: slid === 0, detail: out.join(' ') };
  });
}
// --- 1-thick floating floor (placed slab 4 above ground), stand near the edge ---
R('1-thick floating 6×6 slab: centre and edge stance', (x, y, z) => (y < 8 ? binary(y) : y === 12 && x >= 12 && x < 18 && z >= 12 && z < 18 ? placed(PLANKS) : { v: 0 }), (w) => {
  const out = [];
  let fell = 0;
  for (const inset of [3.0, 1.0, 0.5, 0.3, 0.15]) {
    const a = run(w, spawn(12 + inset, 13.6, 15), {}, 1.5, { probe: false }).s;
    const b = run(w, a, {}, 5, { probe: false }).s;
    if (b.position[1] < 12.5) fell++;
    out.push(`${inset}:y${f2(a.position[1])}${b.position[1] < 12.5 ? ' FELL' : ''}`);
  }
  return { pass: fell === 0 || out[0].includes('FELL') === false, detail: out.join(' '), fell };
});
// --- 1-wide beam (placed, 1 thick, 3 above ground): walk along it ---
R('1-wide 1-thick beam 3 up: walk its length', (x, y, z) => (y < 8 ? binary(y) : y === 11 && z === 16 && x >= 4 && x < 28 ? placed(PLANKS) : { v: 0 }), (w) => {
  const r = run(w, spawn(5.5, 12.6, 16.5), { move: [0, 1], yaw: -Math.PI / 2 }, 4.5, { probe: false });
  return { pass: r.s.position[1] > 11.5 && r.s.position[0] > 20, detail: `end x ${f2(r.s.position[0])} y ${f2(r.s.position[1])} z ${f2(r.s.position[2])} minY ${f2(r.minY)}` };
});
R('1-wide 1-thick beam: stand still on it', (x, y, z) => (y < 8 ? binary(y) : y === 11 && z === 16 && x >= 4 && x < 28 ? placed(PLANKS) : { v: 0 }), (w) => {
  const a = run(w, spawn(15.5, 12.6, 16.5), {}, 1.5, { probe: false }).s;
  const b = run(w, a, {}, 5, { probe: false }).s;
  return { pass: b.position[1] > 11.5, detail: `settled y ${f2(a.position[1])} after 5 s y ${f2(b.position[1])} z ${f2(b.position[2])}` };
});
R('top of a 1-wide 3-high wall: walk along it', (x, y, z) => (y < 8 ? binary(y) : y < 11 && z === 16 && x >= 4 && x < 28 ? placed(PLANKS) : { v: 0 }), (w) => {
  const r = run(w, spawn(5.5, 11.6, 16.5), { move: [0, 1], yaw: -Math.PI / 2 }, 4.5, { probe: false });
  return { pass: r.s.position[1] > 10.5 && r.s.position[0] > 20, detail: `end x ${f2(r.s.position[0])} y ${f2(r.s.position[1])} z ${f2(r.s.position[2])}` };
});
R('2-wide floating bridge 4 up: walk its length', (x, y, z) => (y < 8 ? binary(y) : y === 12 && (z === 16 || z === 17) && x >= 4 && x < 28 ? placed(PLANKS) : { v: 0 }), (w) => {
  const r = run(w, spawn(5.5, 13.6, 17.0), { move: [0, 1], yaw: -Math.PI / 2 }, 4.5, { probe: false });
  return { pass: r.s.position[1] > 12.5 && r.s.position[0] > 20, detail: `end x ${f2(r.s.position[0])} y ${f2(r.s.position[1])} z ${f2(r.s.position[2])}` };
});

const res = {};
for (const t of rows) {
  const row = [];
  for (const v of variants) {
    const w = new MeshWorld(t.fn, v).build(0, 0, 0);
    let r;
    try { r = t.body(w); } catch (e) { r = { pass: false, detail: 'ERR ' + e.message }; }
    row.push(`${r.pass ? 'PASS' : 'FAIL'} ${r.detail}`);
    (res[t.name] ??= {})[v] = r;
  }
  console.log(t.name);
  for (let i = 0; i < variants.length; i++) console.log(`   ${variants[i].padEnd(7)} ${row[i]}`);
}
