import * as Y from "yjs";
import * as A from "@automerge/automerge";
import { LoroDoc } from "loro-crdt";
const lib = process.argv[2], N = +process.argv[3];
// deterministic key stream: 80% new cells, 20% overwrite of existing
let s = 12345; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2**32;
const keys = []; const ops = [];
for (let i = 0; i < N; i++) {
  let k;
  if (i > 10 && rnd() < +(process.argv[4]||0.2)) k = keys[(rnd() * keys.length) | 0];
  else { k = `${(rnd()*4096|0)-2048},${(rnd()*256|0)},${(rnd()*4096|0)-2048}`; keys.push(k); }
  ops.push([k, (rnd()*8)|0]);
}
global.gc?.(); const h0 = process.memoryUsage();
const t0 = performance.now(); let enc, t1, t2, t3;
if (lib === "yjs") {
  const d = new Y.Doc(); const m = d.getMap("w");
  d.transact(() => { for (const [k, v] of ops) m.set(k, v); });
  t1 = performance.now(); global.gc?.(); var h1 = process.memoryUsage();
  enc = Y.encodeStateAsUpdate(d); t2 = performance.now();
  const d2 = new Y.Doc(); Y.applyUpdate(d2, enc); t3 = performance.now();
  var live = d2.getMap("w").size;
} else if (lib === "yjs-pertx") {
  const d = new Y.Doc(); const m = d.getMap("w");
  for (const [k, v] of ops) m.set(k, v);
  t1 = performance.now(); global.gc?.(); var h1 = process.memoryUsage();
  enc = Y.encodeStateAsUpdate(d); t2 = performance.now();
  const d2 = new Y.Doc(); Y.applyUpdate(d2, enc); t3 = performance.now();
  var live = d2.getMap("w").size;
} else if (lib === "automerge") {
  let d = A.from({ w: {} });
  d = A.change(d, x => { for (const [k, v] of ops) x.w[k] = v; });
  t1 = performance.now(); global.gc?.(); var h1 = process.memoryUsage();
  enc = A.save(d); t2 = performance.now();
  const d2 = A.load(enc); t3 = performance.now();
  var live = Object.keys(d2.w).length;
} else if (lib === "loro") {
  const d = new LoroDoc(); const m = d.getMap("w");
  for (const [k, v] of ops) m.set(k, v);
  d.commit();
  t1 = performance.now(); global.gc?.(); var h1 = process.memoryUsage();
  enc = d.export({ mode: "snapshot" }); t2 = performance.now();
  const d2 = new LoroDoc(); d2.import(enc); t3 = performance.now();
  var live = d2.getMap("w").size;
} else if (lib === "custom") {
  // LWW map: numeric packed key -> packed record in two Float64/Uint32 slots via Map<number, number> of index into typed arrays
  const idx = new Map(); let cap = 1 << 16, n = 0;
  let val = new Uint16Array(cap), phys = new Float64Array(cap), ctr = new Uint16Array(cap), peer = new Uint16Array(cap);
  const pack = k => { const [x, y, z] = k.split(",").map(Number); return ((x + 2**20) * 2**21 + (z + 2**20)) * 2**11 + y; };
  const packed = ops.map(([k, v]) => [pack(k), v]);
  const T0 = performance.now(); let hlc = 1.7e12;
  for (const [k, v] of packed) {
    hlc++; let i = idx.get(k);
    if (i === undefined) { if (n === cap) { cap *= 2; for (const nm of ["val","phys","ctr","peer"]) { const o = eval(nm); const a = new o.constructor(cap); a.set(o); eval(nm + "=a"); } } i = n++; idx.set(k, i); }
    else if (phys[i] > hlc) continue;
    val[i] = v; phys[i] = hlc; ctr[i] = 0; peer[i] = 1;
  }
  t1 = performance.now(); global.gc?.(); var h1 = process.memoryUsage();
  // encode: key f64 + val u16 + phys 6B + ctr u16 + peer u16 = 20 B/entry naive
  const buf = new DataView(new ArrayBuffer(n * 20)); let o = 0;
  for (const [k, i] of idx) { buf.setFloat64(o, k); buf.setUint16(o+8, val[i]); buf.setUint32(o+10, Math.floor(phys[i]/65536)); buf.setUint16(o+14, phys[i]%65536); buf.setUint16(o+16, ctr[i]); buf.setUint16(o+18, peer[i]); o += 20; }
  enc = new Uint8Array(buf.buffer); t2 = performance.now();
  const m2 = new Map(); for (let p = 0; p < enc.length; p += 20) m2.set(buf.getFloat64(p), p); t3 = performance.now();
  var live = m2.size; t0 !== T0;
}
const gz = (await import("node:zlib")).gzipSync(enc).length;
console.log(JSON.stringify({ lib, N, live, applyMs: Math.round(t1 - t0), heapMB: +((h1.heapUsed - h0.heapUsed + h1.external - h0.external + h1.arrayBuffers - h0.arrayBuffers)/1e6).toFixed(1), rssMB: +(h1.rss/1e6).toFixed(0), encBytes: enc.length, gzBytes: gz, bytesPerLive: +(enc.length/live).toFixed(1), encMs: Math.round(t2 - t1), loadMs: Math.round(t3 - t2) }));
