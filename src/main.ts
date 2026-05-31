// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

import { mat4 } from '@/math';
import { createHud } from './debug/hud';

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
  pipeline: GPURenderPipeline,
  vertexBuffer: GPUBuffer,
  indexBuffer: GPUBuffer,
  indexCount: number,
  uniformBuffer: GPUBuffer,
  bindGroup: GPUBindGroup,
  depthTexture: GPUTexture,
  hud: ReturnType<typeof createHud>
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
    const aspect = canvas.width / canvas.height;
    const project = mat4.perspective(
      (60 * Math.PI) / 180, // vertical field of view in radians
      aspect,
      0.1, // near plane
      100.0 // far plane
    );
    const view = mat4.lookAt(
      [0, 0, 5], // camera position
      [0, 0, 0], // look at position
      [0, 1, 0] // up vector
    );
    const model = mat4.rotationY(rotationalAngle);
    mat4.rotateX(model, rotationalAngle * 0.5, model);

    mat4.multiply(project, mat4.multiply(view, model), mvpData);
    device.queue.writeBuffer(uniformBuffer, 0, mvpData);

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
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(indexCount);
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

  const cubeVertexBuffer = device.createBuffer({
    label: 'cube vertices',
    size: cubeVertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(cubeVertexBuffer, 0, cubeVertexData);

  const cubeIndexBuffer = device.createBuffer({
    label: 'cube indices',
    size: cubeIndexData.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(cubeIndexBuffer, 0, cubeIndexData);

  const uniformBuffer = device.createBuffer({
    label: 'uniform cube',
    size: 64, // 4x4 matrix of 32-bit floats
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const shaderModule = device.createShaderModule({
    label: 'cube shaders',
    code: `
      struct VertexOutput {
        @builtin(position) clipPosition: vec4<f32>,  // required: the clip-space position of the vertex
        @location(0) fragUV: vec2<f32>,             // extra: interpolated UV coordinates to pass to the fragment shader
      };

      @group(0) @binding(0) var<uniform> mvpMatrix: mat4x4<f32>;
      @group(0) @binding(1) var cubeTexture: texture_2d<f32>;
      @group(0) @binding(2) var cubeSampler: sampler;

      @vertex
      fn vs_main(@location(0) position: vec3<f32>, @location(1) uv: vec2<f32>) -> VertexOutput {
        var output: VertexOutput;
        output.clipPosition = mvpMatrix * vec4<f32>(position, 1.0);
        output.fragUV = uv;
        return output;
      }

      @fragment
      fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
        return textureSample(cubeTexture, cubeSampler, uv);
      }
    `,
  });

  const pipeline = device.createRenderPipeline({
    label: 'cube pipeline',
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
      buffers: [
        {
          arrayStride: 20, // 5 floats * 4 bytes per float
          attributes: [
            {
              shaderLocation: 0, // matches @location(0) in the shader
              offset: 0, // this attribute starts at byte 0 of each vertex
              format: 'float32x3', // 3 × 32-bit floats = our (x, y, z)
            },
            {
              shaderLocation: 1, // matches @location(1) in the shader
              offset: 12, // this attribute starts at byte 12 of each vertex
              format: 'float32x2', // 2 × 32-bit floats = our (u, v)
            },
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{ format }],
    },
    primitive: {
      topology: 'triangle-list',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  });

  const uniformBindGroup = device.createBindGroup({
    label: 'mvp bind group',
    layout: pipeline.getBindGroupLayout(0), // the auto-inferred layout for @group(0)
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
        },
      },
      {
        binding: 1,
        resource: texture.createView(),
      },
      {
        binding: 2,
        resource: sampler,
      },
    ],
  });

  const hudCanvas = requireElement<HTMLCanvasElement>('#debug-hud');
  const hud = createHud(hudCanvas);

  startRenderLoop(
    device,
    context,
    pipeline,
    cubeVertexBuffer,
    cubeIndexBuffer,
    cubeIndexData.length,
    uniformBuffer,
    uniformBindGroup,
    depthTexture,
    hud
  );
  setStatus(`Pharos — clearing at ${format}, and drawing a cube.`);
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
