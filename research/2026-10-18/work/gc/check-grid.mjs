// every emitted position must be on the 1/256 grid and inside the u16 range
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
for (const n of process.argv.slice(2)) {
  const M = await import(new URL(`../../approaches/${n}.mjs`, import.meta.url).href);
  let off = 0, range = 0, total = 0;
  for (const s of ALL_SCENES) {
    const m = M.mesh(core.buildRegion(s.cell, M.apron ?? 10), null, core);
    for (let i = 0; i < m.V * 3; i++) {
      total++;
      const q = m.pos[i] * 256;
      if (Math.abs(q - Math.round(q)) > 1e-9) off++;
      const u = (m.pos[i] + 0.5) * 256;
      if (u < 0 || u > 65535) range++;
    }
  }
  console.log(`${n}: ${total} coords, off-grid ${off}, outside u16 ${range}`);
}
