import { WebGPUEngine, Scene, FreeCamera, Vector3, CreateBox, StandardMaterial, HemisphericLight, DirectionalLight } from '@babylonjs/core';
const out: any = {};
const canvas = document.getElementById('c') as HTMLCanvasElement;
const engine = new WebGPUEngine(canvas, { antialias: false });
await engine.initAsync();
async function bench(n: number, frozen: boolean) {
  const scene = new Scene(engine);
  const cam = new FreeCamera('c', new Vector3(0, 50, 0.01), scene); cam.setTarget(Vector3.Zero()); cam.maxZ = 5000;
  new HemisphericLight('h', new Vector3(0, 1, 0), scene); new DirectionalLight('d', new Vector3(-1, -2, -1), scene);
  const mat = new StandardMaterial('m', scene);
  const side = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) { const b = CreateBox('b' + i, { size: 1 }, scene); b.material = mat; b.position.set((i % side) - side / 2, 0, Math.floor(i / side) - side / 2);
    if (frozen) { b.freezeWorldMatrix(); b.doNotSyncBoundingInfo = true; } }
  await scene.whenReadyAsync();
  if (frozen) mat.freeze();
  for (let i = 0; i < 30; i++) { engine.beginFrame(); scene.render(); engine.endFrame(); await new Promise(requestAnimationFrame); }
  const t: number[] = [];
  for (let i = 0; i < 60; i++) { cam.position.x = Math.sin(i) * 0.01; const t0 = performance.now(); engine.beginFrame(); scene.render(); engine.endFrame(); t.push(performance.now() - t0); await new Promise(requestAnimationFrame); }
  t.sort((a, b) => a - b); out[`n${n}_frozen${frozen}_renderJsMsMedian`] = +t[30].toFixed(2); out[`n${n}_active`] = scene.getActiveMeshes().length;
  scene.dispose();
}
try { for (const n of [500, 2000]) for (const f of [false, true]) await bench(n, f); } catch (e) { out.error = String(e) + " @ " + (e as any).stack?.slice(0, 600); }
(window as any).__out = out; document.title = 'done';
