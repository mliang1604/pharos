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

function startClearLoop(device: GPUDevice, context: GPUCanvasContext): void {
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
    startClearLoop(device, context);
    setStatus(`Pharos — clearing at ${format}.`);
  }
}
