import { describe, it, expect, vi, beforeAll } from 'vitest';
import { UniformBuffer } from '@/gpu/uniformBuffer';

// GPUBufferUsage is a runtime global in browsers but absent in Node.
beforeAll(() => {
  globalThis.GPUBufferUsage = {
    UNIFORM: 0x40,
    COPY_DST: 0x08,
  } as unknown as typeof GPUBufferUsage;
});

function createMockDevice() {
  const writeBuffer = vi.fn();
  const device = {
    createBuffer: vi.fn(
      (descriptor: GPUBufferDescriptor): GPUBuffer =>
        ({ size: descriptor.size, usage: descriptor.usage }) as unknown as GPUBuffer
    ),
    queue: { writeBuffer },
  } as unknown as GPUDevice;
  return { device, writeBuffer };
}

describe('UniformBuffer', () => {
  it('creates a UNIFORM | COPY_DST buffer of the requested size', () => {
    const { device } = createMockDevice();
    const uniforms = new UniformBuffer(device, 64);

    expect(uniforms.buffer.size).toBe(64);
    expect(uniforms.buffer.usage & GPUBufferUsage.UNIFORM).toBeTruthy();
    expect(uniforms.buffer.usage & GPUBufferUsage.COPY_DST).toBeTruthy();
  });

  it('write forwards the data to the buffer at offset 0 by default', () => {
    const { device, writeBuffer } = createMockDevice();
    const uniforms = new UniformBuffer(device, 64);
    const data = new Float32Array(16);

    uniforms.write(data);

    expect(writeBuffer).toHaveBeenCalledWith(uniforms.buffer, 0, data);
  });

  it('write forwards a custom offset', () => {
    const { device, writeBuffer } = createMockDevice();
    const uniforms = new UniformBuffer(device, 64);
    const data = new Float32Array(4);

    uniforms.write(data, 16);

    expect(writeBuffer).toHaveBeenCalledWith(uniforms.buffer, 16, data);
  });
});
