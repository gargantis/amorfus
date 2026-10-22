// Verifier v-look: scenes. Catalogue scenes come from lib/configs.mjs and the
// look team's configs (slab-halves); the rest are new constraint and paint
// scenes defined here. Blocks are [x, y, z, mat], y up.
import { byName, A, B, STONE, GRASS, DIRT } from '../../../lib/configs.mjs';
import { EXTRA } from '../../look/src/configs-look.mjs';

const box = (x0, y0, z0, x1, y1, z1, m) => {
  const out = [];
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out.push([x, y, z, m]);
  return out;
};
// A 2-thick B slab (layers y = 0, 1) whose TOP layer is painted from a plan
// (rows = z, chars x; 'A' painted, anything else B). Paint on thick ground.
const slab2 = (rows, base = B, paint = A) => {
  const out = [];
  rows.forEach((row, z) => [...row].forEach((ch, x) => {
    out.push([x, 0, z, base]);
    out.push([x, 1, z, ch === 'A' ? paint : base]);
  }));
  return out;
};
const gridRows = (W, H, f) => Array.from({ length: H }, (_, z) => Array.from({ length: W }, (_, x) => (f(x, z) ? 'A' : 'B')).join(''));

// 3x5 pixel letters (rows top to bottom = z)
const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  K: ['#.#', '##.', '#..', '##.', '#.#'],
};
const textRows = (word) => {
  const W = 1 + word.length * 4, H = 7;
  const g = Array.from({ length: H }, () => Array(W).fill('B'));
  [...word].forEach((ch, li) => FONT[ch].forEach((row, r) => [...row].forEach((c, q) => { if (c === '#') g[1 + r][1 + li * 4 + q] = 'A'; })));
  return g.map((r) => r.join(''));
};

export const NEW = [
  // ---- constraint scenes ----
  { name: 'room2', desc: '2-wide, 2-high, 2-deep stone room open at the front (z = 0)', blocks: (() => {
    const s = new Map();
    const put = (x, y, z) => s.set(`${x},${y},${z}`, [x, y, z, STONE]);
    for (let x = 0; x <= 3; x++) for (let z = 0; z <= 2; z++) { put(x, 0, z); put(x, 3, z); }
    for (let y = 1; y <= 2; y++) for (let z = 0; z <= 2; z++) { put(0, y, z); put(3, y, z); }
    for (let y = 1; y <= 2; y++) for (let x = 1; x <= 2; x++) put(x, y, 2);
    return [...s.values()];
  })(), slice: { axis: 2, at: 1.0 } },
  { name: 'trench', desc: '1-wide, 1-deep trench along z in a 2-thick stone floor', blocks: box(0, 0, 0, 6, 1, 3, STONE).filter((b) => !(b[0] === 3 && b[1] === 1)), slice: { axis: 2, at: 1.5 } },
  { name: 'trench-gd', desc: 'the trench with a grass top layer on dirt', blocks: box(0, 0, 0, 6, 1, 3, DIRT).filter((b) => !(b[0] === 3 && b[1] === 1)).map((b) => (b[1] === 1 ? [b[0], 1, b[2], GRASS] : b)), slice: { axis: 2, at: 1.5 } },
  // ---- paint scenes on 2-thick ground (paint in the top layer only) ----
  { name: 'slab2-line', desc: '6x2x6 B, 1-wide diagonal A line in the top layer', blocks: slab2(gridRows(6, 6, (x, z) => x === z)), slice: { axis: 1, at: 1.5 }, sec: { axis: 2, at: 2.5 } },
  { name: 'slab2-dot', desc: '5x2x5 B, one A in the top layer', blocks: slab2(gridRows(5, 5, (x, z) => x === 2 && z === 2)), slice: { axis: 1, at: 1.5 }, sec: { axis: 2, at: 2.5 } },
  { name: 'slab2-stripe', desc: '6x2x6 B, straight 1-wide A stripe in the top layer', blocks: slab2(gridRows(6, 6, (x) => x === 2)), slice: { axis: 1, at: 1.5 }, sec: { axis: 2, at: 3.0 } },
  { name: 'diag2', desc: '6x2x6 B, 2-wide diagonal A band (x - z in {0,1}) in the top layer', blocks: slab2(gridRows(6, 6, (x, z) => x - z === 0 || x - z === 1)), slice: { axis: 1, at: 1.5 } },
  { name: 'Lturn', desc: '6x2x6 B, 1-wide A path with a right-angle turn in the top layer', blocks: slab2(gridRows(6, 6, (x, z) => (z === 1 && x >= 1 && x <= 4) || (x === 4 && z >= 1 && z <= 4))), slice: { axis: 1, at: 1.5 } },
  { name: 'cross', desc: '7x2x7 B, two crossing straight A lines (x = 3, z = 3)', blocks: slab2(gridRows(7, 7, (x, z) => x === 3 || z === 3)), slice: { axis: 1, at: 1.5 } },
  { name: 'xdiag', desc: '7x2x7 B, two crossing diagonal A lines (x = z, x + z = 6)', blocks: slab2(gridRows(7, 7, (x, z) => x === z || x + z === 6)), slice: { axis: 1, at: 1.5 } },
  { name: 'checker2', desc: '6x2x6 B, A checker in the top layer (each A block its own cluster)', blocks: slab2(gridRows(6, 6, (x, z) => (x + z) % 2 === 0)), slice: { axis: 1, at: 1.5 } },
  { name: 'checker1', desc: '6x1x6 one-thick A/B checker (every block its own cluster)', blocks: gridRows(6, 6, (x, z) => (x + z) % 2 === 0).flatMap((row, z) => [...row].map((ch, x) => [x, 0, z, ch === 'A' ? A : B])), slice: { axis: 1, at: 0.5 } },
  { name: 'text-AZ', desc: '9x2x7 B with the pixel letters A Z painted in the top layer', blocks: slab2(textRows('AZ')), slice: { axis: 1, at: 1.5 } },
  { name: 'stripe-alone', desc: '9x2x5 B, A stripe z = 2, x = 0..5', blocks: slab2(gridRows(9, 5, (x, z) => z === 2 && x <= 5)), slice: { axis: 1, at: 1.5 } },
  { name: 'stripe-patch', desc: 'the stripe joined to a 3x3 A patch at x = 6..8', blocks: slab2(gridRows(9, 5, (x, z) => (z === 2 && x <= 5) || (x >= 6 && z >= 1 && z <= 3))), slice: { axis: 1, at: 1.5 } },
  { name: 'big2-line', desc: '10x2x10 B ground, diagonal A line (2,2)-(7,7) in the top layer, 2+ blocks from every edge', blocks: slab2(gridRows(10, 10, (x, z) => x === z && x >= 2 && x <= 7)), slice: { axis: 1, at: 1.5 }, sec: { axis: 2, at: 4.5 } },
  { name: 'big2-checker', desc: '10x2x10 B ground, 4x4 A/B checker patch (x, z 3..6) in the top layer', blocks: slab2(gridRows(10, 10, (x, z) => x >= 3 && x <= 6 && z >= 3 && z <= 6 && (x + z) % 2 === 0)), slice: { axis: 1, at: 1.5 } },
  { name: 'step-line', desc: 'B ground 2 high (x < 3) and 3 high (x >= 3), diagonal A line x = z in the top layer, crossing the step', blocks: (() => {
    const out = [];
    for (let z = 0; z < 6; z++) for (let x = 0; x < 6; x++) {
      const top = x < 3 ? 1 : 2;
      for (let y = 0; y <= top; y++) out.push([x, y, z, y === top && x === z ? A : B]);
    }
    return out;
  })(), slice: { axis: 2, at: 2.5 } },
];

export const CAT = ['tunnel', 'pillar3', 'single', 'terrain-step', 'slab-line', 'slab-dot', 'slab-stripe', 'stairs', 'ring8', 'sq2-checker', 'L3-ABC', 'cube2-same', 'sq2-same']
  .map((n) => byName(n) ?? EXTRA.find((c) => c.name === n));
export const ALLV = [...CAT, EXTRA.find((c) => c.name === 'slab-halves'), ...NEW];
export const sceneByName = (n) => ALLV.find((c) => c.name === n);
export { FONT, textRows };
