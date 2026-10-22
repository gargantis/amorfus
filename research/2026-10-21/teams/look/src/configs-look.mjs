// The catalogue this team sweeps: the 15 configurations of the mission, plus
// sq2-same (edge rounding of a 1-thick layer) and slab-halves (a straight
// flat A|B seam far from other edges, for the groove). slab-halves is new
// (defined here, not in lib/configs.mjs).
import { byName, A, B } from '../../../lib/configs.mjs';

const plan = (rows, y = 0) => {
  const Mm = { A, B };
  const out = [];
  rows.forEach((row, z) => [...row].forEach((ch, x) => { if (Mm[ch]) out.push([x, y, z, Mm[ch]]); }));
  return out;
};

export const MISSION = ['single', 'pair-same', 'pair-diff', 'L3-ABC', 'sq2-AABB', 'cube2-same', 'cube2-oneB', 'stairs',
  'slab-dot', 'slab-line', 'slab-stripe', 'terrain-step', 'tunnel', 'pillar3', 'ring8'];

export const EXTRA = [
  byName('sq2-same'),
  { name: 'slab-halves', desc: '6×6 slab, A half (x < 3) and B half: one straight flat seam', blocks: plan(Array(6).fill('AAABBB')) },
];

export const ALL = [...MISSION.map(byName), ...EXTRA];
