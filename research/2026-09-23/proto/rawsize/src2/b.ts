import { makeShaderDataDefinitions, makeStructuredView } from 'webgpu-utils';
console.log(makeStructuredView(makeShaderDataDefinitions('struct U { a: vec4f }; @group(0) @binding(0) var<uniform> u: U;').uniforms.u));
