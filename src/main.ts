// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

import { Camera } from '@/camera/camera';
import { OrbitControls } from '@/camera/orbitControls';
import { createHud } from '@/debug/hud';
import { Mesh } from '@/geometry/mesh';
import { UniformBuffer } from '@/gpu/uniformBuffer';
import { Shader } from '@/materials/shader';
import { Material } from '@/materials/material';
import { mat4, vec3, quat, type Mat4 } from '@/math';
import { Node } from '@/scene/node';
import { Texture } from '@/gpu/texture';
import { loadKtx2Texture } from '@/gpu/ktx2';
import { loadGltf, type GltfScene } from '@/assets/gltf';
import { assetUrl } from '@/assets/assetUrl';

import cubeShaderCode from '@/materials/shaders/cube.wgsl?raw';
import normalsShaderCode from '@/materials/shaders/normals.wgsl?raw';
import texturedShaderCode from '@/materials/shaders/textured.wgsl?raw';

function requireElement<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) {
    throw new Error(`Expected element ${selector} in index.html`);
  }
  return el;
}

const canvas = requireElement<HTMLCanvasElement>('#app');
const statusEl = requireElement<HTMLElement>('#status');

type StatusTone = 'info' | 'error';

function setStatus(message: string, tone: StatusTone = 'info'): void {
  statusEl.textContent = message;
  statusEl.dataset['tone'] = tone;
}

async function initWebGpu(): Promise<GPUDevice | null> {
  if (!navigator.gpu) {
    setStatus(
      'WebGPU is not available in this browser. Try a recent build of Chrome, Edge, or Safari 18+.',
      'error'
    );
    return null;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    setStatus(
      'No suitable GPU adapter could be found. WebGPU may be disabled by policy or unsupported on this hardware.',
      'error'
    );
    return null;
  }

  const compressionFeatures = (
    ['texture-compression-bc', 'texture-compression-etc2', 'texture-compression-astc'] as const
  ).filter((f) => adapter.features.has(f));

  let device: GPUDevice;
  try {
    device = await adapter.requestDevice({ requiredFeatures: compressionFeatures });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    setStatus(`Failed to acquire a GPU device: ${reason}`, 'error');
    return null;
  }

  void device.lost.then((info) => {
    setStatus(`GPU device lost (${info.reason}): ${info.message}`, 'error');
  });

  if (import.meta.env.DEV) {
    console.groupCollapsed('[pharos] WebGPU adapter');
    console.info('info:', adapter.info);
    console.info('features:', [...adapter.features]);
    console.info('limits:', adapter.limits);
    console.info('compressionFeatures:', compressionFeatures);
    console.groupEnd();
  }

  return device;
}

function sizeCanvasToDisplay(canvas: HTMLCanvasElement, device: GPUDevice): void {
  const maxDim = device.limits.maxTextureDimension2D;
  const width = Math.min(Math.max(1, canvas.clientWidth), maxDim);
  const height = Math.min(Math.max(1, canvas.clientHeight), maxDim);
  canvas.width = width;
  canvas.height = height;
}

// A loaded glTF model rendered alongside the cubes: its scene graph, the
// normals material, its own MVP uniform (one per model, so models don't alias
// each other's transform), and a demo-placement transform applied on top of
// each renderable's world matrix.
type GltfModel = {
  scene: GltfScene;
  material: Material;
  mvp: UniformBuffer;
  transform: Mat4;
};

function startRenderLoop(
  device: GPUDevice,
  context: GPUCanvasContext,
  material: Material,
  cubeMesh: Mesh,
  hud: ReturnType<typeof createHud>,
  camera: Camera,
  perFrame: UniformBuffer,
  perObject: UniformBuffer,
  positions: Float32Array<ArrayBufferLike>[],
  NUM_CUBES: number,
  ALIGN: number,
  models: GltfModel[]
): void {
  // STATE
  let rotationalAngle = 0;
  const ANGULAR_SPEED = 1.0;
  let lastTime = performance.now();

  let depthTexture = createDepthTexture(device, canvas.width, canvas.height);

  // Resize handling
  let needsResize = false;

  new ResizeObserver(() => {
    needsResize = true;
  }).observe(canvas);

  function handleResize(): void {
    sizeCanvasToDisplay(canvas, device);
    depthTexture.destroy();
    depthTexture = createDepthTexture(device, canvas.width, canvas.height);
    camera.setAspectRatio(canvas.width / canvas.height);
  }

  function update(dt: number): void {
    rotationalAngle += ANGULAR_SPEED * dt;
  }

  function render(): void {
    // Build the perFrame pieces
    const viewProjection = mat4.multiply(camera.projectionMatrix, camera.viewMatrix);
    const cameraPosition = camera.worldPosition;
    const shininess = [32];
    const lightDirection = vec3.normalize([0.5, 1, 0.5]);
    const ambient = [0.15];
    const lightColor = vec3.fromValues(1, 1, 1);
    const specularStrength = [0.5];

    // PerFrame Uniforms
    const perFrameData = new Float32Array(28);
    perFrameData.set(viewProjection, 0);
    perFrameData.set(cameraPosition, 16);
    perFrameData.set(shininess, 19);
    perFrameData.set(lightDirection, 20);
    perFrameData.set(ambient, 23);
    perFrameData.set(lightColor, 24);
    perFrameData.set(specularStrength, 27);
    perFrame.write(perFrameData);

    // PerObject Uniforms
    const objectData = new Float32Array((NUM_CUBES * ALIGN) / 4);

    positions.forEach((position, i) => {
      const base = i * (ALIGN / 4);
      const model = mat4.translation(position);
      mat4.rotateX(model, rotationalAngle * 0.5, model);
      mat4.rotateY(model, rotationalAngle * 0.2, model);
      const normalMatrix = mat4.transpose(mat4.inverse(model));
      objectData.set(model, base);
      objectData.set(normalMatrix, base + 16);
    });
    perObject.write(objectData);

    // Fixed dark grey background
    const r = 0.1;
    const g = 0.1;
    const b = 0.1;

    // Open a render pass
    const encoder = device.createCommandEncoder({ label: 'frame encoder' });
    const pass = encoder.beginRenderPass({
      label: 'cube pass',
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r, g, b, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    for (let i = 0; i < positions.length; i++) {
      material.bind(pass, [i * ALIGN]);
      cubeMesh.draw(pass);
    }

    // The loaded glTF models, tinted by surface normal (the unlit normals
    // material), each placed by its own demo transform along +Z (cubes → box →
    // duck, front-to-back). Each model has its own MVP uniform, so one write
    // per renderable is safe as long as a model has a single renderable;
    // multiple per model would alias and need the #18 treatment.
    const mvpData = new Float32Array(16); // ArrayBuffer-backed scratch for the upload
    for (const model of models) {
      for (const { node, mesh } of model.scene.renderables) {
        const world = mat4.multiply(model.transform, node.getWorldMatrix());
        mat4.multiply(viewProjection, world, mvpData); // product into the scratch
        model.mvp.write(mvpData);
        model.material.bind(pass);
        mesh.draw(pass);
      }
    }

    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function frame(now: number): void {
    if (needsResize) {
      handleResize();
      needsResize = false;
    }

    const dt = (now - lastTime) / 1000;
    lastTime = now;
    update(dt);
    render();
    const gltfDraws = models.reduce((n, m) => n + m.scene.renderables.length, 0);
    hud.frame(now, NUM_CUBES + gltfDraws);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function createDepthTexture(device: GPUDevice, width: number, height: number): GPUTexture {
  return device.createTexture({
    label: 'cube depth texture',
    size: [width, height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

async function initScene(device: GPUDevice, context: GPUCanvasContext) {
  const format = navigator.gpu.getPreferredCanvasFormat();
  sizeCanvasToDisplay(canvas, device);
  context.configure({
    device,
    format,
    alphaMode: 'opaque',
  });

  const camera = new Camera({
    position: vec3.fromValues(0, 0, 5),
    target: vec3.fromValues(0, 0, 0),
    up: vec3.fromValues(0, 1, 0),
    fieldOfView: (60 * Math.PI) / 180,
    aspectRatio: canvas.width / canvas.height,
    near: 0.1,
    far: 1000.0,
  });
  new OrbitControls(
    camera,
    canvas,
    { radius: 25, azimuth: 0, elevation: 0, target: vec3.fromValues(0, 0, 0) },
    { maxRadius: 200 }, // stay well inside the camera's far plane (1000) so the scene never clips
    {}
  );

  const cubeTexture = await Texture.load(
    device,
    assetUrl('textures/uv-grid.png'),
    'cube texture'
  );

  // Each face: outward normal, then 4 corners as [x, y, z, u, v] (CCW).
  type Face = {
    normal: [number, number, number];
    corners: [number, number, number, number, number][];
  };
  const faces: Face[] = [
    {
      normal: [0, 0, 1], // +Z (front)
      corners: [
        [-1, -1, 1, 0, 1],
        [1, -1, 1, 1, 1],
        [1, 1, 1, 1, 0],
        [-1, 1, 1, 0, 0],
      ],
    },
    {
      normal: [0, 0, -1], // -Z (back)
      corners: [
        [1, -1, -1, 0, 1],
        [-1, -1, -1, 1, 1],
        [-1, 1, -1, 1, 0],
        [1, 1, -1, 0, 0],
      ],
    },
    {
      normal: [-1, 0, 0], // -X (left)
      corners: [
        [-1, -1, -1, 0, 1],
        [-1, -1, 1, 1, 1],
        [-1, 1, 1, 1, 0],
        [-1, 1, -1, 0, 0],
      ],
    },
    {
      normal: [1, 0, 0], // +X (right)
      corners: [
        [1, -1, 1, 0, 1],
        [1, -1, -1, 1, 1],
        [1, 1, -1, 1, 0],
        [1, 1, 1, 0, 0],
      ],
    },
    {
      normal: [0, 1, 0], // +Y (top)
      corners: [
        [-1, 1, 1, 0, 1],
        [1, 1, 1, 1, 1],
        [1, 1, -1, 1, 0],
        [-1, 1, -1, 0, 0],
      ],
    },
    {
      normal: [0, -1, 0], // -Y (bottom)
      corners: [
        [-1, -1, -1, 0, 1],
        [1, -1, -1, 1, 1],
        [1, -1, 1, 1, 0],
        [-1, -1, 1, 0, 0],
      ],
    },
  ];

  // Build the interleaved vertex buffer (position, normal, uv) and indices from
  // the face descriptions. For face f, the two triangles are f*4 + (0,1,2) and
  // f*4 + (0,2,3).
  const verts: number[] = [];
  const indices: number[] = [];
  faces.forEach((face, f) => {
    for (const [x, y, z, u, v] of face.corners) {
      verts.push(x, y, z, ...face.normal, u, v);
    }
    const b = f * 4;
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const cubeVertexData = new Float32Array(verts);
  const cubeIndexData = new Uint16Array(indices);

  const cubeMesh = new Mesh({
    device,
    vertices: cubeVertexData,
    formats: ['float32x3', 'float32x3', 'float32x2'],
    indices: cubeIndexData,
  });

  const shader = new Shader({
    device,
    code: cubeShaderCode,
    label: 'cube shader',
  });

  const ALIGN = device.limits.minUniformBufferOffsetAlignment;
  const NUM_CUBES = 100;

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'cube bind group layout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform', hasDynamicOffset: true },
      },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ],
  });

  const perFrame = new UniformBuffer(device, 112, 'per-frame'); // PerFrame = 112 bytes
  const perObject = new UniformBuffer(device, NUM_CUBES * ALIGN, 'per-object'); // 100 slots × 256

  const material = new Material({
    device,
    shader,
    vertexBufferLayouts: [cubeMesh.vertexBufferLayout],
    targets: [{ format }],
    entries: [
      { binding: 0, resource: { buffer: perFrame.buffer } },
      { binding: 1, resource: { buffer: perObject.buffer, offset: 0, size: ALIGN } },
      { binding: 2, resource: cubeTexture.texture.createView() },
      { binding: 3, resource: cubeTexture.sampler },
    ],
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
    label: 'cube material',
    bindGroupLayout: bindGroupLayout,
  });

  // --- glTF models (issues #20, #119) --------------------------------------
  // Load real .glb files and render them alongside the cubes with the normals
  // material (position + normal only — these models' textured materials are out
  // of scope until #21/#22). Each model gets its own MVP uniform + material so
  // they don't alias each other.
  const normalsShader = new Shader({ device, code: normalsShaderCode, label: 'normals shader' });
  const texturedShader = new Shader({
    device,
    code: texturedShaderCode,
    label: 'textured shader',
  });

  async function loadModel(url: string, transform: Mat4): Promise<GltfModel> {
    const scene = await loadGltf(device, url);
    const first = scene.renderables[0];
    if (first === undefined) {
      throw new Error(`${url} produced no renderables`);
    }
    const mvp = new UniformBuffer(device, 64, `${url} mvp`); // one mat4x4<f32>

    let bindGroupLayout = device.createBindGroupLayout({
      label: `${url} bind group layout`,
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });
    let shader = normalsShader;
    let entries: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer: mvp.buffer } }];

    if (first.material.baseColorTexture !== undefined) {
      shader = texturedShader;
      bindGroupLayout = device.createBindGroupLayout({
        label: `${url} bind group layout`,
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        ],
      });

      const texture = first.material.baseColorTexture; // the Texture | undefined — you've already checked it's defined in this branch
      entries = [
        { binding: 0, resource: { buffer: mvp.buffer } },
        { binding: 1, resource: texture.texture.createView() }, // GPUTexture → a view
        { binding: 2, resource: texture.sampler }, // the GPUSampler
      ];
    }

    const material = new Material({
      device,
      shader: shader,
      vertexBufferLayouts: [first.mesh.vertexBufferLayout],
      targets: [{ format }],
      entries: entries,
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
      label: `${url} material`,
      bindGroupLayout,
    });
    return { scene, material, mvp, transform };
  }

  // Placed front-to-back along +Z (toward the default camera): cubes at z=0,
  // then the unit Box at z=5, then the Duck (recentered, scaled) at z=12.
  const models: GltfModel[] = [
    await loadModel(
      assetUrl('models/Box.glb'),
      mat4.multiply(mat4.translation([0, 0, 5]), mat4.scaling([5, 5, 5]))
    ),
    await loadModel(
      assetUrl('models/Duck.glb'),
      mat4.multiply(
        mat4.translation([0, 0, 12]),
        mat4.multiply(mat4.scaling([4.8, 4.8, 4.8]), mat4.translation([-0.134, -0.869, 0.037]))
      )
    ),
  ];

  // --- KTX2 (#23) ----------------------------------------------------------
  // Render the transcoded KTX2 photo on a quad. Standalone (hand-built model) —
  // glTF would reference KTX2 via the KHR_texture_basisu extension (a follow-up).
  const ktx2Bytes = await (await fetch(assetUrl('textures/test.ktx2'))).arrayBuffer();
  const ktx2Texture = await loadKtx2Texture(device, ktx2Bytes, Texture.DEFAULT_SAMPLER);
  const quadMesh = new Mesh({
    device,
    // Unit quad in XY facing +Z; interleaved pos/normal/uv to match textured.wgsl.
    vertices: new Float32Array([
      -1, -1, 0, 0, 0, 1, 0, 1, 1, -1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, -1, 1, 0, 0, 0, 1, 0,
      0,
    ]),
    formats: ['float32x3', 'float32x3', 'float32x2'],
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  });
  const ktx2Mvp = new UniformBuffer(device, 64, 'ktx2 mvp');
  const ktx2Material = new Material({
    device,
    shader: texturedShader,
    vertexBufferLayouts: [quadMesh.vertexBufferLayout],
    targets: [{ format }],
    entries: [
      { binding: 0, resource: { buffer: ktx2Mvp.buffer } },
      { binding: 1, resource: ktx2Texture.texture.createView() },
      { binding: 2, resource: ktx2Texture.sampler },
    ],
    depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
    label: 'ktx2 material',
    bindGroupLayout: device.createBindGroupLayout({
      label: 'ktx2 bind group layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    }),
  });
  const ktx2Node = new Node(vec3.fromValues(0, 0, 0), quat.identity(), vec3.fromValues(1, 1, 1));
  models.push({
    scene: {
      roots: [ktx2Node],
      renderables: [
        {
          node: ktx2Node,
          mesh: quadMesh,
          material: { baseColor: [1, 1, 1, 1], metallic: 0, roughness: 1, baseColorTexture: ktx2Texture },
        },
      ],
    },
    material: ktx2Material,
    mvp: ktx2Mvp,
    // Left of the grid, scaled to the 512x768 (2:3) aspect.
    transform: mat4.multiply(mat4.translation([-18, 0, 8]), mat4.scaling([5, 7.5, 1])),
  });

  const hudCanvas = requireElement<HTMLCanvasElement>('#debug-hud');
  const hud = createHud(hudCanvas);

  const GRID = 10,
    SPACING = 4;
  const positions = Array.from({ length: NUM_CUBES }, (_, i) => {
    const col = i % GRID,
      row = Math.floor(i / GRID);
    return vec3.fromValues((col - GRID / 2) * SPACING, (row - GRID / 2) * SPACING, 0);
  });

  startRenderLoop(
    device,
    context,
    material,
    cubeMesh,
    hud,
    camera,
    perFrame,
    perObject,
    positions,
    NUM_CUBES,
    ALIGN,
    models
  );
  setStatus(
    `Pharos — clearing at ${format}, and drawing a rotating cube. Drag to rotate the orbital camera; scroll to zoom.`
  );
}

setStatus('Initializing WebGPU…');
const device = await initWebGpu();
if (device) {
  const context = canvas.getContext('webgpu');
  if (!context) {
    setStatus('Could not obtain a WebGPU canvas context.', 'error');
  } else {
    await initScene(device, context);
  }
}
