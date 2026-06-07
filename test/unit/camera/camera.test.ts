import { describe, it, expect } from 'vitest';
import { Camera } from '@/camera/camera';
import { mat4, vec3 } from '@/math';

function makeCamera(): Camera {
  return new Camera({
    position: vec3.fromValues(0, 0, 5),
    target: vec3.fromValues(0, 0, 0),
    up: vec3.fromValues(0, 1, 0),
    fieldOfView: Math.PI / 3,
    aspectRatio: 16 / 9,
    near: 0.1,
    far: 100,
  });
}

function rounded(m: Float32Array): number[] {
  return Array.from(m, (v) => Number(v.toFixed(5)));
}

function expectMatrix(actual: Float32Array, expected: Float32Array): void {
  expect(rounded(actual)).toEqual(rounded(expected));
}

describe('Camera', () => {
  it('projectionMatrix reflects the constructor parameters', () => {
    const camera = makeCamera();
    expectMatrix(camera.projectionMatrix, mat4.perspective(Math.PI / 3, 16 / 9, 0.1, 100));
  });

  it('viewMatrix looks from position to target (position is the eye, not an offset)', () => {
    const camera = makeCamera();
    expectMatrix(
      camera.viewMatrix,
      mat4.lookAt(vec3.fromValues(0, 0, 5), vec3.fromValues(0, 0, 0), vec3.fromValues(0, 1, 0))
    );
  });

  it('setView updates the view (derived on read, not stale)', () => {
    const camera = makeCamera();
    const eye = vec3.fromValues(3, 4, 0);
    const target = vec3.fromValues(0, 1, 0);
    camera.setView(eye, target);
    expectMatrix(camera.viewMatrix, mat4.lookAt(eye, target, vec3.fromValues(0, 1, 0)));
  });

  it('setView leaves up unchanged when omitted', () => {
    const camera = makeCamera();
    const eye = vec3.fromValues(1, 0, 0);
    const target = vec3.fromValues(0, 0, 0);
    camera.setView(eye, target);
    expectMatrix(camera.viewMatrix, mat4.lookAt(eye, target, vec3.fromValues(0, 1, 0)));
  });

  it('worldPosition returns the eye position', () => {
    const camera = makeCamera();
    expect(Array.from(camera.worldPosition)).toEqual([0, 0, 5]);
  });

  it('worldPosition reflects setView', () => {
    const camera = makeCamera();
    camera.setView(vec3.fromValues(3, 4, 0), vec3.fromValues(0, 1, 0));
    expect(Array.from(camera.worldPosition)).toEqual([3, 4, 0]);
  });

  it('setAspectRatio updates the projection (derived on read)', () => {
    const camera = makeCamera();
    camera.setAspectRatio(1);
    expectMatrix(camera.projectionMatrix, mat4.perspective(Math.PI / 3, 1, 0.1, 100));
  });
});
