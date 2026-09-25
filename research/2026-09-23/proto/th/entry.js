import { WebGPURenderer, Scene, PerspectiveCamera, Mesh, BufferGeometry, BufferAttribute, MeshStandardNodeMaterial } from 'three/webgpu';
const r = new WebGPURenderer(); const s = new Scene(); const c = new PerspectiveCamera();
const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(9),3));
s.add(new Mesh(g, new MeshStandardNodeMaterial())); r.render(s,c);
