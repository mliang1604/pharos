// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

export type VertexFormat = 'float32' | 'float32x2' | 'float32x3' | 'float32x4';

export const VERTEX_FORMAT_SIZE: Record<VertexFormat, number> = {
  float32: 4,
  float32x2: 8,
  float32x3: 12,
  float32x4: 16,
};
