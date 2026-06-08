import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createGpuBufferWithData } from '@/gpu/buffers';

beforeAll(() => {
  globalThis.GPUBufferUsage = {
    INDEX: 0x10,
    VERTEX: 0x20,
    COPY_DST: 0x08,
  } as unknown as typeof GPUBufferUsage;
});

function createMockDevice() {
  const createBuffer = vi.fn((d: GPUBufferDescriptor) => ({ ...d }) as unknown as GPUBuffer);
  const writeBuffer = vi.fn();
  const device = { createBuffer, queue: { writeBuffer } } as unknown as GPUDevice;
  return { device, createBuffer, writeBuffer };
}

describe('createGpuBufferWithData', () => {
  it('writes 4-byte-aligned data straight through', () => {
    const { device, createBuffer, writeBuffer } = createMockDevice();
    const data = new Uint16Array([1, 2]); // 4 bytes — already aligned

    createGpuBufferWithData(device, data, GPUBufferUsage.INDEX);

    expect(createBuffer.mock.calls[0]![0].size).toBe(4);
    expect(writeBuffer).toHaveBeenCalledWith(expect.anything(), 0, data); // no copy
  });

  it('rounds up the size and pads when the byte length is not a multiple of 4', () => {
    const { device, createBuffer, writeBuffer } = createMockDevice();
    const data = new Uint16Array([1, 2, 3]); // 6 bytes — an odd u16 index count

    createGpuBufferWithData(device, data, GPUBufferUsage.INDEX);

    expect(createBuffer.mock.calls[0]![0].size).toBe(8); // 6 → 8
    const written = writeBuffer.mock.calls[0]![2] as Uint8Array;
    expect(written.byteLength).toBe(8); // padded copy, a multiple of 4
    expect([...new Uint16Array(written.buffer, 0, 3)]).toEqual([1, 2, 3]); // original data intact
  });

  it('ORs in COPY_DST so the buffer is writable', () => {
    const { device, createBuffer } = createMockDevice();

    createGpuBufferWithData(device, new Uint16Array([1, 2]), GPUBufferUsage.INDEX);

    const usage = createBuffer.mock.calls[0]![0].usage;
    expect(usage & GPUBufferUsage.INDEX).toBeTruthy();
    expect(usage & GPUBufferUsage.COPY_DST).toBeTruthy();
  });
});
