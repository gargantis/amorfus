// Same-load timing: alternate the repo mesher (hints) and gn-best (fast path)
// over the 16 bench chunks, several rounds; apron 3, apron 10, and edited.
import { meshRegion as gn } from './mesher-gn.mjs';
import { meshRegion as repo } from '../../lib/mesher-repo.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const CX_MIN = -(2 ** 18), CX_SPAN = 2 ** 19, CY_MIN = -8, CY_SPAN = 24;
const key = (cx, cy, cz) => ((cx - CX_MIN) * CX_SPAN + (cz - CX_MIN)) * CY_SPAN + (cy - CY_MIN);
function edited(c) {
  const edits = new Map();
  let h = 777;
  const rnd = () => ((h = (Math.imul(h, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 3000; i++) {
    const wx = c[0] * 32 + Math.floor(rnd() * 32), wy = c[1] * 32 + Math.floor(rnd() * 32), wz = c[2] * 32 + Math.floor(rnd() * 32);
    const k = key(c[0], c[1], c[2]);
    if (!edits.has(k)) edits.set(k, new Map());
    const r = rnd();
    edits.get(k).set(((wy - c[1] * 32) * 32 + (wz - c[2] * 32)) * 32 + (wx - c[0] * 32), r < 0.5 ? 0 : 3);
  }
  return buildGenMeshInput([1, 1], ...c, edits, {}).input;
}
const sets = {
  'apron 3': CHUNKS.map((c) => buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: 3 }).input),
  'apron 10': CHUNKS.map((c) => buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: 10 }).input),
  'edited (3000 random edits/chunk, apron 10)': CHUNKS.slice(0, 8).map(edited),
};
for (const [label, inputs] of Object.entries(sets)) {
  const tA = [], tB = [];
  for (let round = 0; round < 6; round++) {
    for (const inp of inputs) {
      let t0 = performance.now(); repo(inp); const a = performance.now() - t0;
      t0 = performance.now(); gn({ ...inp, params: PARAMS }); const b = performance.now() - t0;
      if (round > 0) { tA.push(a); tB.push(b); }
    }
  }
  const med = (x) => { const s = [...x].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  const mean = (x) => x.reduce((p, q) => p + q, 0) / x.length;
  console.log(`${label}: hints median ${med(tA).toFixed(2)} ms, mean ${mean(tA).toFixed(2)}; gn-best median ${med(tB).toFixed(2)} ms, mean ${mean(tB).toFixed(2)}; per-chunk ratio of means ${(mean(tB) / mean(tA)).toFixed(2)}`);
}
