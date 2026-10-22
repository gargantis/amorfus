// v-local physics helpers on the shared engine (lib/mbo.mjs, unchanged).
import { simulate, gaussKernel, blur3 } from '../../../lib/mbo.mjs';

export const REG = {
  'FID-0.15': { anchor: { kind: 'fidelity', k: 0.15 }, maxSteps: 300 },
  'FID-0.15-novol': { anchor: { kind: 'fidelity', k: 0.15 }, maxSteps: 300, volume: false },
  'FINITE-4': { maxSteps: 4, stopAfter: 99 },
  'FINITE-4-novol': { maxSteps: 4, stopAfter: 99, volume: false },
  'FINITE-8-novol': { maxSteps: 8, stopAfter: 99, volume: false },
};

export function run(blocks, reg, n, margin, extra = {}) {
  const t0 = performance.now();
  const sim = simulate(blocks, { ...REG[reg], n, margin, ...extra });
  sim.ms = Math.round(performance.now() - t0);
  return sim;
}

/** Solid indicator on a common frame: value at block-space cell (i, j, k) relative to the sim origin. */
export function solidAt(sim) {
  return (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= sim.NX || j >= sim.NY || k >= sim.NZ ? 0 : sim.label[(k * sim.NY + j) * sim.NX + i] ? 1 : 0);
}
export function matAt(sim) {
  return (i, j, k) => { if (i < 0 || j < 0 || k < 0 || i >= sim.NX || j >= sim.NY || k >= sim.NZ) return 0; const l = sim.label[(k * sim.NY + j) * sim.NX + i]; return l ? sim.phases[l].mat : 0; };
}

/** D0 = 2 * blur(solid indicator, renderS = 0.125 n) - 1 on a frame of size
 *  (NX, NY, NZ) (the larger of two sims), single-material scenes only. */
export function D0(sim, NX, NY, NZ) {
  const I = new Float64Array(NX * NY * NZ);
  const s = solidAt(sim);
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) I[(k * NY + j) * NX + i] = s(i, j, k);
  blur3(I, NX, NY, NZ, gaussKernel(0.125 * sim.n));
  for (let c = 0; c < I.length; c++) I[c] = 2 * I[c] - 1;
  return I;
}

export function cellCentre(sim, i, j, k) { return [sim.ox + (i + 0.5) / sim.n, sim.oy + (j + 0.5) / sim.n, sim.oz + (k + 0.5) / sim.n]; }
