// stack PNGs (same size) horizontally/vertically: node montage.mjs out.png cols a.png b.png …
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { writePng } from '../../harness/png.mjs';
const [out, colsS, ...files] = process.argv.slice(2);
const cols = Number(colsS);
function readPng(f) {
  const b = readFileSync(f);
  let o = 8, w = 0, h = 0; const idat = [];
  while (o < b.length) { const len = b.readUInt32BE(o); const type = b.toString('ascii', o + 4, o + 8); const data = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); } else if (type === 'IDAT') idat.push(data); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)); const rgb = new Uint8Array(w * h * 3); const stride = w * 3;
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) { const ft = raw[y * (stride + 1)]; const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)); const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) { const a = i >= 3 ? cur[i - 3] : 0, up = prev[i], c = i >= 3 ? prev[i - 3] : 0; let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += up; else if (ft === 3) v += (a + up) >> 1; else if (ft === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      cur[i] = v & 255; }
    rgb.set(cur, y * stride); prev = cur; }
  return { w, h, rgb };
}
const imgs = files.map(readPng);
const W = imgs[0].w, H = imgs[0].h, rows = Math.ceil(imgs.length / cols);
const TW = cols * W + (cols - 1) * 4, TH = rows * H + (rows - 1) * 4;
const rgb = new Uint8Array(TW * TH * 3).fill(255);
imgs.forEach((im, k) => { const ox = (k % cols) * (W + 4), oy = Math.floor(k / cols) * (H + 4);
  for (let j = 0; j < H; j++) rgb.set(im.rgb.subarray(j * W * 3, (j + 1) * W * 3), ((oy + j) * TW + ox) * 3); });
writePng(out, TW, TH, rgb);
console.log(out);
