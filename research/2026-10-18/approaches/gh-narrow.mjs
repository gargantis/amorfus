// Team gh — clearance rule only. The production 'hints' rule with one
// change: the D-3 clearance caps apply only where the air being intruded is
// a narrow opening along that axis (x/z air run of 1, y air run ≤ 2), so open
// built slopes may round their concave corners. Mesher patch:
// work/gh/src/core/mesh/mesher.ts (param clearance: 'narrow').
import { meshRegion } from '../work/gh/mesher-gh.mjs';
export const name = 'gh-narrow';
export const describe = "Production hints rule (k = 6) with D-3 caps limited to narrow openings (x/z run 1, y run ≤ 2); no synthetic data.";
export const apron = 10;
export function mesh(region, scene, core) {
  return core.decodeMesh(meshRegion({ ...region, params: { clearance: 'narrow' } }));
}
