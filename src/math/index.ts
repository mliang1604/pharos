// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

// Pharos math chokepoint.
//
// This is the ONLY module under src/ allowed to import `wgpu-matrix` — the rule
// is enforced by `@typescript-eslint/no-restricted-imports` in eslint.config.js.
// Everything else imports vectors and matrices from `@/math`, so the backing
// library lives behind a single file and stays swappable (see issue #10).
//
// We standardized on wgpu-matrix because it defaults to WebGPU's [0, 1] clip
// space depth range — no OpenGL-style `perspectiveZO` footguns.

// Runtime namespaces (Float32Array-backed by default).
export { vec2, vec3, vec4, mat3, mat4, quat, utils } from 'wgpu-matrix';

// Concrete value types.
export type { Vec2, Vec3, Vec4, Mat3, Mat4, Quat } from 'wgpu-matrix';

// Argument types accept any vector/matrix-like (Float32Array, number[], …) —
// use these for parameters that shouldn't force a concrete backing array.
export type {
  Vec2Arg,
  Vec3Arg,
  Vec4Arg,
  Mat3Arg,
  Mat4Arg,
  QuatArg,
  RotationOrder,
} from 'wgpu-matrix';
