import { mat4, vec3 } from 'wgpu-matrix';
const m = mat4.perspective(1, 1, 0.1, 100);
const v = mat4.lookAt(vec3.create(0,0,5), vec3.create(0,0,0), vec3.create(0,1,0));
const vp = mat4.multiply(m, v);
const inv = mat4.inverse(vp);
console.log(vp, inv);
