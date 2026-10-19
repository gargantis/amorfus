// How far do unclamped CC vertex points leave their cell / guard box?
import * as core from '../../harness/core.mjs';
import { GEOMETRY_SCENES, CONSTRAINT_SCENES } from '../../harness/scenes.mjs';
import { controlMesh, levelFromControl, levelTopology, ccStep } from './lib-gc.mjs';
for (const s of [...GEOMETRY_SCENES, ...CONSTRAINT_SCENES]) {
  if (!['terrace-disc', 'terrace-1:2', 'tower-r4.6', 'mound-r6.4', 'pillar', 'ramp-1:4'].includes(s.name)) continue;
  const { c } = controlMesh(core.buildRegion(s.cell, 13));
  const L0 = levelFromControl(c), T0 = levelTopology(L0), L1 = ccStep(L0, T0, {});
  let outCell = 0, outHw = 0, n = 0, worst = 0, hwHist = new Map();
  for (let v = 0; v < c.vertCount; v++) {
    if (T0.vqStart[v + 1] === T0.vqStart[v] || !c.inR[v]) continue;
    // owned area only
    if (c.cx[v] < 0 || c.cx[v] > 32 || c.cy[v] < 0 || c.cy[v] > 32 || c.cz[v] < 0 || c.cz[v] > 32) continue;
    n++;
    let oc = false, oh = false;
    for (let a = 0; a < 3; a++) {
      const cc = (a === 0 ? c.cx[v] : a === 1 ? c.cy[v] : c.cz[v]) * 256;
      const off = (L1.P[v * 3 + a] - cc) / 256;
      if (Math.abs(off) > 0.5) { oc = true; worst = Math.max(worst, Math.abs(off)); }
      if (Math.abs(off) > c.hw[v] + 1e-9 && Math.abs(off) > Math.abs(c.dq[v * 3 + a] / 256)) oh = true;
    }
    hwHist.set(c.hw[v], (hwHist.get(c.hw[v]) ?? 0) + 1);
    if (oc) outCell++;
    if (oh) outHw++;
  }
  console.log(`${s.name.padEnd(13)} R-vertices ${n}: CC point outside its cell ${outCell} (worst offset ${worst.toFixed(3)}), outside guard ${outHw}; hw histogram ${[...hwHist].map(([k, v]) => `${k}:${v}`).join(' ')}`);
}
