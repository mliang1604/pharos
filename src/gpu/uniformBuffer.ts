// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

export class UniformBuffer {
  public readonly buffer: GPUBuffer;
  private readonly device: GPUDevice;

  constructor(device: GPUDevice, byteLength: number, label?: string) {
    this.device = device;
    this.buffer = device.createBuffer({
      ...(label && { label }),
      size: byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  write(data: GPUAllowSharedBufferSource, offset = 0): void {
    this.device.queue.writeBuffer(this.buffer, offset, data);
  }
}
