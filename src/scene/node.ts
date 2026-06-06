// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

import type { Vec3, Quat, Mat4 } from '@/math';
import { vec3, quat, mat4 } from '@/math';

export class Node {
  private _position: Vec3;
  private _rotation: Quat;
  private _scale: Vec3;

  private _parent: Node | null = null;
  private _children: Node[] = [];

  private _localMatrix: Mat4 = mat4.identity();
  private _worldMatrix: Mat4 = mat4.identity();

  private _localDirty: boolean = true;
  private _worldDirty: boolean = true;

  constructor(position: Vec3, rotation: Quat, scale: Vec3) {
    this._position = vec3.clone(position);
    this._rotation = quat.clone(rotation);
    this._scale = vec3.clone(scale);
  }

  get position(): Vec3 {
    return vec3.clone(this._position);
  }

  set position(newPosition: Vec3) {
    vec3.copy(newPosition, this._position);
    this.invalidateLocal();
  }

  get rotation(): Quat {
    return quat.clone(this._rotation);
  }

  set rotation(newRotation: Quat) {
    quat.copy(newRotation, this._rotation);
    this.invalidateLocal();
  }

  get scale(): Vec3 {
    return vec3.clone(this._scale);
  }

  set scale(newScale: Vec3) {
    vec3.copy(newScale, this._scale);
    this.invalidateLocal();
  }

  get parent(): Node | null {
    return this._parent;
  }

  get children(): readonly Node[] {
    return this._children;
  }

  /**
   * Get the world transform matrix for this node.
   *
   * The matrix is computed as parent's world matrix multiplied by this node's
   * local TRS matrix (T x R x S). Results are cached: the local matrix is
   * rebuilt if dirty, and the world matrix is only recomputed when marked
   * dirty. Child world matrices are invalidated when this node changes.
   *
   * @returns A Mat4 representing this node's live internal matrix (no clone).
   * Do not modify this matrix directly; if you need to change the transform,
   * use the position/rotation/scale properties instead.
   */
  getWorldMatrix(): Mat4 {
    if (this._localDirty) {
      this.rebuildLocalMatrix();
    }
    if (this._worldDirty) {
      if (!this._parent) {
        mat4.copy(this._localMatrix, this._worldMatrix);
      } else {
        mat4.multiply(this._parent.getWorldMatrix(), this._localMatrix, this._worldMatrix);
      }
      this._worldDirty = false;
    }
    return this._worldMatrix;
  }

  addChild(child: Node): void {
    child._parent?.removeChild(child);
    child._parent = this;
    this._children.push(child);
    child.invalidateWorld();
  }

  removeChild(child: Node): void {
    const index = this._children.indexOf(child);
    if (index === -1) {
      return;
    }
    this._children.splice(index, 1);
    child._parent = null;
    child.invalidateWorld();
  }

  private invalidateLocal(): void {
    this._localDirty = true;
    this.invalidateWorld();
  }

  private invalidateWorld(): void {
    if (this._worldDirty) {
      return;
    }
    this._worldDirty = true;
    for (const child of this._children) {
      child.invalidateWorld();
    }
  }

  // TRS -> local = T x R x S
  private rebuildLocalMatrix(): void {
    mat4.translation(this._position, this._localMatrix);
    mat4.multiply(this._localMatrix, mat4.fromQuat(this._rotation), this._localMatrix);
    mat4.multiply(this._localMatrix, mat4.scaling(this._scale), this._localMatrix);
    this._localDirty = false;
  }
}
