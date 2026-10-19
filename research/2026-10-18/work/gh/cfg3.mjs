import { synthRho } from './syn.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
const synth = (cfg, params) => (region, core) => {
  const { rho } = synthRho(region, cfg);
  return core.decodeMesh(ghMesh({ ...region, rho, params }));
};
const N = { clearance: 'narrow' };
export const configs = [
  { label: 'hints', mesh: (r, core) => core.decodeMesh(ghMesh({ ...r, params: {} })) },
  { label: 'hints-narrow', mesh: (r, core) => core.decodeMesh(ghMesh({ ...r, params: N })) },
  { label: 'hints-narrow-k12', mesh: (r, core) => core.decodeMesh(ghMesh({ ...r, params: { ...N, k: 12 } })) },
  { label: 'sdt-b3x2-k0-N', mesh: synth({ method: 'blurSdt', kernel: 'b3x2', clamp: 4 }, { k: 0, ...N }) },
  { label: 'sdt-b3x2-k6-N', mesh: synth({ method: 'blurSdt', kernel: 'b3x2', clamp: 4 }, { ...N }) },
  { label: 'sdt-b5x2-k0-N', mesh: synth({ method: 'blurSdt', kernel: 'b5x2', clamp: 5 }, { k: 0, ...N }) },
  { label: 'chi-b4x2-k0-N', mesh: synth({ method: 'blurChi', kernel: 'b4x2' }, { k: 0, ...N }) },
];
