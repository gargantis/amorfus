// vmf: crease bleed at a built wall standing on hinted grass. Samples every
// triangle (barycentric grid); reports how high grass climbs up the wall's own
// quads and how far the wall material spreads onto the ground quads.
import * as core from '../../harness/core.mjs';
import { flatGround, GROUND } from './adv-scenes.mjs';
import { loadApproach } from './lib.mjs';
const { GRASS, STONE, PLANKS, BRICK } = core;
const A = await loadApproach('approaches/mf-iso.mjs');
const g = flatGround(() => GRASS);
for (const [label, mat, thick, hgt] of [['planks 1-thick 3-high', PLANKS, 1, 3], ['brick 3-thick 2-high', BRICK, 3, 2], ['stone 1-thick 1-high (kerb)', STONE, 1, 1]]) {
  const cell = (x, y, z) => (y >= GROUND && y < GROUND + hgt && x >= 16 && x < 16 + thick && z >= 6 && z < 26 ? { v: mat, edited: true } : g(x, y, z));
  const m = A.mesh(core.buildRegion(cell, 10), null, core);
  const D = m.attrDim, tmp = new Float64Array(D);
  const info = { ownMat: 0 };
  let grassUp = 0, wallOut = 0, wallArea = 0, grassOnWall = 0, groundArea = 0, wallOnGround = 0;
  const G = 10;
  for (let t = 0; t < m.T; t++) {
    const a = m.tri[t * 3], b = m.tri[t * 3 + 1], c = m.tri[t * 3 + 2];
    const own = m.mat[a];
    const cz = (m.pos[a * 3 + 2] + m.pos[b * 3 + 2] + m.pos[c * 3 + 2]) / 3;
    if (cz < 9 || cz > 23) continue; // away from the wall ends
    const fn = core.faceNormal(m, t, [0, 0, 0, 0]);
    for (let i = 0; i < G; i++) for (let j = 0; j < G - i; j++) {
      const w1 = (i + 1 / 3) / G, w2 = (j + 1 / 3) / G, w0 = 1 - w1 - w2;
      for (let d = 0; d < D; d++) tmp[d] = w0 * m.attrs[a * D + d] + w1 * m.attrs[b * D + d] + w2 * m.attrs[c * D + d];
      info.ownMat = own;
      const shown = A.fragment(tmp, info, null);
      const y = w0 * m.pos[a * 3 + 1] + w1 * m.pos[b * 3 + 1] + w2 * m.pos[c * 3 + 1];
      const x = w0 * m.pos[a * 3] + w1 * m.pos[b * 3] + w2 * m.pos[c * 3];
      const ar = fn[3] / (G * G / 2);
      if (own === mat) { wallArea += ar; if (shown === GRASS) { grassOnWall += ar; grassUp = Math.max(grassUp, y - GROUND); } }
      if (own === GRASS && y > GROUND - 0.6) { groundArea += ar; if (shown === mat) { wallOnGround += ar; wallOut = Math.max(wallOut, Math.max(16 - x, x - (16 + thick))); } }
    }
  }
  console.log(`${label}: grass shown on the wall's own faces up to ${grassUp.toFixed(2)} above ground (${(grassOnWall / 14).toFixed(2)} blocks² per block of wall length); wall material shown on the ground up to ${wallOut.toFixed(2)} out from the wall (${(wallOnGround / 14).toFixed(2)} blocks² per block of wall length)`);
}
