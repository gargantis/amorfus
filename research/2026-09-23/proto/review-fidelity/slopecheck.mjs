import { meshChunk, worldPos } from './sn_axis.mjs';
const G1 = [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5];
const qn = p => { const d1=[0,1,2].map(i=>p[2][i]-p[0][i]), d2=[0,1,2].map(i=>p[3][i]-p[1][i]); const n=[d1[1]*d2[2]-d1[2]*d2[1], d1[2]*d2[0]-d1[0]*d2[2], d1[0]*d2[1]-d1[1]*d2[0]]; const a=Math.hypot(...n); return n.map(x=>x/a); };
for (const n of [4, 8]) {
  const f = (x, z) => (x + 0.5) / n - (z + 0.5) + 0.25;
  const world = (x, y, z) => (f(x, z) > 0 ? 1 : 0), edited = (x, y, z) => z >= -4 && f(x, z) > 0; // whole slab hand-built
  const ideal = [-1 / n, 0, 1].map((v, _, a) => v / Math.hypot(...a));
  for (const [lab, hAir] of [['no clearance caps', null], ['research hE 0.2', 0.2], ['plan D-3 0.15/0.05', [0.15, 0.15, 0.05]]]) {
    const m = meshChunk(world, -8, -8, -8, 16, { k: 6, guard: G1, hAir, hAirEditedOnly: true, editedAirRule: 'none', sharpMode: 'axis', hintedLambda: 0, edited, apron: 9 });
    let s = 0, c = 0, mx = 0;
    for (const q of m.quads) { const p = q.v.map(v => worldPos(m, v)); const cx = (p[0][0]+p[2][0])/2, cy = (p[0][1]+p[2][1])/2; if (Math.abs(cx) > 6 || Math.abs(cy) > 6) continue;
      const nn = qn(p); if (nn[2] < 0.3) continue; const a = Math.acos(Math.min(1, nn[0]*ideal[0]+nn[2]*ideal[2])) * 180 / Math.PI; s += a*a; c++; mx = Math.max(mx, a); }
    console.log(`1:${n} hand-built, ${lab.padEnd(20)} ${Math.sqrt(s/c).toFixed(1)}° rms, ${mx.toFixed(0)}° max`);
  }
}
