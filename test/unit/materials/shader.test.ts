import { describe, it, expect, vi } from 'vitest';
import { Shader } from '@/materials/shader';

function createMockDevice() {
  const shaderModule = {} as GPUShaderModule;
  const createShaderModule = vi.fn((): GPUShaderModule => shaderModule);
  const device = { createShaderModule } as unknown as GPUDevice;
  return { device, createShaderModule, shaderModule };
}

describe('Shader', () => {
  it('compiles the module from the given code and exposes it', () => {
    const { device, createShaderModule, shaderModule } = createMockDevice();
    const shader = new Shader({ device, code: 'WGSL' });

    expect(createShaderModule).toHaveBeenCalledWith({ code: 'WGSL' });
    expect(shader.shaderModule).toBe(shaderModule);
  });

  it('defaults the entry points to vs_main / fs_main', () => {
    const { device } = createMockDevice();
    const shader = new Shader({ device, code: 'WGSL' });

    expect(shader.vertexEntryPoint).toBe('vs_main');
    expect(shader.fragmentEntryPoint).toBe('fs_main');
  });

  it('allows overriding the entry points', () => {
    const { device } = createMockDevice();
    const shader = new Shader({
      device,
      code: 'WGSL',
      vertexEntryPoint: 'vertexMain',
      fragmentEntryPoint: 'fragmentMain',
    });

    expect(shader.vertexEntryPoint).toBe('vertexMain');
    expect(shader.fragmentEntryPoint).toBe('fragmentMain');
  });

  it('forwards the label only when provided', () => {
    const { device, createShaderModule } = createMockDevice();

    new Shader({ device, code: 'WGSL', label: 'cube shader' });
    expect(createShaderModule).toHaveBeenLastCalledWith({ code: 'WGSL', label: 'cube shader' });

    new Shader({ device, code: 'WGSL' });
    expect(createShaderModule).toHaveBeenLastCalledWith({ code: 'WGSL' });
  });
});
