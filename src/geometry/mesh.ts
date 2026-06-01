// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

import { buildVertexBufferLayout } from '@/geometry/vertexLayout';
import type { VertexFormat } from '@/geometry/vertexFormats';
import { createGpuBufferWithData } from '@/gpu/buffers';

export class Mesh {
  public readonly vertexBufferLayout: GPUVertexBufferLayout;

  private readonly vertexBuffer: GPUBuffer;
  private readonly vertexCount: number;

  private readonly index?: {
    readonly buffer: GPUBuffer;
    readonly format: GPUIndexFormat;
    readonly count: number;
  };

  constructor({
    device,
    vertices,
    formats,
    indices,
  }: {
    device: GPUDevice;
    vertices: Float32Array<ArrayBuffer>;
    formats: VertexFormat[];
    indices?: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>;
  }) {
    this.vertexBufferLayout = buildVertexBufferLayout(formats);
    this.vertexBuffer = createGpuBufferWithData(device, vertices, GPUBufferUsage.VERTEX);
    this.vertexCount =
      vertices.length / (this.vertexBufferLayout.arrayStride / Float32Array.BYTES_PER_ELEMENT);

    if (indices) {
      this.index = {
        buffer: createGpuBufferWithData(device, indices, GPUBufferUsage.INDEX),
        format: indices instanceof Uint16Array ? 'uint16' : 'uint32',
        count: indices.length,
      };
    }
  }

  draw(pass: GPURenderPassEncoder): void {
    pass.setVertexBuffer(0, this.vertexBuffer);
    if (this.index) {
      pass.setIndexBuffer(this.index.buffer, this.index.format);
      pass.drawIndexed(this.index.count);
    } else {
      pass.draw(this.vertexCount);
    }
  }
}
