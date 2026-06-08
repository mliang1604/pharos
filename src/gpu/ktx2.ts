// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

import { Texture, type CompressedLevel } from '@/gpu/texture';
import { assetUrl } from '@/assets/assetUrl';

type Ktx2Target = {
  gpuFormat: GPUTextureFormat;
  basisFormat: 'BC7' | 'ETC2' | 'ASTC' | 'RGBA32';
};

export function selectKtx2Target(device: GPUDevice): Ktx2Target {
  if (device.features.has('texture-compression-bc')) {
    return { gpuFormat: 'bc7-rgba-unorm-srgb', basisFormat: 'BC7' };
  } else if (device.features.has('texture-compression-astc')) {
    return { gpuFormat: 'astc-4x4-unorm-srgb', basisFormat: 'ASTC' };
  } else if (device.features.has('texture-compression-etc2')) {
    return { gpuFormat: 'etc2-rgba8unorm-srgb', basisFormat: 'ETC2' };
  } else {
    return { gpuFormat: 'rgba8unorm-srgb', basisFormat: 'RGBA32' };
  }
}

// --- basis_transcoder.js (Emscripten module) — minimal typed surface --------
// Only the calls we make; the vendored module is otherwise untyped.
interface BasisKtx2File {
  isValid(): boolean;
  getWidth(): number;
  getHeight(): number;
  getLevels(): number;
  startTranscoding(): boolean;
  getImageTranscodedSizeInBytes(level: number, layer: number, face: number, format: number): number;
  transcodeImage(
    dst: Uint8Array,
    level: number,
    layer: number,
    face: number,
    format: number,
    getAlphaForOpaqueFormats: number,
    channel0: number,
    channel1: number
  ): boolean;
  close(): void;
  delete(): void;
}

interface BasisModule {
  initializeBasis(): void;
  KTX2File: new (data: Uint8Array) => BasisKtx2File;
}

type BasisFactory = (opts?: { locateFile?: (path: string) => string }) => Promise<BasisModule>;

declare global {
  interface Window {
    BASIS?: BasisFactory;
  }
}

// Our basisFormat tag → basisu transcoder_texture_format integer value. These
// enum values are stable across transcoder builds (see basisu_transcoder.h),
// so we hardcode them rather than reading an (unexposed) module enum.
const TRANSCODER_FORMAT: Record<Ktx2Target['basisFormat'], number> = {
  BC7: 6, // cTFBC7_RGBA
  ETC2: 1, // cTFETC2_RGBA
  ASTC: 10, // cTFASTC_4x4_RGBA
  RGBA32: 13, // cTFRGBA32
};

let basisModulePromise: Promise<BasisModule> | undefined;

// Inject + load a classic script, resolving once it's executed.
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load script ${src}`));
    document.head.appendChild(script);
  });
}

// Load + initialize the Basis transcoder WASM once, lazily.
function loadBasisModule(): Promise<BasisModule> {
  if (basisModulePromise === undefined) {
    basisModulePromise = (async () => {
      await loadScript(assetUrl('basis/basis_transcoder.js'));
      const factory = window.BASIS;
      if (factory === undefined) {
        throw new Error('basis_transcoder.js did not define the BASIS factory');
      }
      const module = await factory({
        locateFile: (path) => assetUrl(`basis/${path}`),
      });
      module.initializeBasis();
      return module;
    })();
  }
  return basisModulePromise;
}

// Transcode a Basis .ktx2 to a device-supported format and upload it.
export async function loadKtx2Texture(
  device: GPUDevice,
  bytes: ArrayBuffer,
  samplerDesc: GPUSamplerDescriptor
): Promise<Texture> {
  const target = selectKtx2Target(device);
  const module = await loadBasisModule();

  const file = new module.KTX2File(new Uint8Array(bytes));
  try {
    if (!file.isValid()) {
      throw new Error('KTX2 file is invalid');
    }
    if (!file.startTranscoding()) {
      throw new Error('KTX2 startTranscoding failed');
    }

    const width = file.getWidth();
    const height = file.getHeight();
    const formatValue = TRANSCODER_FORMAT[target.basisFormat];

    const levels: CompressedLevel[] = [];
    for (let level = 0; level < file.getLevels(); level++) {
      const size = file.getImageTranscodedSizeInBytes(level, 0, 0, formatValue);
      const data = new Uint8Array(size);
      if (!file.transcodeImage(data, level, 0, 0, formatValue, 0, -1, -1)) {
        throw new Error(`KTX2 transcodeImage failed at level ${level}`);
      }
      levels.push({
        data,
        width: Math.max(1, width >> level),
        height: Math.max(1, height >> level),
      });
    }

    return Texture.fromCompressed(device, { format: target.gpuFormat, levels }, samplerDesc);
  } finally {
    file.close();
    file.delete();
  }
}
