// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

export function createGpuBufferWithData(
  device: GPUDevice,
  data: GPUAllowSharedBufferSource,
  usage: GPUBufferUsageFlags,
  label?: string
): GPUBuffer {
  // WebGPU requires buffer sizes / writes to be a multiple of 4 bytes. A
  // Uint16 index buffer with an odd count isn't, so round up and pad.
  const size = Math.ceil(data.byteLength / 4) * 4;
  const buffer = device.createBuffer({
    size: size,
    usage: usage | GPUBufferUsage.COPY_DST,
    ...(label !== undefined ? { label } : {}),
  });

  if (size === data.byteLength) {
    device.queue.writeBuffer(buffer, 0, data);
  } else {
    const src = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
    const padded = new Uint8Array(size);
    padded.set(src);
    device.queue.writeBuffer(buffer, 0, padded);
  }

  return buffer;
}
