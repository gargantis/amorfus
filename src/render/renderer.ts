// §8.3: the raw-WebGPU renderer. One terrain pipeline; chunks live in
// pooled vertex/index buffers and draw with drawIndexed(firstInstance =
// slot), reading their integer origin from a storage buffer. Reversed-Z
// depth32float; MSAA 1× or 4× by tier; sky as a fullscreen triangle.
import { mat4, vec3 } from 'wgpu-matrix';
import terrainSrc from './shaders/terrain.wgsl?raw';
import skySrc from './shaders/sky.wgsl?raw';
import { PoolAllocator } from './pool-allocator';
import { computeCanvasSize, TIERS, type Tier } from './resize';
import { frustumPlanes, aabbVisible } from './culling';
import { createMaterialTextures } from './textures';
import type { SimpleMesh } from '../core/mesh/simple-mesher';
import { CHUNK } from '../core/world/coords';

const POOL_BYTES = 64 * 1024 * 1024;
const MAX_SLOTS = 16384;
const FRAME_UNIFORM_BYTES = 256;
const FOG_COLOUR: [number, number, number] = [0.62, 0.72, 0.82];
const ZENITH: [number, number, number] = [0.25, 0.45, 0.75];

export interface Camera {
  position: [number, number, number];
  yaw: number; // radians, 0 looks -z
  pitch: number;
}

interface ChunkEntry {
  slot: number;
  vOffset: number;
  iOffset: number;
  indexCount: number;
  origin: [number, number, number];
}

export interface FrameStats {
  drawnChunks: number;
  drawnTriangles: number;
  cpuMs: number;
}

export class Renderer {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private canvas: HTMLCanvasElement;
  private format: GPUTextureFormat;
  tier: Tier;

  private terrainPipeline!: GPURenderPipeline;
  private skyPipeline!: GPURenderPipeline;
  private frameBuf!: GPUBuffer;
  private skyBuf!: GPUBuffer;
  private originBuf!: GPUBuffer;
  private vertexPool!: GPUBuffer;
  private indexPool!: GPUBuffer;
  private vertexAlloc = new PoolAllocator(POOL_BYTES);
  private indexAlloc = new PoolAllocator(POOL_BYTES);
  private terrainBind!: GPUBindGroup;
  private skyBind!: GPUBindGroup;

  private depth: GPUTexture | null = null;
  private msaaColor: GPUTexture | null = null;
  private width = 1;
  private height = 1;

  private chunks = new Map<number, ChunkEntry>();
  private freeSlots: number[] = [];

  private constructor(
    device: GPUDevice,
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    tier: Tier,
  ) {
    this.device = device;
    this.canvas = canvas;
    this.context = context;
    this.format = format;
    this.tier = tier;
    for (let i = MAX_SLOTS - 1; i >= 0; i--) this.freeSlots.push(i);
  }

  static async create(
    device: GPUDevice,
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    tierName: keyof typeof TIERS,
  ): Promise<Renderer> {
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });
    const r = new Renderer(device, canvas, context, format, TIERS[tierName]);

    const { sampleView } = await createMaterialTextures(device);
    const sampler = device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      maxAnisotropy: r.tier.anisotropy,
    });

    r.frameBuf = device.createBuffer({
      size: FRAME_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    r.skyBuf = device.createBuffer({
      size: 96,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    r.originBuf = device.createBuffer({
      size: MAX_SLOTS * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    r.vertexPool = device.createBuffer({
      size: POOL_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    r.indexPool = device.createBuffer({
      size: POOL_BYTES,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    const terrainModule = device.createShaderModule({ code: terrainSrc });
    const skyModule = device.createShaderModule({ code: skySrc });
    const sampleCount = r.tier.msaa;

    // §8.2: every pipeline, including each tier's variants, is created
    // with createRenderPipelineAsync before the first frame.
    r.terrainPipeline = await device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: {
        module: terrainModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 16,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'uint16x4' },
              { shaderLocation: 1, offset: 8, format: 'snorm16x2' },
              { shaderLocation: 2, offset: 12, format: 'uint8x4' },
            ],
          },
        ],
      },
      fragment: { module: terrainModule, entryPoint: 'fs_main', targets: [{ format }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
      multisample: { count: sampleCount },
    });
    r.skyPipeline = await device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: { module: skyModule, entryPoint: 'vs_main' },
      fragment: { module: skyModule, entryPoint: 'fs_main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: {
        format: 'depth32float',
        depthWriteEnabled: false,
        depthCompare: 'greater-equal',
      },
      multisample: { count: sampleCount },
    });

    r.terrainBind = device.createBindGroup({
      layout: r.terrainPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: r.frameBuf } },
        { binding: 1, resource: { buffer: r.originBuf } },
        { binding: 2, resource: sampleView },
        { binding: 3, resource: sampler },
      ],
    });
    r.skyBind = device.createBindGroup({
      layout: r.skyPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: r.skyBuf } }],
    });

    return r;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    const { width, height } = computeCanvasSize({
      cssWidth,
      cssHeight,
      dpr,
      pixelCapMP: this.tier.pixelCapMP,
    });
    if (width === this.width && height === this.height && this.depth !== null) return;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.depth?.destroy();
    this.msaaColor?.destroy();
    const sampleCount = this.tier.msaa;
    this.depth = this.device.createTexture({
      size: [width, height],
      format: 'depth32float',
      sampleCount,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.msaaColor =
      sampleCount === 4
        ? this.device.createTexture({
            size: [width, height],
            format: this.format,
            sampleCount,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
          })
        : null;
  }

  addChunk(chunkKey: number, origin: [number, number, number], mesh: SimpleMesh): void {
    if (mesh.quadCount === 0 || this.chunks.has(chunkKey)) return;
    const vOffset = this.vertexAlloc.alloc(mesh.vertexData.byteLength);
    const iOffset = this.indexAlloc.alloc(mesh.indexData.byteLength);
    const slot = this.freeSlots.pop();
    if (vOffset === null || iOffset === null || slot === undefined) {
      throw new Error('render pools exhausted');
    }
    // §8.3: queue.writeBuffer orders on the queue timeline — no fences.
    this.device.queue.writeBuffer(this.vertexPool, vOffset, mesh.vertexData);
    this.device.queue.writeBuffer(this.indexPool, iOffset, mesh.indexData.buffer as ArrayBuffer, mesh.indexData.byteOffset, mesh.indexData.byteLength);
    this.device.queue.writeBuffer(this.originBuf, slot * 16, new Int32Array([...origin, 0]).buffer as ArrayBuffer);
    this.chunks.set(chunkKey, {
      slot,
      vOffset,
      iOffset,
      indexCount: mesh.indexData.length,
      origin,
    });
  }

  removeChunk(chunkKey: number): void {
    const entry = this.chunks.get(chunkKey);
    if (entry === undefined) return;
    this.chunks.delete(chunkKey);
    this.vertexAlloc.free(entry.vOffset);
    this.indexAlloc.free(entry.iOffset);
    this.freeSlots.push(entry.slot);
  }

  has(chunkKey: number): boolean {
    return this.chunks.has(chunkKey);
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  get poolUsage(): { vertexBytes: number; indexBytes: number } {
    return { vertexBytes: this.vertexAlloc.usedBytes, indexBytes: this.indexAlloc.usedBytes };
  }

  private writeFrameUniforms(camera: Camera, aspect: number): Float32Array {
    const cameraBlock = camera.position.map(Math.floor) as [number, number, number];
    const frac = camera.position.map((v, i) => v - cameraBlock[i]!) as [number, number, number];

    const rot = mat4.identity();
    mat4.rotateX(rot, -camera.pitch, rot);
    mat4.rotateY(rot, -camera.yaw, rot);
    const view = mat4.translate(rot, vec3.negate(frac));
    const proj = mat4.perspectiveReverseZ((70 * Math.PI) / 180, aspect, 0.1);

    const buf = new ArrayBuffer(FRAME_UNIFORM_BYTES);
    const f32 = new Float32Array(buf);
    const i32 = new Int32Array(buf);
    f32.set(view, 0);
    f32.set(proj, 16);
    i32.set(cameraBlock, 32); // camera_block at byte 128
    f32.set(cameraBlock.map((v) => ((v % 1024) + 1024) % 1024), 36); // cam_mod
    const sun = vec3.normalize([0.5, 0.8, 0.3]);
    f32.set([sun[0]!, sun[1]!, sun[2]!, 0], 40);
    const fogK = 1.4 / Math.max(32, this.tier.viewRadius - 16);
    f32.set([fogK, ...FOG_COLOUR], 44);
    f32.set([0, performance.now() / 1000, 0, 0], 48);
    this.device.queue.writeBuffer(this.frameBuf, 0, buf);

    // Sky: inverse of proj·rotation (no translation).
    const invVp = mat4.invert(mat4.multiply(proj, rot));
    const skyData = new Float32Array(24);
    skyData.set(invVp, 0);
    skyData.set([...FOG_COLOUR, 1], 16);
    skyData.set([...ZENITH, 1], 20);
    this.device.queue.writeBuffer(this.skyBuf, 0, skyData.buffer as ArrayBuffer, 0, 96);

    return mat4.multiply(proj, view) as Float32Array;
  }

  /** Render one frame to a view (the swapchain by default). */
  render(camera: Camera, target?: { view: GPUTextureView; width: number; height: number }): FrameStats {
    const t0 = performance.now();
    const width = target?.width ?? this.width;
    const height = target?.height ?? this.height;
    const vp = this.writeFrameUniforms(camera, width / Math.max(1, height));
    const planes = frustumPlanes(vp);

    // Cull in camera-relative space and sort front to back (§8.3).
    const visible: Array<{ entry: ChunkEntry; dist: number }> = [];
    for (const entry of this.chunks.values()) {
      const min: [number, number, number] = [
        entry.origin[0] - camera.position[0],
        entry.origin[1] - camera.position[1],
        entry.origin[2] - camera.position[2],
      ];
      const max: [number, number, number] = [min[0] + CHUNK, min[1] + CHUNK, min[2] + CHUNK];
      if (!aabbVisible(planes, { min, max })) continue;
      const cx = min[0] + CHUNK / 2;
      const cy = min[1] + CHUNK / 2;
      const cz = min[2] + CHUNK / 2;
      visible.push({ entry, dist: cx * cx + cy * cy + cz * cz });
    }
    visible.sort((a, b) => a.dist - b.dist);

    const encoder = this.device.createCommandEncoder();
    const useMsaa = target === undefined && this.msaaColor !== null;
    const colorView =
      target?.view ?? (useMsaa ? this.msaaColor!.createView() : this.context.getCurrentTexture().createView());
    const depthTexture =
      target === undefined
        ? this.depth!
        : this.device.createTexture({
            size: [width, height],
            format: 'depth32float',
            sampleCount: 1,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
          });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: colorView,
          ...(useMsaa ? { resolveTarget: this.context.getCurrentTexture().createView() } : {}),
          loadOp: 'clear',
          clearValue: { r: FOG_COLOUR[0], g: FOG_COLOUR[1], b: FOG_COLOUR[2], a: 1 },
          storeOp: useMsaa ? 'discard' : 'store',
        },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 0, // reversed-Z far
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    });

    let drawnTriangles = 0;
    pass.setPipeline(target === undefined ? this.terrainPipeline : this.offscreenTerrain());
    pass.setBindGroup(0, this.terrainBind);
    pass.setVertexBuffer(0, this.vertexPool);
    pass.setIndexBuffer(this.indexPool, 'uint32');
    for (const { entry } of visible) {
      pass.drawIndexed(entry.indexCount, 1, entry.iOffset / 4, entry.vOffset / 16, entry.slot);
      drawnTriangles += entry.indexCount / 3;
    }
    pass.setPipeline(target === undefined ? this.skyPipeline : this.offscreenSky());
    pass.setBindGroup(0, this.skyBind);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    if (target !== undefined) depthTexture.destroy();

    return { drawnChunks: visible.length, drawnTriangles, cpuMs: performance.now() - t0 };
  }

  // Offscreen (readback) variants: sample count 1, rgba8unorm target.
  private offscreenTerrainPipe: GPURenderPipeline | null = null;
  private offscreenSkyPipe: GPURenderPipeline | null = null;
  private offscreenBindT: GPUBindGroup | null = null;
  private offscreenBindS: GPUBindGroup | null = null;

  async prepareOffscreen(): Promise<void> {
    if (this.offscreenTerrainPipe !== null) return;
    const terrainModule = this.device.createShaderModule({ code: terrainSrc });
    const skyModule = this.device.createShaderModule({ code: skySrc });
    this.offscreenTerrainPipe = await this.device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: {
        module: terrainModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 16,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'uint16x4' },
              { shaderLocation: 1, offset: 8, format: 'snorm16x2' },
              { shaderLocation: 2, offset: 12, format: 'uint8x4' },
            ],
          },
        ],
      },
      fragment: { module: terrainModule, entryPoint: 'fs_main', targets: [{ format: 'rgba8unorm' }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
    });
    this.offscreenSkyPipe = await this.device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: { module: skyModule, entryPoint: 'vs_main' },
      fragment: { module: skyModule, entryPoint: 'fs_main', targets: [{ format: 'rgba8unorm' }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'greater-equal' },
    });
    const { sampleView } = await createMaterialTextures(this.device);
    const sampler = this.device.createSampler({
      addressModeU: 'repeat', addressModeV: 'repeat',
      magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear',
    });
    this.offscreenBindT = this.device.createBindGroup({
      layout: this.offscreenTerrainPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.frameBuf } },
        { binding: 1, resource: { buffer: this.originBuf } },
        { binding: 2, resource: sampleView },
        { binding: 3, resource: sampler },
      ],
    });
    this.offscreenBindS = this.device.createBindGroup({
      layout: this.offscreenSkyPipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.skyBuf } }],
    });
  }

  private offscreenTerrain(): GPURenderPipeline {
    if (this.offscreenTerrainPipe === null) throw new Error('call prepareOffscreen first');
    return this.offscreenTerrainPipe;
  }

  private offscreenSky(): GPURenderPipeline {
    if (this.offscreenSkyPipe === null) throw new Error('call prepareOffscreen first');
    return this.offscreenSkyPipe;
  }

  /** §14: offscreen render-to-texture readback of the centre pixel. */
  async readCenterPixel(camera: Camera, size = 64): Promise<[number, number, number, number]> {
    await this.prepareOffscreen();
    const tex = this.device.createTexture({
      size: [size, size],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    // Swap bind groups for the offscreen pass.
    const mainBindT = this.terrainBind;
    const mainBindS = this.skyBind;
    this.terrainBind = this.offscreenBindT!;
    this.skyBind = this.offscreenBindS!;
    try {
      this.render(camera, { view: tex.createView(), width: size, height: size });
    } finally {
      this.terrainBind = mainBindT;
      this.skyBind = mainBindS;
    }
    const buf = this.device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = this.device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      { texture: tex, origin: [size / 2, size / 2] },
      { buffer: buf, bytesPerRow: 256 },
      [1, 1],
    );
    this.device.queue.submit([encoder.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(buf.getMappedRange(0, 4)).slice();
    buf.unmap();
    buf.destroy();
    tex.destroy();
    return [bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0];
  }
}
