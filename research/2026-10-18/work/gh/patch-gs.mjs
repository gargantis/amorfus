// Patch a copy of the gs mesher (work/gh/src-gs/...) with (1) a per-edge
// crossing override crossT (team gh synthetic crossings) and (2) capMode
// 'narrow' (gh's narrow-opening D-3 caps), keeping every gs param.
import { readFileSync, writeFileSync } from 'node:fs';
const f = 'src-gs/core/mesh/mesher.ts';
let src = readFileSync(f, 'utf8');
const lines = src.split('\n');
const out = [];
let pend = null, nT = 0;
const axisOf = (a, b) => {
  // index names iXYZ: the differing digit gives the axis (x, y, z order)
  const da = a.slice(1), db = b.slice(1);
  for (let k = 0; k < 3; k++) if (da[k] !== db[k]) return k;
  throw new Error(`same ${a} ${b}`);
};
for (const line of lines) {
  const m = /const midE = editMid && \(shapeEdited\[(i\d{3})\] === 1 \|\| shapeEdited\[(i\d{3})\] === 1\);/.exec(line);
  if (m) pend = [m[1], m[2]];
  if (line.includes('const t = midE ? 0.5 : r0 / (r0 - r1);')) {
    if (!pend) throw new Error('no midE before t');
    const ind = line.match(/^\s*/)[0];
    const ax = axisOf(pend[0], pend[1]);
    out.push(`${ind}const ct = crossT ? crossT[${pend[0]} * 3 + ${ax}]! : -1;`);
    out.push(`${ind}const t = ct >= 0 ? ct : midE ? 0.5 : r0 / (r0 - r1);`);
    pend = null; nT++;
    continue;
  }
  out.push(line);
}
if (nT !== 12) throw new Error(`patched ${nT} crossings, want 12`);
src = out.join('\n');
// input field
src = src.replace(/(  shapeEdited: Uint8Array;\n)/, `$1  /** GH STUDY: per-edge crossing override, 3 per block: crossT[i*3+a] is the\n   *  crossing on the edge from block i to i+e_a measured from block i\n   *  (0..1); negative = use the usual rule. */\n  crossT?: Float32Array | undefined;\n`);
// destructure crossT near the start of meshRegion
src = src.replace(/(export function meshRegion\(input: MeshRegionInput\): MeshResult \{\n)/, `$1  const crossT = input.crossT;\n`);
// capMode type
src = src.replace(`capMode: 'd3' | 'context';`, `capMode: 'd3' | 'context' | 'narrow';`);
// narrow caps in the clearance block
const before = `            if (ctxCaps) {
              capX = gapTight(bxc, byc, bzc, 0);`;
if (!src.includes(before)) throw new Error('no ctxCaps block');
src = src.replace(`            const plusX = s100 + s101 + s110 + s111;
            const minusX = s000 + s001 + s010 + s011;
            if (capX && plusX <= minusX && capH < hi0) hi0 = capH;
            if (capX && minusX <= plusX && -capH > lo0) lo0 = -capH;
            const plusY = s010 + s110 + s011 + s111;
            const minusY = s000 + s100 + s001 + s101;
            if (capUp && plusY <= minusY && capV < hi1) hi1 = capV;
            if (minusY <= plusY && -capV > lo1) lo1 = -capV;
            const plusZ = s001 + s101 + s011 + s111;
            const minusZ = s000 + s100 + s010 + s110;
            if (capZ && plusZ <= minusZ && capH < hi2) hi2 = capH;
            if (capZ && minusZ <= plusZ && -capH > lo2) lo2 = -capH;`,
`            const nw = p.capMode === 'narrow';
            const nA = (axis: number, hiSide: number): boolean =>
              !nw || narrowAt(solid, axis, hiSide, i000, bxc, byc, bzc, nx, ny, nz, SX, SY, SZ);
            const plusX = s100 + s101 + s110 + s111;
            const minusX = s000 + s001 + s010 + s011;
            if (capX && plusX <= minusX && capH < hi0 && nA(0, 1)) hi0 = capH;
            if (capX && minusX <= plusX && -capH > lo0 && nA(0, 0)) lo0 = -capH;
            const plusY = s010 + s110 + s011 + s111;
            const minusY = s000 + s100 + s001 + s101;
            if (capUp && plusY <= minusY && capV < hi1 && nA(1, 1)) hi1 = capV;
            if (minusY <= plusY && -capV > lo1 && nA(1, 0)) lo1 = -capV;
            const plusZ = s001 + s101 + s011 + s111;
            const minusZ = s000 + s100 + s010 + s110;
            if (capZ && plusZ <= minusZ && capH < hi2 && nA(2, 1)) hi2 = capH;
            if (capZ && minusZ <= plusZ && -capH > lo2 && nA(2, 0)) lo2 = -capH;`);
if (!src.includes(`const nw = p.capMode === 'narrow';`)) throw new Error('cap patch failed');
// gh narrow helpers appended
src += `
/** GH STUDY: is AIR block i (at x,y,z) part of a narrow opening along
 *  \`axis\`: x/z — solid on both sides (run 1); y — an air run of at most 2
 *  between solids (a 2-high room or tunnel). Out-of-region reads count as
 *  not solid. */
function airNarrow(
  solid: Uint8Array, i: number, axis: number,
  x: number, y: number, z: number,
  nx: number, ny: number, nz: number,
  SX: number, SY: number, SZ: number,
): boolean {
  if (axis === 0) return x > 0 && x < nx - 1 && solid[i - SX] === 1 && solid[i + SX] === 1;
  if (axis === 2) return z > 0 && z < nz - 1 && solid[i - SZ] === 1 && solid[i + SZ] === 1;
  const u1 = y + 1 < ny && solid[i + SY] === 1;
  const u2 = y + 2 < ny && solid[i + 2 * SY] === 1;
  const d1 = y > 0 && solid[i - SY] === 1;
  const d2 = y > 1 && solid[i - 2 * SY] === 1;
  return (u1 && (d1 || d2)) || (d1 && u2);
}

/** GH STUDY: does the cell side (layer \`hi\` ∈ {0,1} along \`axis\`) hold an
 *  air block that is narrow along \`axis\`? (bx,by,bz) = the cell's lowest
 *  block, i000 its index. */
function narrowAt(
  solid: Uint8Array, axis: number, hi: number, i000: number,
  bx: number, by: number, bz: number,
  nx: number, ny: number, nz: number,
  SX: number, SY: number, SZ: number,
): boolean {
  for (let a = 0; a < 2; a++) {
    for (let b = 0; b < 2; b++) {
      const ox = axis === 0 ? hi : a;
      const oy = axis === 1 ? hi : axis === 0 ? a : b;
      const oz = axis === 2 ? hi : b;
      const i = i000 + ox * SX + oy * SY + oz * SZ;
      if (solid[i] === 0 && airNarrow(solid, i, axis, bx + ox, by + oy, bz + oz, nx, ny, nz, SX, SY, SZ)) return true;
    }
  }
  return false;
}
`;
writeFileSync(f, src);
console.log('patched', f);
