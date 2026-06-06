// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

import { vec3, type Vec3 } from '@/math';

/**
 * Convert orbit spherical coordinates to a cartesian offset from the orbit center.
 *
 * - `azimuth` swings around the vertical (Y) axis.
 * - `elevation` tilts above (+) / below (-) the horizontal plane.
 *
 * The result is the eye's offset *from its target*; add the target to it to get
 * the world-space eye position.
 */
export function sphericalToCartesian(radius: number, azimuth: number, elevation: number): Vec3 {
  return vec3.fromValues(
    radius * Math.cos(elevation) * Math.sin(azimuth),
    radius * Math.sin(elevation),
    radius * Math.cos(elevation) * Math.cos(azimuth)
  );
}
