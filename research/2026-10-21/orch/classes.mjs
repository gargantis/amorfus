// Orchestrator cross-check: 2x2x2 corner classes up to the 48 cube
// symmetries, materials relabelled (air fixed).
const pos = []; for (let i = 0; i < 8; i++) pos.push([i & 1, (i >> 1) & 1, (i >> 2) & 1]);
const idx = (p) => p[0] | (p[1] << 1) | (p[2] << 2);
const syms = [];
for (const pm of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) for (let f = 0; f < 8; f++) {
  syms.push(pos.map((p) => { const q = [p[pm[0]], p[pm[1]], p[pm[2]]]; for (let a = 0; a < 3; a++) if (f >> a & 1) q[a] = 1 - q[a]; return idx(q); }));
}
const relabel = (lab) => { const m = new Map(); return lab.map((v) => (v === 0 ? 0 : (m.has(v) ? m.get(v) : (m.set(v, m.size + 1), m.size)))); };
const all = [];
const rec = (i, lab, mx) => { if (i === 8) { all.push(lab.slice()); return; } for (let v = 0; v <= mx + 1; v++) { lab[i] = v; rec(i + 1, lab, Math.max(mx, v)); } };
rec(0, new Array(8), 0);
const canon = (lab) => { let best = null; for (const s of syms) { const t = new Array(8); for (let i = 0; i < 8; i++) t[s[i]] = lab[i]; const k = relabel(t).join(''); if (best === null || k < best) best = k; } return best; };
const orbits = new Map(); for (const lab of all) { const k = canon(lab); if (!orbits.has(k)) orbits.set(k, lab); }
const byM = {}; for (const k of orbits.keys()) { const m = Math.max(...k.split('').map(Number)); byM[m] = (byM[m] ?? 0) + 1; }
console.log('labellings', all.length, 'classes', orbits.size, 'by #materials', JSON.stringify(byM));
// Burnside check: average number of labellings fixed by each symmetry
let fixed = 0; for (const s of syms) for (const lab of all) { const t = new Array(8); for (let i = 0; i < 8; i++) t[s[i]] = lab[i]; if (relabel(t).join('') === lab.join('')) fixed++; }
console.log('Burnside', fixed / syms.length, '(counts labellings fixed up to relabelling; equals classes only if relabelling commutes — informational)');
const masks = new Set(); for (let m = 0; m < 256; m++) { let b = 256; for (const s of syms) { let t = 0; for (let i = 0; i < 8; i++) if (m >> i & 1) t |= 1 << s[i]; b = Math.min(b, t); } masks.add(b); }
console.log('solid/air classes', masks.size);
// mixed-only: classes with air present and ≥1 solid (surface corners) and classes with ≥2 materials
let surf = 0, multi = 0, surfMulti = 0;
for (const k of orbits.keys()) { const v = k.split('').map(Number); const air = v.includes(0), mats = Math.max(...v); if (air && mats > 0) surf++; if (mats >= 2) multi++; if (air && mats >= 2) surfMulti++; }
console.log('classes with air+solid', surf, '; with >=2 materials', multi, '; both', surfMulti);
