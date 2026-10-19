import { synthRho } from './syn.mjs';
const synth = (cfg, params) => (region, core) => {
  const { rho } = synthRho(region, cfg);
  return core.decodeMesh(core.meshRegion({ ...region, rho, params }));
};
const NOCAP = { capHorizontal: 0.5, capVertical: 0.5 };
export const configs = [
  { label: 'hints-nocap', mesh: (r, core) => core.decodeMesh(core.meshRegion({ ...r, params: NOCAP })) },
  { label: 'chi-b3x2-k0', mesh: synth({ method: 'blurChi', kernel: 'b3x2' }, { k: 0, ...NOCAP }) },
  { label: 'chi-b5x2-k0', mesh: synth({ method: 'blurChi', kernel: 'b5x2' }, { k: 0, ...NOCAP }) },
  { label: 'chi-box9-k0', mesh: synth({ method: 'blurChi', kernel: 'box9' }, { k: 0, ...NOCAP }) },
  { label: 'sdt-b3x2-k0', mesh: synth({ method: 'blurSdt', kernel: 'b3x2', clamp: 4 }, { k: 0, ...NOCAP }) },
  { label: 'sdt-b5x2-k0', mesh: synth({ method: 'blurSdt', kernel: 'b5x2', clamp: 5 }, { k: 0, ...NOCAP }) },
  { label: 'sdt-b3x2-k6', mesh: synth({ method: 'blurSdt', kernel: 'b3x2', clamp: 4 }, { ...NOCAP }) },
];
