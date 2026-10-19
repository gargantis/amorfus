// Team gh — gh-cc8 plus position-sampled AO: the §7.2 AO formula on the
// same 4×4×4 solid fraction, but trilinearly interpolated between lattice
// corners at the vertex's quantised position instead of taken at its lattice
// corner (removes block-shaped AO bands on smooth surfaces, generated ones
// included). Apron 10.
import { contourCross4 } from '../work/gh/syn.mjs';
import { meshRegion } from '../work/gh/mesher-gh.mjs';
export const name = 'gh-cc8-ao';
export const describe = 'gh-cc8 + AO sampled at the vertex position (trilinear between lattice-corner 4×4×4 fractions).';
export const apron = 10;
export function mesh(region, scene, core) {
  const r = contourCross4(region, { R: 8, w0: 1 });
  return core.decodeMesh(meshRegion({ ...region, crossT: r?.crossT, params: { k: 0, clearance: 'narrow', aoMode: 'position' } }));
}
