// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

import type { Mat4, Vec3 } from '@/math';
import { mat4, vec3 } from '@/math';

export class Camera {
  private position: Vec3;
  private target: Vec3;
  private up: Vec3;
  private aspectRatio: number;
  private fieldOfView: number;
  private near: number;
  private far: number;

  constructor({
    position,
    target,
    up = vec3.fromValues(0, 1, 0),
    fieldOfView,
    aspectRatio,
    near,
    far,
  }: {
    position: Vec3;
    target: Vec3;
    up: Vec3;
    fieldOfView: number;
    aspectRatio: number;
    near: number;
    far: number;
  }) {
    this.position = position;
    this.target = target;
    this.up = up;
    this.aspectRatio = aspectRatio;
    this.fieldOfView = fieldOfView;
    this.near = near;
    this.far = far;
  }

  get projectionMatrix(): Mat4 {
    return mat4.perspective(this.fieldOfView, this.aspectRatio, this.near, this.far);
  }

  get viewMatrix(): Mat4 {
    return mat4.lookAt(this.position, this.target, this.up);
  }
  get worldPosition(): Vec3 {
    return this.position;
  }

  setView(position: Vec3, target: Vec3, up?: Vec3): void {
    this.position = position;
    this.target = target;
    if (up) {
      this.up = up;
    }
  }
}
