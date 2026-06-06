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

function generateCheckerboardTexture(): [number, Uint8Array<ArrayBuffer>] {
  const texSize = 256;
  const texData = new Uint8Array(texSize * texSize * 4); // RGBA, 4 bytes per pixel
  const color1: [number, number, number] = [0, 0, 0];
  const color2: [number, number, number] = [255, 255, 255];
  for (let y = 0; y < texSize; y++) {
    for (let x = 0; x < texSize; x++) {
      const checker = (Math.floor(x / 32) + Math.floor(y / 32)) % 2; // 32px squares
      const [r, g, b] = checker === 0 ? color1 : color2;
      const i = (y * texSize + x) * 4;
      texData[i] = r;
      texData[i + 1] = g;
      texData[i + 2] = b;
      texData[i + 3] = 255; // alpha
    }
  }
  return [texSize, texData];
}

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
  const mvpData = new Float32Array(16); // 4x4 matrix

  // STATE
  let rotationalAngle = 0;
  let elapsed = 0;
  const ANGULAR_SPEED = 1.0;
  let lastTime = performance.now();

  function update(dt: number): void {
    rotationalAngle += ANGULAR_SPEED * dt;
    elapsed += dt;
  }

  function render(): void {
    // Build the MVP matrix
    const model = mat4.rotationY(rotationalAngle);
    mat4.rotateX(model, rotationalAngle * 0.5, model);

    mat4.multiply(camera.projectionMatrix, mat4.multiply(camera.viewMatrix, model), mvpData);
    uniforms.write(mvpData);

    // Color-changing background
    const r = 0.5 + 0.5 * Math.sin(elapsed * 0.7);
    const g = 0.5 + 0.5 * Math.sin(elapsed * 1.1 + 2.0);
    const b = 0.5 + 0.5 * Math.sin(elapsed * 1.3 + 4.0);

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

function initScene(device: GPUDevice, context: GPUCanvasContext): void {
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

  const [texSize, texData] = generateCheckerboardTexture();
  const texture = device.createTexture({
    label: 'cube texture',
    size: [texSize, texSize],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture }, texData, { bytesPerRow: texSize * 4 }, [texSize, texSize]);

  const sampler = device.createSampler({
    label: 'cube sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // Adds depth texture
  const depthTexture = device.createTexture({
    label: 'cube depth texture',
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  // Vertex Data and Vertex Buffer for a Cube
  // 24 vertices: 4 per face, each = [x, y, z,  u, v]
  const cubeVertexData = new Float32Array([
    // +Z (front)
    -1, -1, 1, 0, 1, 1, -1, 1, 1, 1, 1, 1, 1, 1, 0, -1, 1, 1, 0, 0,
    // -Z (back)
    1, -1, -1, 0, 1, -1, -1, -1, 1, 1, -1, 1, -1, 1, 0, 1, 1, -1, 0, 0,
    // -X (left)
    -1, -1, -1, 0, 1, -1, -1, 1, 1, 1, -1, 1, 1, 1, 0, -1, 1, -1, 0, 0,
    // +X (right)
    1, -1, 1, 0, 1, 1, -1, -1, 1, 1, 1, 1, -1, 1, 0, 1, 1, 1, 0, 0,
    // +Y (top)
    -1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, -1, 1, 0, -1, 1, -1, 0, 0,
    // -Y (bottom)
    -1, -1, -1, 0, 1, 1, -1, -1, 1, 1, 1, -1, 1, 1, 0, -1, -1, 1, 0, 0,
  ]);
  // 36 indices: 2 triangles per face. For face f, corners are f*4 + (0,1,2,3).
  const cubeIndexData = new Uint16Array([
    // +Z
    0, 1, 2, 0, 2, 3,
    // -Z
    4, 5, 6, 4, 6, 7,
    // -X
    8, 9, 10, 8, 10, 11,
    // +X
    12, 13, 14, 12, 14, 15,
    // +Y
    16, 17, 18, 16, 18, 19,
    // -Y
    20, 21, 22, 20, 22, 23,
  ]);

  const cubeMesh = new Mesh({
    device,
    vertices: cubeVertexData,
    formats: ['float32x3', 'float32x2'],
    indices: cubeIndexData,
  });

  const uniforms = new UniformBuffer(device, 64, 'uniform cube');

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
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: sampler },
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
  setStatus(`Pharos — clearing at ${format}, and drawing a cube. Drag to rotate; scroll to zoom.`);
}

setStatus('Initializing WebGPU…');
const device = await initWebGpu();
if (device) {
  const context = canvas.getContext('webgpu');
  if (!context) {
    setStatus('Could not obtain a WebGPU canvas context.', 'error');
  } else {
    initScene(device, context);
  }
}
