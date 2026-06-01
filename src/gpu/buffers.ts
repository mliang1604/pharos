// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

export function createGpuBufferWithData(
  device: GPUDevice,
  data: GPUAllowSharedBufferSource,
  usage: GPUBufferUsageFlags,
  label?: string
): GPUBuffer {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usage | GPUBufferUsage.COPY_DST,
    ...(label !== undefined ? { label } : {}),
  });

  device.queue.writeBuffer(buffer, 0, data);

  return buffer;
}
