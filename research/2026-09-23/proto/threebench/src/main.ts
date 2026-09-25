import * as THREE from 'three/webgpu';
const out: any = {};
async function bench(n: number, isStatic: boolean) {
  const r = new THREE.WebGPURenderer({ antialias: false });
  await r.init();
  r.setSize(256, 256);
  document.body.appendChild(r.domElement);
  const s = new THREE.Scene();
  const c = new THREE.PerspectiveCamera(70, 1, 0.1, 5000);
  c.position.set(0, 50, 0); c.lookAt(0, 0, 0);
  const mat = new THREE.MeshLambertNodeMaterial({ color: 0x88aa55 });
  s.add(new THREE.DirectionalLight(0xffffff, 1)); s.add(new THREE.HemisphereLight());
  const side = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.Mesh(g, mat);
    m.position.set((i % side) - side / 2, 0, Math.floor(i / side) - side / 2);
    m.static = isStatic; m.matrixAutoUpdate = !isStatic; m.updateMatrix();
    s.add(m);
  }
  for (let i = 0; i < 30; i++) { r.render(s, c); await new Promise(requestAnimationFrame); }
  const t: number[] = [];
  for (let i = 0; i < 60; i++) { const t0 = performance.now(); r.render(s, c); t.push(performance.now() - t0); await new Promise(requestAnimationFrame); }
  t.sort((a, b) => a - b);
  out[`n${n}_static${isStatic}_renderJsMsMedian`] = +t[30].toFixed(2);
  out[`n${n}_static${isStatic}_backend`] = (r.backend as any).isWebGPUBackend ? 'webgpu' : 'webgl';
  out[`n${n}_drawCalls`] = r.info.render.drawCalls;
  r.dispose(); r.domElement.remove();
}
try {
  for (const n of [500, 2000]) for (const st of [false, true]) await bench(n, st);
} catch (e) { out.error = String(e); }
(window as any).__out = out; document.title = 'done';
