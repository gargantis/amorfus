// Top-down material image of a real-terrain chunk with an approach's fragment.
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { rasterTopDown, materialImageRgb } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
const [modPath, cx, cy, cz, out, x0 = 0, z0 = 0, w = 32, own] = process.argv.slice(2);
const mod = await import(new URL(modPath, `file://${process.cwd()}/`).href);
const region = buildGenMeshInput([1, 1], +cx, +cy, +cz, new Map(), { forceApron: mod.apron ?? 10 }).input;
const mesh = mod.mesh(region, null, core);
const frag = own ? null : (a, i) => mod.fragment(a, i, null);
const img = rasterTopDown(mesh, { x0: +x0, z0: +z0, w: +w, h: +w, S: 24, fragment: frag });
const rgb = materialImageRgb(img);
writePng(out, rgb.width, rgb.height, rgb.rgb);
console.log('wrote', out);
