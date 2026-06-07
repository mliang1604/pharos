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
    bindGroupLayout,
  }: {
    device: GPUDevice;
    shader: Shader;
    vertexBufferLayouts: GPUVertexBufferLayout[];
    targets: GPUColorTargetState[];
    entries: Iterable<GPUBindGroupEntry>;
    depthStencil?: GPUDepthStencilState;
    primitive?: GPUPrimitiveState;
    label?: string;
    bindGroupLayout?: GPUBindGroupLayout;
  }) {
    const layout = bindGroupLayout
      ? device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] })
      : 'auto';

    this.pipeline = device.createRenderPipeline({
      ...(label && { label }),
      layout: layout,
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

    this.bindGroup = device.createBindGroup({
      label: `${label ?? 'material'} bind group`,
      layout: bindGroupLayout ?? this.pipeline.getBindGroupLayout(0),
      entries,
    });
  }

  bind(pass: GPURenderPassEncoder, dynamicOffsets?: number[]): void {
    pass.setPipeline(this.pipeline);
    /**
     * This is always bind group 0 because this cube example holds per-frame,
     * per-material, and per-object resources in the same bind group for simplicity.
     * In a later implementation, we will replace with proper bindGroups from bindGroups.ts.
     */
    pass.setBindGroup(0, this.bindGroup, dynamicOffsets);
  }
}
