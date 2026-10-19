const S = (o) => ({ aoRule: 'smooth', ...o });
export const SETS = {
  ao: {
    lattice: {},
    'box-bin': S({ aoKernel: 'box', pvRule: 'binary' }),
    'tent-bin': S({ aoKernel: 'tent', pvRule: 'binary' }),
    'bsp-bin': S({ aoKernel: 'bspline', pvRule: 'binary' }),
    'box-rho': S({ aoKernel: 'box', pvRule: 'rho' }),
    'box-rhon': S({ aoKernel: 'box', pvRule: 'rhon' }),
    'tent-rhon': S({ aoKernel: 'tent', pvRule: 'rhon' }),
    'bsp-rhon': S({ aoKernel: 'bspline', pvRule: 'rhon' }),
    'box-mesh': S({ aoKernel: 'box', pvRule: 'mesh' }),
    'box-hyb': S({ aoKernel: 'box', pvRule: 'hybrid' }),
    'tent-hyb': S({ aoKernel: 'tent', pvRule: 'hybrid' }),
    'box-bin-dz': S({ aoKernel: 'box', pvRule: 'binary', aoBias: 0.6, aoGain: 2 }),
    'box-rhon-dz': S({ aoKernel: 'box', pvRule: 'rhon', aoBias: 0.6, aoGain: 2 }),
    'box-hyb-dz': S({ aoKernel: 'box', pvRule: 'hybrid', aoBias: 0.6, aoGain: 2 }),
  },
};
SETS.check = {
  lattice: {},
  'box-bin': S({ aoKernel: 'box', pvRule: 'binary' }),
  'box-rhon': S({ aoKernel: 'box', pvRule: 'rhon' }),
  'box-hyb': S({ aoKernel: 'box', pvRule: 'hybrid' }),
  'tent-rhon': S({ aoKernel: 'tent', pvRule: 'rhon' }),
  'box-hyb-dz': S({ aoKernel: 'box', pvRule: 'hybrid', aoBias: 0.6, aoGain: 2 }),
  'box-rho': S({ aoKernel: 'box', pvRule: 'rho' }),
  'box-hyb0': S({ aoKernel: 'box', pvRule: 'hybrid0' }),
};
const A = { aoRule: 'smooth', aoKernel: 'box', pvRule: 'rho' };
const N = (o) => ({ ...A, ...o });
SETS.nrm = {
  'area': N({}),
  'grad-rho': N({ normalRule: 'grad', normalPv: 'rho' }),
  'grad-hyb0': N({ normalRule: 'grad', normalPv: 'hybrid0' }),
  'grad2-rho': N({ normalRule: 'grad', normalPv: 'rho', normalKernel: 'bspline2' }),
  'grad2-hyb0': N({ normalRule: 'grad', normalPv: 'hybrid0', normalKernel: 'bspline2' }),
  'ring1': N({ normalRule: 'ring', normalRings: 1 }),
  'ring2': N({ normalRule: 'ring', normalRings: 2 }),
  'ring3': N({ normalRule: 'ring', normalRings: 3 }),
  'smooth2': N({ normalRule: 'smooth', normalIters: 2 }),
  'smooth4': N({ normalRule: 'smooth', normalIters: 4 }),
  'smooth8': N({ normalRule: 'smooth', normalIters: 8 }),
  'smooth4-ed': N({ normalRule: 'smooth', normalIters: 4, normalScope: 'edited' }),
  'ring2-ed': N({ normalRule: 'ring', normalRings: 2, normalScope: 'edited' }),
  'grad2-hyb0-ed': N({ normalRule: 'grad', normalPv: 'hybrid0', normalKernel: 'bspline2', normalScope: 'edited' }),
};
const DZ = { aoBiasEd: 0.6, aoGainEd: 2 };
SETS.combo = {
  'area': N({}),
  'g15': N({ normalRule: 'grad', normalPv: 'rho', normalKernel: 'bspline15' }),
  'g15-ed': N({ normalRule: 'grad', normalPv: 'rho', normalKernel: 'bspline15', normalScope: 'edited' }),
  'g2-ed': N({ normalRule: 'grad', normalPv: 'rho', normalKernel: 'bspline2', normalScope: 'edited' }),
  'area-dz': N({ ...DZ }),
  'g15-dz': N({ normalRule: 'grad', normalPv: 'rho', normalKernel: 'bspline15', ...DZ }),
  'g15-ed-dz': N({ normalRule: 'grad', normalPv: 'rho', normalKernel: 'bspline15', normalScope: 'edited', ...DZ }),
  'g2-ed-dz': N({ normalRule: 'grad', normalPv: 'rho', normalKernel: 'bspline2', normalScope: 'edited', ...DZ }),
  'ring2-ed-dz': N({ normalRule: 'ring', normalRings: 2, normalScope: 'edited', ...DZ }),
  'g2-ed-hyb': N({ pvRule: 'hybrid0', normalRule: 'grad', normalPv: 'rho', normalKernel: 'bspline2', normalScope: 'edited' }),
};
SETS.check = { ...SETS.check, ...SETS.combo };
const G2 = { normalRule: 'grad', normalPv: 'rho', normalKernel: 'bspline2', normalScope: 'edited' };
SETS.curve = {
  'g2-ed': N({ ...G2 }),
  'g2-ed-dz': N({ ...G2, ...DZ }),
  'g2-dzall': N({ ...G2, aoBias: 0.6, aoGain: 2 }),
  'g2-q48': N({ ...G2, aoCurve: 'quad', aoGain: 4.8 }),
  'g2-q48-dz': N({ ...G2, aoCurve: 'quad', aoGain: 4.8, aoBiasEd: 0.55, aoGainEd: 7.5 }),
};
SETS.check = { ...SETS.check, ...SETS.curve };
const Q = { aoCurve: 'quad', aoGain: 4.8 };
SETS.sigma = {};
for (const sg of [1.5, 2, 2.5, 3]) for (const er of [0, 1, 2, 3]) {
  SETS.sigma[`s${sg}-r${er}`] = N({ ...Q, normalRule: 'grad', normalPv: 'rho', normalSigma: sg, normalScope: 'edited', editReach: er });
}
SETS.hf = {
  'hints(repo)': {},
  'bevel(repo)': { rule: 'bevel' },
  'area': N({ ...Q }),
  'ring2-ed': N({ ...Q, normalRule: 'ring', normalRings: 2, normalScope: 'edited' }),
  'ring3-ed': N({ ...Q, normalRule: 'ring', normalRings: 3, normalScope: 'edited' }),
  'smooth4-ed': N({ ...Q, normalRule: 'smooth', normalIters: 4, normalScope: 'edited' }),
  's1.5-ed': SETS.sigma['s1.5-r2'],
  's2-ed': SETS.sigma['s2-r2'],
  's2.5-ed': SETS.sigma['s2.5-r2'],
  's3-ed': SETS.sigma['s3-r2'],
};
const BV = { rule: 'bevel', faceted: false };
SETS.bevel = {
  'bevel(repo)': { rule: 'bevel' },
  'bv-area': { ...BV },
  'bv-area-ao': { ...BV, ...A, ...Q },
  'bv-g15-bin': { ...BV, ...A, ...Q, normalRule: 'grad', normalPv: 'binary', normalSigma: 1.5 },
  'bv-g2-bin': { ...BV, ...A, ...Q, normalRule: 'grad', normalPv: 'binary', normalSigma: 2 },
  'bv-g2-rho': { ...BV, ...A, ...Q, normalRule: 'grad', normalPv: 'rho', normalSigma: 2 },
  'bv-ring2': { ...BV, ...A, ...Q, normalRule: 'ring', normalRings: 2 },
};
SETS.best = {
  'best': SETS.sigma['s2-r2'],
};
SETS.flip = {
  'best': SETS.best.best,
  'ring2-ed': N({ ...Q, normalRule: 'ring', normalRings: 2, normalScope: 'edited' }),
  'smooth4-ed': N({ ...Q, normalRule: 'smooth', normalIters: 4, normalScope: 'edited' }),
};
SETS.flip['ring2-d0-ed'] = N({ ...Q, normalRule: 'ring', normalRings: 2, normalScope: 'edited', normalFromD0: true });
SETS.flip['ring3-d0-ed'] = N({ ...Q, normalRule: 'ring', normalRings: 3, normalScope: 'edited', normalFromD0: true });
SETS.flip['ring3-ed'] = N({ ...Q, normalRule: 'ring', normalRings: 3, normalScope: 'edited' });
SETS.hf2 = { ...SETS.flip, 'hints(repo)': {} };
SETS.check['ring3-d0-ed'] = SETS.flip['ring3-d0-ed'];
SETS.final = { 'gn-best': (await import('../../approaches/gn-best.mjs')).PARAMS };
SETS.finalAll = {
  'hints(repo)': {},
  'bevel(repo)': { rule: 'bevel' },
  'gn-best': (await import('../../approaches/gn-best.mjs')).PARAMS,
  'gn-wide': (await import('../../approaches/gn-wide.mjs')).PARAMS,
  'gn-grad': (await import('../../approaches/gn-grad.mjs')).PARAMS,
  'gn-bevel': (await import('../../approaches/gn-bevel.mjs')).PARAMS,
};
SETS.check = { ...SETS.check, ...SETS.finalAll };
