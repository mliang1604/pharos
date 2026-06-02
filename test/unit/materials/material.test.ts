import { describe, it, expect, vi } from 'vitest';
import { Material } from '@/materials/material';
import type { Shader } from '@/materials/shader';

const vertexBufferLayouts: GPUVertexBufferLayout[] = [{ arrayStride: 20, attributes: [] }];
const targets: GPUColorTargetState[] = [{ format: 'bgra8unorm' }];
const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: {} as GPUBindingResource }];

function createMockShader(): Shader {
  return {
    shaderModule: {} as GPUShaderModule,
    vertexEntryPoint: 'vs_main',
    fragmentEntryPoint: 'fs_main',
  };
}

function createMockDevice() {
  const bindGroupLayout = {} as GPUBindGroupLayout;
  const pipeline = {
    getBindGroupLayout: vi.fn((): GPUBindGroupLayout => bindGroupLayout),
  } as unknown as GPURenderPipeline;
  const bindGroup = {} as GPUBindGroup;

  const createRenderPipeline = vi.fn((): GPURenderPipeline => pipeline);
  const createBindGroup = vi.fn((): GPUBindGroup => bindGroup);
  const device = { createRenderPipeline, createBindGroup } as unknown as GPUDevice;

  return { device, createRenderPipeline, createBindGroup, pipeline, bindGroup, bindGroupLayout };
}

function createMockPass() {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

describe('Material', () => {
  it('builds an auto-layout pipeline from the shader, vertex layouts, and targets', () => {
    const { device, createRenderPipeline } = createMockDevice();
    const shader = createMockShader();

    new Material({ device, shader, vertexBufferLayouts, targets, entries });

    expect(createRenderPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        layout: 'auto',
        vertex: {
          module: shader.shaderModule,
          entryPoint: 'vs_main',
          buffers: vertexBufferLayouts,
        },
        fragment: {
          module: shader.shaderModule,
          entryPoint: 'fs_main',
          targets,
        },
      })
    );
  });

  it('defaults the primitive topology to triangle-list', () => {
    const { device, createRenderPipeline } = createMockDevice();

    new Material({ device, shader: createMockShader(), vertexBufferLayouts, targets, entries });

    expect(createRenderPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ primitive: { topology: 'triangle-list' } })
    );
  });

  it('passes a caller-supplied primitive and depthStencil through', () => {
    const { device, createRenderPipeline } = createMockDevice();
    const primitive: GPUPrimitiveState = { topology: 'line-list' };
    const depthStencil: GPUDepthStencilState = {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    };

    new Material({
      device,
      shader: createMockShader(),
      vertexBufferLayouts,
      targets,
      entries,
      primitive,
      depthStencil,
    });

    expect(createRenderPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ primitive, depthStencil })
    );
  });

  it('derives the bind group from the pipeline-introspected group-0 layout', () => {
    const { device, createBindGroup, pipeline, bindGroupLayout } = createMockDevice();

    new Material({ device, shader: createMockShader(), vertexBufferLayouts, targets, entries });

    expect(pipeline.getBindGroupLayout).toHaveBeenCalledWith(0);
    expect(createBindGroup).toHaveBeenCalledWith(
      expect.objectContaining({ layout: bindGroupLayout, entries })
    );
  });

  it('bind sets the pipeline and the group-0 bind group on the pass', () => {
    const { device, pipeline, bindGroup } = createMockDevice();
    const material = new Material({
      device,
      shader: createMockShader(),
      vertexBufferLayouts,
      targets,
      entries,
    });
    const pass = createMockPass();

    material.bind(pass);

    expect(pass.setPipeline).toHaveBeenCalledWith(pipeline);
    expect(pass.setBindGroup).toHaveBeenCalledWith(0, bindGroup);
  });
});
