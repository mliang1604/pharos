// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

/**
 * Binding group indices used for grouping GPU resources by frequency.
 *
 * - `PerFrame`: Resources that are updated once per frame (e.g., camera matrices, lighting).
 * - `PerMaterial`: Resources that are updated per material (e.g., material properties, textures).
 * - `PerObject`: Resources that are updated per object (e.g., model matrices).
 */
export const BindGroup = { PerFrame: 0, PerMaterial: 1, PerObject: 2 } as const;

/**
 * Type representing the valid bind group identifiers.
 */
export type BindGroup = (typeof BindGroup)[keyof typeof BindGroup];
