// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

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

function startClearLoop(
  device: GPUDevice,
  context: GPUCanvasContext,
  pipeline: GPURenderPipeline,
  vertexBuffer: GPUBuffer
): void {
  const startTime = performance.now();

  function frame(): void {
    const elapsed = (performance.now() - startTime) / 1000;
    const r = 0.5 + 0.5 * Math.sin(elapsed * 0.7);
    const g = 0.5 + 0.5 * Math.sin(elapsed * 1.1 + 2.0);
    const b = 0.5 + 0.5 * Math.sin(elapsed * 1.3 + 4.0);

    const encoder = device.createCommandEncoder({ label: 'frame encoder' });
    const pass = encoder.beginRenderPass({
      label: 'clear pass',
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r, g, b, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

setStatus('Initializing WebGPU…');
const device = await initWebGpu();
if (device) {
  const context = canvas.getContext('webgpu');
  if (!context) {
    setStatus('Could not obtain a WebGPU canvas context.', 'error');
  } else {
    const format = navigator.gpu.getPreferredCanvasFormat();
    sizeCanvasToDisplay(canvas, device);
    context.configure({
      device,
      format,
      alphaMode: 'opaque',
    });

    // Vertex Data and Vertex Buffer
    // Write the buffer
    const vertexData = new Float32Array([
      0.0, 0.5, // top
      -0.5, -0.5, // bottom left
      0.5, -0.5, // bottom right 
    ]);
    const vertexBuffer = device.createBuffer({
      label: 'triangle vertices',
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertexData);

    const shaderModule = device.createShaderModule({
      label: 'triangle shaders',
      code: `
        @vertex
        fn vs_main(@location(0) position: vec2<f32>) -> @builtin(position) vec4<f32> {
          return vec4<f32>(position, 0.0, 1.0);
        }

        @fragment
        fn fs_main() -> @location(0) vec4<f32> {
          return vec4<f32>(1.0, 0.0, 0.0, 1.0);
        }
      `,
    });

    const pipeline = device.createRenderPipeline({
      label: 'triangle pipeline',
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 8, // 2 floats * 4 bytes per float
            attributes: [
              {
                shaderLocation: 0,           // matches @location(0) in the shader
                offset: 0,                   // this attribute starts at byte 0 of each vertex
                format: 'float32x2',         // 2 × 32-bit floats = our (x, y)
              }
            ],
          }
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
    });

    startClearLoop(device, context, pipeline, vertexBuffer);
    setStatus(`Pharos — clearing at ${format}, and drawing a triangle.`);
  }
}
