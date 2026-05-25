// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

const canvas = document.querySelector<HTMLCanvasElement>('#app');
const statusEl = document.querySelector<HTMLElement>('#status');

if (!canvas || !statusEl) {
  throw new Error('Expected #app canvas and #status element in index.html');
}

type StatusTone = 'info' | 'error';

function setStatus(message: string, tone: StatusTone = 'info'): void {
  statusEl!.textContent = message;
  statusEl!.dataset['tone'] = tone;
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

setStatus('Initializing WebGPU…');
const device = await initWebGpu();
if (device) {
  setStatus('Pharos — WebGPU device ready.');
}
