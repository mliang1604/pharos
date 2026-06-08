import { describe, it, expect } from 'vitest';
import { selectKtx2Target } from '@/gpu/ktx2';

function deviceWith(features: string[]): GPUDevice {
  return { features: new Set(features) } as unknown as GPUDevice;
}

describe('selectKtx2Target', () => {
  it('picks BC7 when bc compression is available', () => {
    expect(selectKtx2Target(deviceWith(['texture-compression-bc']))).toEqual({
      gpuFormat: 'bc7-rgba-unorm-srgb',
      basisFormat: 'BC7',
    });
  });

  it('falls back to ASTC, then ETC2', () => {
    expect(selectKtx2Target(deviceWith(['texture-compression-astc'])).basisFormat).toBe('ASTC');
    expect(selectKtx2Target(deviceWith(['texture-compression-etc2'])).basisFormat).toBe('ETC2');
  });

  it('uses uncompressed RGBA32 when no compressed family is supported', () => {
    expect(selectKtx2Target(deviceWith([]))).toEqual({
      gpuFormat: 'rgba8unorm-srgb',
      basisFormat: 'RGBA32',
    });
  });

  it('prefers BC over ASTC/ETC2 when several are available', () => {
    const device = deviceWith([
      'texture-compression-bc',
      'texture-compression-astc',
      'texture-compression-etc2',
    ]);
    expect(selectKtx2Target(device).basisFormat).toBe('BC7');
  });
});
