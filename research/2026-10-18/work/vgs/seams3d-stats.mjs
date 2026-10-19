import { VARIANTS, clampRho } from './phys.mjs';
// re-use the world from seams3d by dynamic import trick: copy minimal
const mod = await import('./seams3d.mjs?stats').catch(() => null);
