// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

import { Camera } from '@/camera/camera';
import { OrbitControls } from '@/camera/orbitControls';
import { createHud } from '@/debug/hud';
import { Mesh } from '@/geometry/mesh';
import { UniformBuffer } from '@/gpu/uniformBuffer';
import { Shader } from '@/materials/shader';
import { Material } from '@/materials/material';
import { mat4, vec3 } from '@/math';
import { Texture } from '@/gpu/texture';

import cubeShaderCode from '@/materials/shaders/cube.wgsl?raw';

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

  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
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

function startRenderLoop(
  device: GPUDevice,
  context: GPUCanvasContext,
  material: Material,
  cubeMesh: Mesh,
  uniforms: UniformBuffer,
  depthTexture: GPUTexture,
  hud: ReturnType<typeof createHud>,
  camera: Camera
): void {
  // STATE
  let rotationalAngle = 0;
  const ANGULAR_SPEED = 1.0;
  let lastTime = performance.now();

  function update(dt: number): void {
    rotationalAngle += ANGULAR_SPEED * dt;
  }

  function render(): void {
    // Build the model
    const model = mat4.rotationY(rotationalAngle);
    mat4.rotateX(model, rotationalAngle * 0.5, model);
    // Build the viewProjections
    const viewProjection = mat4.multiply(camera.projectionMatrix, camera.viewMatrix);
    // Build the normal matrix
    const normalMatrix = mat4.transpose(mat4.inverse(model));
    // Build the cameraPosition
    const cameraPosition = camera.worldPosition;
    const shininess = [32];
    const lightDirection = vec3.normalize([0.5, 1, 0.5]);
    const ambient = [0.15];
    const lightColor = vec3.fromValues(1, 1, 1);
    const specularStrength = [0.5];

    const data = new Float32Array(60);
    data.set(model, 0);
    data.set(viewProjection, 16);
    data.set(normalMatrix, 32);
    data.set(cameraPosition, 48);
    data.set(shininess, 51);
    data.set(lightDirection, 52);
    data.set(ambient, 55);
    data.set(lightColor, 56);
    data.set(specularStrength, 59);

    uniforms.write(data);

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

    // Draw the cube
    material.bind(pass);
    cubeMesh.draw(pass);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function frame(now: number): void {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    update(dt);
    render();
    // The cube is the only draw call today. Replace this hardcoded 1 with a
    // real per-frame draw counter once there is more than one draw site.
    hud.frame(now, 1);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
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
    far: 100.0,
  });
  new OrbitControls(
    camera,
    canvas,
    { radius: 5, azimuth: 0, elevation: 0, target: vec3.fromValues(0, 0, 0) },
    {},
    {}
  );

  const cubeTexture = await Texture.load(
    device,
    `${import.meta.env.BASE_URL}textures/uv-grid.png`,
    'cube texture'
  );

  // Adds depth texture
  const depthTexture = device.createTexture({
    label: 'cube depth texture',
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

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

  const uniforms = new UniformBuffer(device, 240, 'uniform cube');

  const shader = new Shader({
    device,
    code: cubeShaderCode,
    label: 'cube shader',
  });

  const material = new Material({
    device,
    shader,
    vertexBufferLayouts: [cubeMesh.vertexBufferLayout],
    targets: [{ format }],
    entries: [
      { binding: 0, resource: { buffer: uniforms.buffer } },
      { binding: 1, resource: cubeTexture.texture.createView() },
      { binding: 2, resource: cubeTexture.sampler },
    ],
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
    label: 'cube material',
  });

  const hudCanvas = requireElement<HTMLCanvasElement>('#debug-hud');
  const hud = createHud(hudCanvas);

  startRenderLoop(device, context, material, cubeMesh, uniforms, depthTexture, hud, camera);
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
