// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

export interface GltfMaterial {
  name?: string;
  pbrMetallicRoughness?: {
    baseColorFactor?: number[];
    metallicFactor?: number;
    roughnessFactor?: number;
  };
}

export interface GltfJson {
  asset: { version: string };
  scene?: number; // index of the default scene
  scenes: GltfSceneDef[]; // each: { nodes?: number[] }   (root node indices)
  nodes: GltfNode[];
  meshes: GltfMesh[];
  materials?: GltfMaterial[];
  accessors: GltfAccessor[];
  bufferViews: GltfBufferView[];
  buffers: GltfBuffer[];
}

export interface GltfNode {
  name?: string;
  children?: number[];
  mesh?: number;
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}

export interface GltfMesh {
  name?: string;
  primitives: GltfPrimitive[];
}

export interface GltfPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number;
}

export type GltfAccessorType = 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT2' | 'MAT3' | 'MAT4';

/**
 * 5120 = BYTE
 * 5121 = UNSIGNED_BYTE
 * 5122 = SHORT
 * 5123 = UNSIGNED_SHORT
 * 5125 = UNSIGNED_INT
 * 5126 = FLOAT
 */
export type GltfComponentType = 5120 | 5121 | 5122 | 5123 | 5125 | 5126;

export interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: GltfComponentType;
  count: number;
  type: GltfAccessorType;
  normalized?: boolean;
}

export interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
  target?: number;
}

export interface GltfBuffer {
  uri?: string;
  byteLength: number;
}

export interface GltfSceneDef {
  name?: string;
  nodes?: number[];
}
