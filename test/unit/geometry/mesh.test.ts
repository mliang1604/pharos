import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Mesh } from '@/geometry/mesh';

// GPUBufferUsage is a runtime global in browsers but absent in Node.
beforeAll(() => {
  globalThis.GPUBufferUsage = {
    COPY_DST: 0x08,
    INDEX: 0x10,
    VERTEX: 0x20,
  } as unknown as typeof GPUBufferUsage;
});

function createMockDevice() {
  const buffers: GPUBuffer[] = [];
  const device = {
    createBuffer: vi.fn((descriptor: GPUBufferDescriptor): GPUBuffer => {
      const buffer = { size: descriptor.size, usage: descriptor.usage } as unknown as GPUBuffer;
      buffers.push(buffer);
      return buffer;
    }),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
  return { device, buffers };
}

function createMockPass() {
  return {
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    draw: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Expected a buffer at index ${index}, but none was created`);
  }
  return item;
}

describe('Mesh', () => {
  it('derives the vertex buffer layout from the formats', () => {
    const { device } = createMockDevice();
    const mesh = new Mesh({
      device,
      vertices: new Float32Array(10),
      formats: ['float32x3', 'float32x2'],
    });
    expect(mesh.vertexBufferLayout.arrayStride).toBe(20);
  });

  it('non-indexed: creates one vertex buffer, binds it, and draws vertexCount', () => {
    const { device, buffers } = createMockDevice();
    const mesh = new Mesh({
      device,
      vertices: new Float32Array(10),
      formats: ['float32x3', 'float32x2'],
    });
    const pass = createMockPass();

    mesh.draw(pass);

    expect(buffers).toHaveLength(1);
    const vertexBuffer = nth(buffers, 0);
    expect(vertexBuffer.usage & GPUBufferUsage.VERTEX).toBeTruthy();
    expect(pass.setVertexBuffer).toHaveBeenCalledWith(0, vertexBuffer);
    expect(pass.draw).toHaveBeenCalledWith(2);
    expect(pass.setIndexBuffer).not.toHaveBeenCalled();
    expect(pass.drawIndexed).not.toHaveBeenCalled();
  });

  it('indexed (Uint16Array): creates an index buffer, binds it as uint16, and draws by index count', () => {
    const { device, buffers } = createMockDevice();
    const mesh = new Mesh({
      device,
      vertices: new Float32Array(20),
      formats: ['float32x3', 'float32x2'],
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    });
    const pass = createMockPass();

    mesh.draw(pass);

    expect(buffers).toHaveLength(2);
    const indexBuffer = nth(buffers, 1);
    expect(indexBuffer.usage & GPUBufferUsage.INDEX).toBeTruthy();
    expect(pass.setIndexBuffer).toHaveBeenCalledWith(indexBuffer, 'uint16');
    expect(pass.drawIndexed).toHaveBeenCalledWith(6);
    expect(pass.draw).not.toHaveBeenCalled();
  });

  it('indexed (Uint32Array): derives the uint32 index format from the array type', () => {
    const { device } = createMockDevice();
    const mesh = new Mesh({
      device,
      vertices: new Float32Array(20),
      formats: ['float32x3', 'float32x2'],
      indices: new Uint32Array([0, 1, 2]),
    });
    const pass = createMockPass();

    mesh.draw(pass);

    expect(pass.setIndexBuffer).toHaveBeenCalledWith(expect.anything(), 'uint32');
    expect(pass.drawIndexed).toHaveBeenCalledWith(3);
  });
});
