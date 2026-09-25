// Estimate export size for N voxel edits under several encodings.
// Chunk = 32^3; local index 15 bits. Edits are final per-voxel overrides (LWW winners).
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';

const CS = 32;
let seed = 12345;
const rnd = () => { let t = (seed += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

function clustered(N) {
  const m = new Map();
  const put = (x, y, z, v, lam, peer) => m.set(`${x},${y},${z}`, { x, y, z, v, lam, peer });
  let lam = 0;
  while (m.size < N) {
    const kind = rnd();
    const ox = ri(-600, 600), oz = ri(-600, 600), oy = ri(20, 80);
    const peer = ri(0, 3);
    if (kind < 0.4) { // wall
      const L = ri(8, 40), H = ri(3, 10), mat = ri(1, 6), alongX = rnd() < 0.5;
      for (let a = 0; a < L; a++) for (let h = 0; h < H; h++) put(alongX ? ox + a : ox, oy + h, alongX ? oz : oz + a, mat | 0x80, ++lam, peer);
    } else if (kind < 0.7) { // tunnel / dig (removal -> air=0)
      let x = ox, y = oy, z = oz; const L = ri(20, 120);
      for (let i = 0; i < L; i++) { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) put(x + dx, y + dy, z, 0, ++lam, peer); x += ri(0, 1); z += ri(-1, 1) ; y += ri(-1, 0) * (rnd() < 0.2 ? 1 : 0); }
    } else { // blob / terrain sculpt (smooth)
      const R = ri(2, 6), mat = ri(1, 6);
      for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) if (dx*dx+dy*dy+dz*dz <= R*R) put(ox+dx, oy+dy, oz+dz, mat, ++lam, peer);
    }
  }
  return [...m.values()].slice(0, N);
}
function uniform(N) {
  const m = new Map(); let lam = 0;
  while (m.size < N) { const x = ri(-1024, 1023), y = ri(0, 127), z = ri(-1024, 1023); m.set(`${x},${y},${z}`, { x, y, z, v: ri(0, 6) | (rnd() < 0.2 ? 0x80 : 0), lam: ++lam, peer: ri(0, 3) }); }
  return [...m.values()];
}

class W { constructor() { this.b = []; } u8(v) { this.b.push(v & 255); } varint(v) { while (v >= 0x80) { this.b.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); } this.b.push(v); } zz(v) { this.varint(v >= 0 ? v * 2 : -v * 2 - 1); } get bytes() { return Uint8Array.from(this.b); } }
const fdiv = (a) => Math.floor(a / CS), fmod = (a) => ((a % CS) + CS) % CS;

function group(edits) {
  const chunks = new Map();
  for (const e of edits) {
    const cx = fdiv(e.x), cy = fdiv(e.y), cz = fdiv(e.z);
    const k = `${cx},${cy},${cz}`;
    if (!chunks.has(k)) chunks.set(k, { cx, cy, cz, list: [] });
    chunks.get(k).list.push({ i: (fmod(e.y) * CS + fmod(e.z)) * CS + fmod(e.x), v: e.v, lam: e.lam, peer: e.peer });
  }
  const arr = [...chunks.values()].sort((a, b) => a.cx - b.cx || a.cy - b.cy || a.cz - b.cz);
  for (const c of arr) c.list.sort((a, b) => a.i - b.i);
  return arr;
}

// Row-oriented: per chunk header, then (deltaIdx, value[, lamport, peer]) per edit
function encRow(chunks, meta) {
  const w = new W(); let pcx = 0, pcy = 0, pcz = 0;
  for (const c of chunks) {
    w.zz(c.cx - pcx); w.zz(c.cy - pcy); w.zz(c.cz - pcz); pcx = c.cx; pcy = c.cy; pcz = c.cz;
    w.varint(c.list.length); let pi = -1;
    for (const e of c.list) { w.varint(e.i - pi - 1); pi = e.i; w.u8(e.v); if (meta) { w.varint(e.lam); w.u8(e.peer); } }
  }
  return w.bytes;
}
// Column-oriented: all index deltas, then all values, then lamports, then peers
function encCol(chunks, meta) {
  const h = new W(), idx = new W(), val = new W(), lam = new W(), peer = new W(); let pcx = 0, pcy = 0, pcz = 0;
  for (const c of chunks) {
    h.zz(c.cx - pcx); h.zz(c.cy - pcy); h.zz(c.cz - pcz); pcx = c.cx; pcy = c.cy; pcz = c.cz; h.varint(c.list.length);
    let pi = -1;
    for (const e of c.list) { idx.varint(e.i - pi - 1); pi = e.i; val.u8(e.v); if (meta) { lam.varint(e.lam); peer.u8(e.peer); } }
  }
  const parts = [h.bytes, idx.bytes, val.bytes, ...(meta ? [lam.bytes, peer.bytes] : [])];
  const n = parts.reduce((s, p) => s + p.length, 0); const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
// Dense bitmap alternative per chunk: 32768 x 1 byte, gzip (for heavily edited chunks)
const kb = (n) => (n / 1024).toFixed(1) + ' KiB';
const gz = (b) => gzipSync(b, { level: 9 }).length;
const br = (b) => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;

for (const [name, gen] of [['clustered', clustered], ['uniform', uniform]]) {
  for (const N of [1e3, 1e4, 1e5]) {
    const edits = gen(N); const ch = group(edits);
    const r0 = encRow(ch, false), r1 = encRow(ch, true), c0 = encCol(ch, false), c1 = encCol(ch, true);
    console.log(`${name} N=${N} chunks=${ch.length}`);
    console.log(`  row  snapshot raw ${kb(r0.length)} gzip ${kb(gz(r0))} brotli ${kb(br(r0))} | +lamport/peer raw ${kb(r1.length)} gzip ${kb(gz(r1))}`);
    console.log(`  col  snapshot raw ${kb(c0.length)} gzip ${kb(gz(c0))} brotli ${kb(br(c0))} | +lamport/peer raw ${kb(c1.length)} gzip ${kb(gz(c1))}`);
    const b64 = Math.ceil(gz(c0) * 4 / 3);
    console.log(`  base64url of col-gzip snapshot: ${b64} chars`);
  }
}
// Naive JSON for comparison
const e5 = clustered(1e5); const json = JSON.stringify(e5.map(e => [e.x, e.y, e.z, e.v, e.lam, e.peer]));
console.log('naive JSON 1e5 clustered:', kb(json.length), 'gzip', kb(gz(Buffer.from(json))));

// Op-log encoding: ops in lamport order, columnar: dLamport, peer, dx/dy/dz from previous op, value
function encLog(edits) {
  const ops = [...edits].sort((a, b) => a.lam - b.lam);
  const dl = new W(), pr = new W(), dp = new W(), vl = new W(); let pl = 0, px = 0, py = 0, pz = 0;
  for (const e of ops) { dl.varint(e.lam - pl); pl = e.lam; pr.u8(e.peer); dp.zz(e.x - px); dp.zz(e.y - py); dp.zz(e.z - pz); px = e.x; py = e.y; pz = e.z; vl.u8(e.v); }
  const parts = [dl.bytes, pr.bytes, dp.bytes, vl.bytes]; const n = parts.reduce((s, p) => s + p.length, 0); const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
// Snapshot + per-chunk max lamport only (chunk-granular stamp)
for (const N of [1e4, 1e5]) {
  const ed = clustered(N); const L = encLog(ed);
  console.log(`oplog clustered N=${N}: raw ${kb(L.length)} gzip ${kb(gz(L))} brotli ${kb(br(L))}`);
  const eu = uniform(N); const Lu = encLog(eu);
  console.log(`oplog uniform   N=${N}: raw ${kb(Lu.length)} gzip ${kb(gz(Lu))} brotli ${kb(br(Lu))}`);
}
