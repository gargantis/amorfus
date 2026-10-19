import { synthRho } from './syn.mjs';
const synth = (cfg, params) => (region, core) => {
  const { rho } = synthRho(region, cfg);
  return core.decodeMesh(core.meshRegion({ ...region, rho, params }));
};
export const configs = [
  { label: 'hints', mesh: (r, core) => core.decodeMesh(core.meshRegion({ ...r, params: {} })) },
  { label: 'chi-b3x2-k0', mesh: synth({ method: 'blurChi', kernel: 'b3x2' }, { k: 0 }) },
  { label: 'chi-b3x2-k6', mesh: synth({ method: 'blurChi', kernel: 'b3x2' }, {}) },
  { label: 'chi-b5x2-k0', mesh: synth({ method: 'blurChi', kernel: 'b5x2' }, { k: 0 }) },
  { label: 'sdt-b3x2-k0', mesh: synth({ method: 'blurSdt', kernel: 'b3x2', clamp: 4 }, { k: 0 }) },
  { label: 'sdt-b5x2-k0', mesh: synth({ method: 'blurSdt', kernel: 'b5x2', clamp: 5 }, { k: 0 }) },
];
