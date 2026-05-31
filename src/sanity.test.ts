// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

// Smoke test that proves the Vitest wiring is alive. Real subsystem coverage
// (math primitives, ECS, glTF, serialization, render graph) lands with each
// subsystem's own issue — this file just verifies the test runner works.
describe('test harness', () => {
  it('runs and evaluates assertions', () => {
    expect(1 + 1).toBe(2);
  });
});
