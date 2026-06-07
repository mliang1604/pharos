// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

import type { Node } from '@/scene/node';
import type { Mesh } from '@/geometry/mesh';
import type { GltfAccessorType, GltfComponentType, GltfJson } from '@/assets/gltfTypes';

export interface Renderable {
  node: Node;
  mesh: Mesh;
}

export interface GltfScene {
  roots: Node[];
  renderables: Renderable[];
}

const COMPONENT_COUNT: Record<GltfAccessorType, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

type TypedArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array | Float32Array;
type TypedArrayConstructor = {
  new (buffer: ArrayBufferLike, byteOffset?: number, length?: number): TypedArray;
  readonly BYTES_PER_ELEMENT: number;
};

const CONSTRUCTOR_BY_TYPE: Record<GltfComponentType, TypedArrayConstructor> = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};

export async function loadGltf(device: GPUDevice, url: string): Promise<GltfScene> {
  throw new Error('Not implemented');
}

export function parseGlb(data: ArrayBuffer): { json: GltfJson; bin: ArrayBuffer } {
  const dataView = new DataView(data);
  const magic = dataView.getUint32(0, true);
  const version = dataView.getUint32(4, true);

  if (magic !== 0x46546c67 || version !== 2) {
    throw new Error('Data is not glTF version 2.0');
  }

  const CHUNK_TYPE_JSON = 0x4e4f534a; // "JSON"
  const CHUNK_TYPE_BIN = 0x004e4942; // "BIN\0"

  let json: GltfJson | undefined;
  let bin: ArrayBuffer | undefined;

  let offset = 12; // header offset
  while (offset < data.byteLength) {
    const chunkLength = dataView.getUint32(offset, true);
    const chunkType = dataView.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;

    // Check for overrun
    if (chunkEnd > data.byteLength) {
      throw new Error('glb chunk overruns the end of file.');
    }

    // Handling for JSON
    if (chunkType === CHUNK_TYPE_JSON) {
      const decodedString = new TextDecoder().decode(data.slice(chunkStart, chunkEnd));
      json = JSON.parse(decodedString) as GltfJson;
    }

    // Handling for BIN blob
    else if (chunkType === CHUNK_TYPE_BIN) {
      bin = data.slice(chunkStart, chunkEnd);
    }
    // else: Unknown chunk type. Skip it

    offset = chunkEnd;
  }

  // Sanity checks for defined output
  if (json === undefined) {
    throw new Error('glb is missing its required JSON chunk.');
  }
  if (bin === undefined) {
    throw new Error('glb is missing its required BIN chunk.');
  }

  return { json, bin };
}

export function decodeAccessor(
  json: GltfJson,
  bin: ArrayBuffer,
  accessorIndex: number
): TypedArray {
  // Acquire needed fields and guard
  const accessor = json.accessors[accessorIndex];
  if (accessor === undefined) {
    throw new Error(`Accessor at index ${accessorIndex} is undefined.`);
  }

  const bufferViewIndex = accessor.bufferView;
  if (bufferViewIndex === undefined) {
    throw new Error(`Accessor at index ${accessorIndex} has no buffer view index.`);
  }

  const view = json.bufferViews[bufferViewIndex];
  if (view === undefined) {
    throw new Error(`Buffer view at index ${bufferViewIndex} is undefined.`);
  }

  // Compute the read
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const componentCount = COMPONENT_COUNT[accessor.type];
  const Ctor = CONSTRUCTOR_BY_TYPE[accessor.componentType];
  const length = accessor.count * componentCount;

  // Stride guard for interleaved views
  const elementByteSize = componentCount * Ctor.BYTES_PER_ELEMENT;
  if (view.byteStride !== undefined && view.byteStride !== elementByteSize) {
    throw new Error('Interleaved buffer views are not yet supported.');
  }

  return new Ctor(bin, start, length);
}
