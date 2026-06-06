// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

import type { Camera } from '@/camera/camera';
import { sphericalToCartesian } from '@/camera/spherical';
import { vec3, type Vec3 } from '@/math';

export class OrbitControls {
  private readonly camera: Camera;
  private readonly canvas: HTMLCanvasElement;
  private readonly rotateSpeed = 0.005;
  private readonly zoomSpeed = 0.1;

  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  private orbitState: { radius: number; azimuth: number; elevation: number; target: Vec3 };
  private clampConfig: {
    minRadius: number;
    maxRadius: number;
    maxElevation: number;
  };
  private invert: {
    X: boolean;
    Y: boolean;
  };

  constructor(
    camera: Camera,
    canvas: HTMLCanvasElement,
    {
      radius,
      azimuth,
      elevation,
      target,
    }: { radius: number; azimuth: number; elevation: number; target: Vec3 },
    {
      minRadius = 0.5,
      maxRadius = Infinity,
      maxElevation = (89 * Math.PI) / 180,
    }: { minRadius?: number; maxRadius?: number; maxElevation?: number },
    { invertX = false, invertY = false }: { invertX?: boolean; invertY?: boolean }
  ) {
    this.camera = camera;
    this.canvas = canvas;
    this.orbitState = { radius, azimuth, elevation, target };
    this.clampConfig = { minRadius, maxRadius, maxElevation };
    this.invert = { X: invertX, Y: invertY };

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });

    this.updateCamera();
  }

  private updateCamera(): void {
    const offset = sphericalToCartesian(
      this.orbitState.radius,
      this.orbitState.azimuth,
      this.orbitState.elevation
    );
    const position = vec3.add(offset, this.orbitState.target);
    this.camera.setView(position, this.orbitState.target);
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.canvas.setPointerCapture(event.pointerId);
    this.isDragging = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.isDragging) return;

    const deltaX = event.clientX - this.lastPointerX;
    const deltaY = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;

    const xDirection = this.invert.X ? 1 : -1;
    const yDirection = this.invert.Y ? -1 : 1;
    this.orbitState.azimuth += deltaX * this.rotateSpeed * xDirection;
    this.orbitState.elevation += deltaY * this.rotateSpeed * yDirection;

    this.orbitState.elevation = Math.max(
      -this.clampConfig.maxElevation,
      Math.min(this.clampConfig.maxElevation, this.orbitState.elevation)
    );

    this.updateCamera();
  };

  private onPointerUp = (_event: PointerEvent): void => {
    this.isDragging = false;
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.orbitState.radius *= 1 + Math.sign(event.deltaY) * this.zoomSpeed;
    this.orbitState.radius = Math.max(
      this.clampConfig.minRadius,
      Math.min(this.clampConfig.maxRadius, this.orbitState.radius)
    );
    this.updateCamera();
  };

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }
}
