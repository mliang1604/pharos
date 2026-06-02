// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

import type { Shader } from '@/materials/shader';

export class Material {
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;

  constructor({
    device,
    shader,
    vertexBufferLayouts,
    targets,
    entries,
    depthStencil,
    primitive,
    label,
  }: {
    device: GPUDevice;
    shader: Shader;
    vertexBufferLayouts: GPUVertexBufferLayout[];
    targets: GPUColorTargetState[];
    entries: Iterable<GPUBindGroupEntry>;
    depthStencil?: GPUDepthStencilState;
    primitive?: GPUPrimitiveState;
    label?: string;
  }) {
    this.pipeline = device.createRenderPipeline({
      ...(label && { label }),
      layout: 'auto',
      vertex: {
        module: shader.shaderModule,
        entryPoint: shader.vertexEntryPoint,
        buffers: vertexBufferLayouts,
      },
      fragment: {
        module: shader.shaderModule,
        entryPoint: shader.fragmentEntryPoint,
        targets,
      },
      primitive: primitive ?? { topology: 'triangle-list' },
      ...(depthStencil && { depthStencil }),
    });

    const bindGroupLayout = this.pipeline.getBindGroupLayout(0);

    this.bindGroup = device.createBindGroup({
      label: `${label ?? 'material'} bind group`,
      layout: bindGroupLayout,
      entries,
    });
  }

  bind(pass: GPURenderPassEncoder): void {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
  }
}
