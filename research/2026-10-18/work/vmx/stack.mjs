// vmx: stack PNGs vertically (to view several result rows in one image).
//   node work/vmx/stack.mjs out.png a.png b.png ...
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { vcat, save } from '../vmf/lib.mjs';
export function readPng(file) {
  const buf = readFileSync(file);
  let p = 8, w = 0, h = 0, ct = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const rgb = new Uint8Array(w * h * 3);
  const stride = w * bpp;
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) rgb[(y * w + x) * 3 + k] = cur[x * bpp + k];
    [prev, cur] = [cur, prev];
  }
  return { width: w, height: h, rgb };
}
if (process.argv[1].endsWith('stack.mjs')) {
  const [out, ...ins] = process.argv.slice(2);
  save(out, vcat(ins.map(readPng), 6));
}
