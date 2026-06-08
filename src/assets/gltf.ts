// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

import { Node } from '@/scene/node';
import { Mesh } from '@/geometry/mesh';
import type {
  GltfAccessorType,
  GltfComponentType,
  GltfJson,
  GltfNode,
  GltfPrimitive,
} from '@/assets/gltfTypes';
import type { VertexFormat } from '@/geometry/vertexFormats';
import { mat4, quat, vec3 } from '@/math';

export interface PbrMaterial {
  baseColor: [number, number, number, number];
  metallic: number;
  roughness: number;
}

export interface Renderable {
  node: Node;
  mesh: Mesh;
  material: PbrMaterial;
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

type TypedArray =
  | Int8Array<ArrayBuffer>
  | Uint8Array<ArrayBuffer>
  | Int16Array<ArrayBuffer>
  | Uint16Array<ArrayBuffer>
  | Uint32Array<ArrayBuffer>
  | Float32Array<ArrayBuffer>;

type TypedArrayConstructor = {
  new (buffer: ArrayBuffer, byteOffset?: number, length?: number): TypedArray;
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

const VERTEX_ATTRIBUTES = [
  { semantic: 'POSITION', format: 'float32x3', components: 3 },
  { semantic: 'NORMAL', format: 'float32x3', components: 3 },
  { semantic: 'TEXCOORD_0', format: 'float32x2', components: 2 },
] as const;

export async function loadGltf(device: GPUDevice, url: string): Promise<GltfScene> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to fetch ${url}: ${response.status}`);
  }
  const data = await response.arrayBuffer();
  const { json, bin } = parseGlb(data);
  return buildScene(device, json, bin);
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

export function buildVertexData(
  json: GltfJson,
  bin: ArrayBuffer,
  primitive: GltfPrimitive
): { vertices: Float32Array<ArrayBuffer>; formats: VertexFormat[] } {
  const attributes: { data: Float32Array; components: number; format: VertexFormat }[] = [];

  VERTEX_ATTRIBUTES.forEach((vertexAttribute) => {
    const accessorIndex = primitive.attributes[vertexAttribute.semantic];
    if (accessorIndex !== undefined) {
      const data = decodeAccessor(json, bin, accessorIndex);
      if (!(data instanceof Float32Array)) {
        throw new Error('non-float vertex attributes not yet supported');
      }
      const format = vertexAttribute.format;
      const components = vertexAttribute.components;
      const collection = { data, components, format };
      attributes.push(collection);
    }
  });

  if (attributes[0] === undefined) {
    throw new Error('no attributes can be identified for the vertex data');
  }

  // Construct vertices array by calculating vertexCount and stride
  const vertexCount = attributes[0].data.length / attributes[0].components;
  let stride = 0;
  attributes.forEach((attribute) => {
    stride += attribute.components;
  });
  const vertices = new Float32Array(vertexCount * stride);

  for (let v = 0; v < vertexCount; v++) {
    let attributeOffset = 0;

    for (const attribute of attributes) {
      const src = v * attribute.components;
      vertices.set(
        attribute.data.subarray(src, src + attribute.components),
        v * stride + attributeOffset
      );
      attributeOffset += attribute.components;
    }
  }

  return { vertices, formats: attributes.map((a) => a.format) };
}

export function buildNode(gltfNode: GltfNode): Node {
  let translation: Float32Array = vec3.fromValues(...(gltfNode.translation ?? [0, 0, 0]));
  let rotation: Float32Array = quat.fromValues(...(gltfNode.rotation ?? [0, 0, 0, 1]));
  let scale: Float32Array = vec3.fromValues(...(gltfNode.scale ?? [1, 1, 1]));

  if (gltfNode.matrix !== undefined) {
    translation = mat4.getTranslation(gltfNode.matrix);
    rotation = quat.fromMat(gltfNode.matrix);
    scale = mat4.getScaling(gltfNode.matrix);
  }

  return new Node(translation, rotation, scale);
}

export function buildMesh(
  device: GPUDevice,
  json: GltfJson,
  bin: ArrayBuffer,
  primitive: GltfPrimitive
): Mesh {
  const { vertices, formats } = buildVertexData(json, bin, primitive);
  let indices = undefined;
  if (primitive.indices !== undefined) {
    indices = decodeAccessor(json, bin, primitive.indices);
    if (!(indices instanceof Uint16Array || indices instanceof Uint32Array)) {
      throw new Error('index buffer must be u16 or u32');
    }
  }
  return new Mesh({ device, vertices, formats, ...(indices && { indices }) });
}

export function buildScene(device: GPUDevice, json: GltfJson, bin: ArrayBuffer): GltfScene {
  const nodes = json.nodes.map(buildNode);

  // Map child nodes
  json.nodes.forEach((gltfNode, i) => {
    gltfNode.children?.forEach((childIndex) => {
      const parent = nodes[i];
      const child = nodes[childIndex];
      if (parent === undefined || child === undefined) {
        return;
      }
      parent.addChild(child);
    });
  });

  // Build the roots
  const roots: Node[] = [];
  const sceneIndex = json.scene ?? 0;
  const rootIndices = json.scenes[sceneIndex]?.nodes ?? [];
  for (const idx of rootIndices) {
    const node = nodes[idx];
    if (node !== undefined) {
      roots.push(node);
    }
  }

  // Renderables
  const renderables: Renderable[] = [];
  json.nodes.forEach((gltfNode, i) => {
    if (gltfNode.mesh === undefined) {
      return;
    }
    const node = nodes[i];
    const mesh = json.meshes[gltfNode.mesh];
    if (node === undefined || mesh === undefined) {
      return;
    }
    for (const primitive of mesh.primitives) {
      renderables.push({
        node,
        mesh: buildMesh(device, json, bin, primitive),
        material: buildMaterial(json, primitive),
      });
    }
  });

  return { roots, renderables };
}

export function buildMaterial(json: GltfJson, primitive: GltfPrimitive): PbrMaterial {
  // get gltfMaterial
  let gltfMaterial = undefined;
  if (primitive.material !== undefined) {
    gltfMaterial = json.materials?.[primitive.material];
  }
  // get properties
  const pbr = gltfMaterial?.pbrMetallicRoughness;
  const baseColor = (pbr?.baseColorFactor ?? [1, 1, 1, 1]) as [number, number, number, number];
  const metallic = pbr?.metallicFactor ?? 1;
  const roughness = pbr?.roughnessFactor ?? 1;

  return { baseColor, metallic, roughness };
}
