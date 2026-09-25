import { writeFileSync } from "node:fs";
const b = new Float64Array(200000); let s = 12345;
for (let i = 0; i < b.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; b[i] = Math.pow((s / 2**32) * 20 + 0.0001, 1.37); }
writeFileSync(process.argv[2], new Uint8Array(b.buffer));
