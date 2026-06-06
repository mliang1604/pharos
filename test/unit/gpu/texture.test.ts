import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Texture } from '@/gpu/texture';

// GPUTextureUsage is a runtime global in browsers but absent in Node.
beforeAll(() => {
  globalThis.GPUTextureUsage = {
    TEXTURE_BINDING: 0x04,
    COPY_DST: 0x08,
    RENDER_ATTACHMENT: 0x10,
  } as unknown as typeof GPUTextureUsage;
});

function mockImage(width: number, height: number, ok = true, status = 200): void {
  const blob = () => Promise.resolve({} as Blob);
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok, status, blob })) as unknown as typeof fetch;
  globalThis.createImageBitmap = vi.fn(() => Promise.resolve({ width, height, close() {} }));
}

function createMockDevice() {
  const pass = { setPipeline: vi.fn(), setBindGroup: vi.fn(), draw: vi.fn(), end: vi.fn() };
  const encoder = { beginRenderPass: vi.fn(() => pass), finish: vi.fn(() => ({})) };
  const createTexture = vi.fn((d: GPUTextureDescriptor) => ({
    ...d,
    createView: vi.fn(() => ({})),
  }));
  const createSampler = vi.fn((d: GPUSamplerDescriptor) => ({ ...d }));
  const copyExternalImageToTexture = vi.fn();
  const submit = vi.fn();
  const device = {
    createTexture,
    createSampler,
    createShaderModule: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: vi.fn(() => ({})) })),
    createBindGroup: vi.fn(() => ({})),
    createCommandEncoder: vi.fn(() => encoder),
    queue: { copyExternalImageToTexture, submit },
  } as unknown as GPUDevice;
  return {
    device,
    createTexture,
    createSampler,
    copyExternalImageToTexture,
    submit,
    encoder,
    pass,
  };
}

describe('Texture.load', () => {
  it('allocates a full mip chain (256×256 → 9 levels)', async () => {
    mockImage(256, 256);
    const { device, createTexture } = createMockDevice();

    await Texture.load(device, '/x.png');

    expect(createTexture.mock.calls[0]![0].mipLevelCount).toBe(9);
  });

  it('floors the mip count for non-power-of-two sizes (200×100 → 8 levels)', async () => {
    mockImage(200, 100);
    const { device, createTexture } = createMockDevice();

    await Texture.load(device, '/x.png');

    expect(createTexture.mock.calls[0]![0].mipLevelCount).toBe(8);
  });

  it('creates an sRGB texture usable as sampled source, copy target, and render attachment', async () => {
    mockImage(64, 64);
    const { device, createTexture } = createMockDevice();

    await Texture.load(device, '/x.png');

    const desc = createTexture.mock.calls[0]![0];
    expect(desc.format).toBe('rgba8unorm-srgb');
    expect(desc.usage & GPUTextureUsage.TEXTURE_BINDING).toBeTruthy();
    expect(desc.usage & GPUTextureUsage.COPY_DST).toBeTruthy();
    expect(desc.usage & GPUTextureUsage.RENDER_ATTACHMENT).toBeTruthy();
  });

  it('uploads the decoded bitmap to the texture', async () => {
    mockImage(64, 64);
    const { device, copyExternalImageToTexture } = createMockDevice();

    await Texture.load(device, '/x.png');

    expect(copyExternalImageToTexture).toHaveBeenCalledOnce();
    const copyArg = copyExternalImageToTexture.mock.calls[0]![0] as { source: ImageBitmap };
    expect(copyArg.source.width).toBe(64);
  });

  it('renders one downsample pass per generated mip level', async () => {
    mockImage(256, 256);
    const { device, encoder, pass, submit } = createMockDevice();

    await Texture.load(device, '/x.png');

    expect(encoder.beginRenderPass).toHaveBeenCalledTimes(8); // 9 levels − level 0
    expect(pass.draw).toHaveBeenCalledWith(3);
    expect(submit).toHaveBeenCalledOnce();
  });

  it('returns a sampler with mip filtering enabled', async () => {
    mockImage(64, 64);
    const { device } = createMockDevice();

    const texture = await Texture.load(device, '/x.png');

    expect((texture.sampler as unknown as GPUSamplerDescriptor).mipmapFilter).toBe('linear');
    expect(texture.texture).toBeDefined();
  });

  it('throws when the image cannot be fetched', async () => {
    mockImage(64, 64, false, 404);
    const { device } = createMockDevice();

    await expect(Texture.load(device, '/missing.png')).rejects.toThrow('404');
  });
});
