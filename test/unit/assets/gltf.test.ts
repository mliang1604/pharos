import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  parseGlb,
  decodeAccessor,
  buildVertexData,
  buildNode,
  buildMaterial,
  buildScene,
  loadGltf,
  gltfSamplerToDescriptor,
} from '@/assets/gltf';
import type { GltfPrimitive } from '@/assets/gltfTypes';
import type { Texture } from '@/gpu/texture';

// --- Fixture plumbing -------------------------------------------------------
// Read a real .glb off disk as a standalone ArrayBuffer.
//
// Gotcha: fs.readFileSync returns a Node `Buffer`, which is a *view* into a
// larger shared pool — its `.buffer` may contain unrelated bytes before/after
// our file. Slicing by [byteOffset, byteOffset + byteLength) copies out exactly
// our file's bytes into a clean ArrayBuffer, which is what parseGlb expects.
function loadGlbFixture(relPathFromHere: string): ArrayBuffer {
  const absPath = fileURLToPath(new URL(relPathFromHere, import.meta.url));
  const buf = readFileSync(absPath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const boxGlb = loadGlbFixture('../../../public/models/Box.glb');
const duckGlb = loadGlbFixture('../../../public/models/Duck.glb');

// GPUBufferUsage is a runtime global in browsers but absent in Node; Mesh reads
// it when allocating vertex/index buffers. Values are arbitrary for the mock.
beforeAll(() => {
  globalThis.GPUBufferUsage = {
    VERTEX: 0x20,
    INDEX: 0x10,
    COPY_DST: 0x08,
  } as unknown as typeof GPUBufferUsage;
});

// Mesh only touches createBuffer + queue.writeBuffer; everything else is unused.
function createMockDevice(): GPUDevice {
  return {
    createBuffer: vi.fn(() => ({}) as GPUBuffer),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
}

// --- Tests ------------------------------------------------------------------
describe('gltf', () => {
  describe('parseGlb', () => {
    // Worked example showing the pattern: call parseGlb, destructure, assert.
    describe('on Box.glb', () => {
      it('returns a defined JSON manifest and a BIN buffer', () => {
        const { json, bin } = parseGlb(boxGlb);

        expect(json).toBeTypeOf('object');
        expect(bin.byteLength).toBeGreaterThan(0);
      });

      it('extracts the BIN chunk at its exact byte length (Box.glb → 648)', () => {
        const { bin } = parseGlb(boxGlb);
        expect(bin.byteLength).toBe(648);
      });

      it('parses the manifest so the box mesh is reachable (meshes.length === 1)', () => {
        const { json } = parseGlb(boxGlb);
        const manifest = json as { meshes: unknown[] };
        expect(manifest.meshes).toHaveLength(1);
      });
    });

    it('throws on bad magic', () => {
      const badMagic = new ArrayBuffer(12);
      new DataView(badMagic).setUint32(0, 0xdeadbeef, true);
      expect(() => parseGlb(badMagic)).toThrow('Data is not glTF version 2.0');
    });

    it('throws on bad version', () => {
      const badVersion = new ArrayBuffer(12);
      const dataView = new DataView(badVersion);
      dataView.setUint32(0, 0x46546c67, true);
      dataView.setUint32(4, 1, true);
      expect(() => parseGlb(badVersion)).toThrow('Data is not glTF version 2.0');
    });

    it('throws when a chunk overruns the end of the file', () => {
      const overrunData = new ArrayBuffer(20);
      const dataView = new DataView(overrunData);
      dataView.setUint32(0, 0x46546c67, true);
      dataView.setUint32(4, 2, true);
      dataView.setUint32(12, 9999, true);
      dataView.setUint32(16, 0x4e4f534a, true);
      expect(() => parseGlb(overrunData)).toThrow('glb chunk overruns the end of file.');
    });
  });

  describe('decodeAccessor', () => {
    describe('on Box.glb', () => {
      it('decodes POSITION (accessor 2) into 24 vec3 floats, all ±0.5', () => {
        const { json, bin } = parseGlb(boxGlb);
        const positions = decodeAccessor(json, bin, 2);
        expect(positions).instanceOf(Float32Array);
        expect(positions.length).toBe(72);
        expect([...positions].every((x) => Math.abs(x) === 0.5)).toBe(true);
      });

      it('decodes INDICES (accessor 0) into 36 integers, all < 24', () => {
        const { json, bin } = parseGlb(boxGlb);
        const indices = decodeAccessor(json, bin, 0);
        expect(indices).instanceOf(Uint16Array);
        expect(indices.length).toBe(36);
        expect([...indices].every((x) => x < 24)).toBe(true);
      });
    });
  });

  describe('buildVertexData', () => {
    describe('on Box.glb', () => {
      it('interleaves POSITION + NORMAL per vertex (24 × stride 6 = 144)', () => {
        // Arrange
        const { json, bin } = parseGlb(boxGlb);
        const primitive = json.meshes[0]?.primitives[0];
        if (primitive === undefined) {
          throw new Error('fixture has no primitive');
        }

        // Act
        const { vertices, formats } = buildVertexData(json, bin, primitive);
        const positions = decodeAccessor(json, bin, 2); // POSITION
        const normals = decodeAccessor(json, bin, 1); // NORMAL

        // Assert
        expect(vertices.length).toBe(144);
        expect(formats).toEqual(['float32x3', 'float32x3']);
        for (let v = 0; v < 24; v++) {
          expect([...vertices.slice(v * 6, v * 6 + 3)]).toEqual([
            ...positions.slice(v * 3, v * 3 + 3),
          ]);
          expect([...vertices.slice(v * 6 + 3, v * 6 + 6)]).toEqual([
            ...normals.slice(v * 3, v * 3 + 3),
          ]);
        }
      });
    });
  });

  describe('buildNode', () => {
    it('applies explicit TRS fields', () => {
      const node = buildNode({ translation: [1, 2, 3], scale: [2, 2, 2] });
      expect([...node.position]).toEqual([1, 2, 3]);
      expect([...node.scale]).toEqual([2, 2, 2]);
    });

    it('defaults to identity when TRS fields are absent', () => {
      const node = buildNode({});
      expect([...node.position]).toEqual([0, 0, 0]);
      expect([...node.rotation]).toEqual([0, 0, 0, 1]);
      expect([...node.scale]).toEqual([1, 1, 1]);
    });

    it('decomposes a matrix node into TRS (Box node 0)', () => {
      const { json } = parseGlb(boxGlb);
      const gltfNode = json.nodes[0];
      if (gltfNode === undefined) {
        throw new Error('fixture has no node 0');
      }
      const node = buildNode(gltfNode);
      // Box node 0 is a pure rotation (Y/Z swap): no translation, unit scale.
      expect([...node.position]).toEqual([0, 0, 0]);
      expect([...node.scale]).toEqual([1, 1, 1]);
    });
  });

  describe('buildScene', () => {
    describe('on Box.glb', () => {
      it('yields one root and one renderable, with the mesh node parented to the root', () => {
        const { json, bin } = parseGlb(boxGlb);
        const scene = buildScene(createMockDevice(), json, bin, []);

        expect(scene.roots).toHaveLength(1);
        expect(scene.renderables).toHaveLength(1);
        // Box: scene node 0 is the root; its child node 1 carries the mesh.
        expect(scene.renderables[0]?.node.parent).toBe(scene.roots[0]);
      });
    });
  });

  describe('buildMaterial', () => {
    it('reads Box baseColorFactor (red) + metallic, with default roughness', () => {
      const { json } = parseGlb(boxGlb);
      const primitive = json.meshes[0]?.primitives[0];
      if (primitive === undefined) {
        throw new Error('fixture has no primitive');
      }
      const mat = buildMaterial(json, primitive, []);

      expect(mat.baseColor[0]).toBeCloseTo(0.8); // baseColorFactor red channel
      expect(mat.baseColor.slice(1)).toEqual([0, 0, 1]); // g, b, a
      expect(mat.metallic).toBe(0); // metallicFactor: 0
      expect(mat.roughness).toBe(1); // unspecified → spec default
    });

    it('defaults unspecified factors (Duck has no baseColorFactor)', () => {
      const { json } = parseGlb(duckGlb);
      const primitive = json.meshes[0]?.primitives[0];
      if (primitive === undefined) {
        throw new Error('fixture has no primitive');
      }
      const mat = buildMaterial(json, primitive, []);

      expect(mat.baseColor).toEqual([1, 1, 1, 1]); // no baseColorFactor → white
      expect(mat.metallic).toBe(0); // Duck specifies metallicFactor: 0
      expect(mat.roughness).toBe(1); // default
    });

    it('uses the glTF default material when a primitive has none', () => {
      const { json } = parseGlb(boxGlb);
      const primitive: GltfPrimitive = { attributes: {} }; // no material index
      const mat = buildMaterial(json, primitive, []);

      // The spec default material: white, fully metallic, fully rough.
      expect(mat.baseColor).toEqual([1, 1, 1, 1]);
      expect(mat.metallic).toBe(1);
      expect(mat.roughness).toBe(1);
    });

    it('resolves baseColorTexture by index (Duck), leaves it unset when absent (Box)', () => {
      const fakeTexture = {} as Texture;
      const duck = parseGlb(duckGlb);
      const box = parseGlb(boxGlb);
      const duckPrim = duck.json.meshes[0]?.primitives[0];
      const boxPrim = box.json.meshes[0]?.primitives[0];
      if (duckPrim === undefined || boxPrim === undefined) {
        throw new Error('fixture has no primitive');
      }

      // Duck's material references baseColorTexture index 0 → resolves to textures[0].
      expect(buildMaterial(duck.json, duckPrim, [fakeTexture]).baseColorTexture).toBe(fakeTexture);
      // Box's material has no texture.
      expect(buildMaterial(box.json, boxPrim, [fakeTexture]).baseColorTexture).toBeUndefined();
    });
  });

  describe('gltfSamplerToDescriptor', () => {
    it('defaults sensibly when the sampler is absent', () => {
      const d = gltfSamplerToDescriptor(undefined);
      expect(d.addressModeU).toBe('repeat');
      expect(d.minFilter).toBe('linear');
      expect(d.mipmapFilter).toBe('linear');
    });

    it('defaults each field the sampler omits', () => {
      const d = gltfSamplerToDescriptor({});
      expect(d.magFilter).toBe('linear');
      expect(d.addressModeU).toBe('repeat');
      expect(d.addressModeV).toBe('repeat');
    });

    it('maps GL enums, splitting minFilter into min + mipmap', () => {
      const d = gltfSamplerToDescriptor({
        magFilter: 9728, // NEAREST
        minFilter: 9986, // NEAREST_MIPMAP_LINEAR → min nearest, mipmap linear
        wrapS: 33071, // CLAMP_TO_EDGE
        wrapT: 33648, // MIRRORED_REPEAT
      });
      expect(d.magFilter).toBe('nearest');
      expect(d.minFilter).toBe('nearest');
      expect(d.mipmapFilter).toBe('linear');
      expect(d.addressModeU).toBe('clamp-to-edge');
      expect(d.addressModeV).toBe('mirror-repeat');
    });
  });

  describe('loadGltf', () => {
    it('fetches, parses, and assembles the scene', async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(boxGlb) })
      ) as unknown as typeof fetch;

      const scene = await loadGltf(createMockDevice(), '/Box.glb');

      expect(scene.roots).toHaveLength(1);
      expect(scene.renderables).toHaveLength(1);
    });

    it('throws when the fetch fails', async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        })
      ) as unknown as typeof fetch;

      await expect(loadGltf(createMockDevice(), '/missing.glb')).rejects.toThrow('404');
    });
  });

  // A second, structurally different fixture — multiple/nested nodes, matrix
  // transforms, a 3-attribute mesh, ~2.4k verts / 12.6k indices — to prove the
  // loader isn't special-cased to Box.glb. (#119)
  describe('Duck.glb (second-fixture regression)', () => {
    it('assembles one nested renderable from a multi-node scene', () => {
      const { json, bin } = parseGlb(duckGlb);
      const scene = buildScene(createMockDevice(), json, bin, []);

      expect(scene.roots).toHaveLength(1);
      expect(scene.renderables).toHaveLength(1);
      // The mesh node is nested under the root (real hierarchy, not flat).
      expect(scene.renderables[0]?.node.parent).toBe(scene.roots[0]);
    });

    it('interleaves a 3-attribute mesh (POSITION + NORMAL + TEXCOORD_0)', () => {
      const { json, bin } = parseGlb(duckGlb);
      const primitive = json.meshes[0]?.primitives[0];
      if (primitive === undefined) {
        throw new Error('fixture has no primitive');
      }
      const { vertices, formats } = buildVertexData(json, bin, primitive);

      expect(formats).toEqual(['float32x3', 'float32x3', 'float32x2']);
      expect(vertices.length).toBe(2399 * 8); // 2399 verts × stride 8
    });

    it('decodes the u16 index buffer (12636 indices)', () => {
      const { json, bin } = parseGlb(duckGlb);
      const primitive = json.meshes[0]?.primitives[0];
      if (primitive === undefined || primitive.indices === undefined) {
        throw new Error('fixture has no indices');
      }
      const indices = decodeAccessor(json, bin, primitive.indices);

      expect(indices).toBeInstanceOf(Uint16Array);
      expect(indices.length).toBe(12636);
    });
  });
});
