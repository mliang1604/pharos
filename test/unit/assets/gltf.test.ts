import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseGlb, decodeAccessor } from '@/assets/gltf';

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

// --- Tests ------------------------------------------------------------------
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
