import { createHash } from "node:crypto";
const fns = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, log: Math.log, pow: x => Math.pow(x, 1.37), tanh: Math.tanh, cbrt: Math.cbrt, atan2: x => Math.atan2(x, 0.7), sqrt: Math.sqrt };
const out = {};
for (const [k, f] of Object.entries(fns)) { const b = new Float64Array(200000); let s = 12345;
  for (let i = 0; i < b.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; b[i] = f((s / 2**32) * 20 - 10 + (k==="log"||k==="pow"||k==="sqrt" ? 10.0001 : 0)); }
  out[k] = createHash("sha256").update(new Uint8Array(b.buffer)).digest("hex").slice(0, 8); }
console.log(process.version, process.versions.v8, JSON.stringify(out));
