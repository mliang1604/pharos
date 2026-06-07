import { describe, it, expect } from 'vitest';
import { Node } from '@/scene/node';
import { mat4, quat, vec3, type Quat, type Vec3 } from '@/math';

function rounded(m: Float32Array): number[] {
  return Array.from(m, (v) => Number(v.toFixed(5)));
}

function expectMatrix(actual: Float32Array, expected: Float32Array): void {
  expect(rounded(actual)).toEqual(rounded(expected));
}

function makeNode(opts: { position?: Vec3; rotation?: Quat; scale?: Vec3 } = {}): Node {
  const { position, rotation, scale } = opts;
  return new Node(
    position ?? vec3.fromValues(0, 0, 0),
    rotation ?? quat.identity(),
    scale ?? vec3.fromValues(1, 1, 1)
  );
}

describe('Node', () => {
  describe('local transform', () => {
    it('world matrix of a root with only translation is a pure translation', () => {
      const node = makeNode({ position: vec3.fromValues(1, 2, 3) });
      expectMatrix(node.getWorldMatrix(), mat4.translation([1, 2, 3]));
    });

    it('composes the local transform as T × R × S', () => {
      const position = vec3.fromValues(1, 2, 3);
      const rotation = quat.fromAxisAngle([0, 1, 0], Math.PI / 2);
      const scale = vec3.fromValues(2, 3, 4);

      const expected = mat4.translation(position);
      mat4.multiply(expected, mat4.fromQuat(rotation), expected);
      mat4.multiply(expected, mat4.scaling(scale), expected);

      expectMatrix(makeNode({ position, rotation, scale }).getWorldMatrix(), expected);
    });
  });

  describe('hierarchy', () => {
    it("child world matrix is the parent's world times the child's local", () => {
      const parent = makeNode({ position: vec3.fromValues(5, 0, 0) });
      const child = makeNode({ position: vec3.fromValues(1, 2, 3) });
      parent.addChild(child);

      expectMatrix(child.getWorldMatrix(), mat4.translation([6, 2, 3]));
    });

    it('accumulates transforms down a multi-level chain', () => {
      const a = makeNode({ position: vec3.fromValues(1, 0, 0) });
      const b = makeNode({ position: vec3.fromValues(0, 2, 0) });
      const c = makeNode({ position: vec3.fromValues(0, 0, 3) });
      a.addChild(b);
      b.addChild(c);

      expectMatrix(c.getWorldMatrix(), mat4.translation([1, 2, 3]));
    });
  });

  describe('invalidation', () => {
    it('reflects a position change on the next getWorldMatrix', () => {
      const node = makeNode({ position: vec3.fromValues(1, 0, 0) });
      expectMatrix(node.getWorldMatrix(), mat4.translation([1, 0, 0]));

      node.position = vec3.fromValues(9, 0, 0);
      expectMatrix(node.getWorldMatrix(), mat4.translation([9, 0, 0]));
    });

    it('recomputes a previously-read child after its parent moves', () => {
      const parent = makeNode();
      const child = makeNode({ position: vec3.fromValues(1, 0, 0) });
      parent.addChild(child);
      expectMatrix(child.getWorldMatrix(), mat4.translation([1, 0, 0]));

      parent.position = vec3.fromValues(10, 0, 0);
      expectMatrix(child.getWorldMatrix(), mat4.translation([11, 0, 0]));
    });

    it('reflects a scale change on the next getWorldMatrix', () => {
      const node = makeNode();
      expectMatrix(node.getWorldMatrix(), mat4.identity());

      node.scale = vec3.fromValues(2, 2, 2);
      expectMatrix(node.getWorldMatrix(), mat4.scaling([2, 2, 2]));
    });
  });

  describe('parenting', () => {
    it('addChild wires up parent and children both ways', () => {
      const parent = makeNode();
      const child = makeNode();
      parent.addChild(child);

      expect(child.parent).toBe(parent);
      expect(parent.children).toContain(child);
    });

    it('addChild re-parents, detaching from the previous parent', () => {
      const oldParent = makeNode();
      const newParent = makeNode();
      const child = makeNode();
      oldParent.addChild(child);
      newParent.addChild(child);

      expect(child.parent).toBe(newParent);
      expect(oldParent.children).not.toContain(child);
      expect(newParent.children).toContain(child);
    });

    it('removeChild detaches the node and reverts its world matrix to local', () => {
      const parent = makeNode({ position: vec3.fromValues(5, 0, 0) });
      const child = makeNode({ position: vec3.fromValues(1, 0, 0) });
      parent.addChild(child);
      expectMatrix(child.getWorldMatrix(), mat4.translation([6, 0, 0]));

      parent.removeChild(child);

      expect(child.parent).toBeNull();
      expect(parent.children).not.toContain(child);
      expectMatrix(child.getWorldMatrix(), mat4.translation([1, 0, 0]));
    });

    it('addChild rejects parenting a node to itself', () => {
      const node = makeNode();
      expect(() => node.addChild(node)).toThrow(/cycle/);
    });

    it('addChild rejects parenting a node under one of its descendants', () => {
      const a = makeNode();
      const b = makeNode();
      const c = makeNode();
      a.addChild(b);
      b.addChild(c);

      expect(() => c.addChild(a)).toThrow(/cycle/); // a is an ancestor of c
    });

    it('a rejected addChild leaves the graph unchanged', () => {
      const a = makeNode();
      const b = makeNode();
      a.addChild(b);

      expect(() => b.addChild(a)).toThrow(/cycle/);

      expect(b.parent).toBe(a);
      expect(a.parent).toBeNull();
      expect(a.children).toContain(b);
      expect(b.children).not.toContain(a);
    });
  });

  describe('encapsulation', () => {
    it('position getter returns a copy that cannot mutate internal state', () => {
      const node = makeNode({ position: vec3.fromValues(1, 2, 3) });
      const leaked = node.position;
      leaked[0] = 99;

      expect(Array.from(node.position)).toEqual([1, 2, 3]);
    });

    it('mutating a constructor argument after construction does not affect the node', () => {
      const position = vec3.fromValues(1, 2, 3);
      const node = new Node(position, quat.identity(), vec3.fromValues(1, 1, 1));
      position[0] = 99;

      expectMatrix(node.getWorldMatrix(), mat4.translation([1, 2, 3]));
    });
  });
});
