import FastNoiseLite from "fastnoise-lite";
import { createHash } from "node:crypto";
const n = new FastNoiseLite(1337); n.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2); n.SetFractalType(FastNoiseLite.FractalType.FBm); n.SetFractalOctaves(4); n.SetFrequency(0.01);
const chunk = (cx, cy, cz) => { const out = new Uint8Array(32*32*32); let i = 0;
  for (let x = 0; x < 32; x++) for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) {
    const wx = cx*32+x, wy = cy*32+y, wz = cz*32+z; const d = n.GetNoise(wx, wy, wz) - (wy - 64) / 64; out[i++] = d > 0 ? 1 : 0; }
  return out; };
const t0 = performance.now(); const h = createHash("sha256");
for (const [cx,cy,cz] of [[0,0,0],[-1,-1,-1],[1000,2,-1000],[524288,1,-524288]]) h.update(chunk(cx,cy,cz));
console.log("4 chunks ms", (performance.now()-t0).toFixed(1), "sha256", h.digest("hex").slice(0,16), "arch", process.arch, process.version);
