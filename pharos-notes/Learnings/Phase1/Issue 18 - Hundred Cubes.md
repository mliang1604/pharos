---
tags:
  - notes
phase: "1"
---
A perf *sanity check* — render 100 cubes with unique transforms and confirm per-object updates don't tank the frame. The deliverable isn't the cubes; it's the **measurement** and the cost model behind it. The through-line: **a uniform buffer is a single slot, so feeding N objects N different values forces a real decision about where per-object data lives in GPU memory** — and that decision is the per-frame/per-object split (#13) finally becoming concrete.

## What we built

- [src/materials/shaders/cube.wgsl](../../../src/materials/shaders/cube.wgsl) — split the one `Uniforms` struct into `PerFrame` (binding 0) and `PerObject` (binding 1, model + normalMatrix); texture/sampler moved to 2/3.
- [src/materials/material.ts](../../../src/materials/material.ts) — *parameterized* (not hardcoded): an optional explicit `bindGroupLayout` (falls back to `'auto'`), and `bind()` now forwards dynamic offsets.
- [src/main.ts](../../../src/main.ts) — explicit bind-group layout with a dynamic per-object binding; two uniform buffers (per-frame 112 B; per-object `100 × 256`); a 100-cube grid; per-frame written once, per-object packed into one upload; a draw loop with per-cube dynamic offsets.
- [test/unit/materials/material.test.ts](../../../test/unit/materials/material.test.ts) — +2 tests (offset passthrough, explicit-layout path).

## The aliasing trap

The naive loop — `write(model_i); bind; draw` ×100 against one buffer — draws 100 cubes that are **identical and overlapping**, looking like one. Not because draws are skipped (all 100 run; the HUD reads 100), but because `write` is a queued op: by the time the submitted command buffer executes, all 100 writes have collapsed onto the **same buffer region**, so every draw reads the **last** value. **A uniform buffer is one mutable slot; you can't time-multiplex it within a submission.** To give N draws N values, each draw must read a **different region of memory**.

That also surfaces the data split: `viewProjection`/camera/light/material are identical across all cubes (**per-frame**); only `model`/`normalMatrix` differ (**per-object**). Send the shared block once; vary only the small per-object block per draw.

## Choosing the per-object strategy

Three ways to give each draw its own region:

| | How | Draw calls |
|---|---|---|
| A. Many buffers + bind groups | one per cube | 100 |
| **B. One buffer + dynamic offsets** | one bind group, per-draw offset | 100 |
| C. Storage buffer + instancing | one array, `instance_index` | **1** |

Picked **B** (no per-cube allocations). **C is the actual fix for the draw-call cost — but it *deletes the thing the sanity check measures*, so it's deferred to [#113](https://github.com/mliang1604/pharos/issues/113), to be measured against this baseline.**

## Dynamic offsets — the mechanics

Bind a buffer binding once, marked dynamic; pass a per-draw **offset** that shifts where it reads: `setBindGroup(0, bg, [i * ALIGN])`. Two bits of pre-knowledge:

- **Alignment:** offsets must be multiples of `device.limits.minUniformBufferOffsetAlignment` (**256 B** in practice). Per-object data is only 128 B (model + normalMatrix), but each slot is **padded to 256** so every offset lands on a boundary. (Read the limit from the device — don't hardcode 256.)
- **Explicit layout required:** `layout: 'auto'` never marks a binding dynamic, so a dynamic binding needs a hand-written `GPUBindGroupLayout` + pipeline layout — i.e. the #13 per-frame/per-object split made real.

## Design lesson: parameterize, don't hardcode

First attempt baked the cube's 4-binding scheme *into* the general `Material` — and the test suite immediately failed (5 red). That's the signal: **coupling a reusable abstraction to one use case breaks it.** The fix kept pipeline construction in `Material` (a fine place for it) but made the layout a **parameter** — omit it → `'auto'` (every existing material unaffected); pass one → explicit. The cube-specific layout (with `GPUShaderStage`, `hasDynamicOffset`) lives in `main.ts`, where it belongs. General class, specific caller.

## Two off-by-ones, two detection stories

Both render loops had `i <= positions.length`. The type checker caught **one** and not the other — instructively:

- **Pack loop** indexed `positions[i]`, so at `i = 100` it's `positions[100] === undefined`. Under this project's `noUncheckedIndexedAccess`, `positions[i]` is already `Vec3 | undefined`, so TS flagged it. Fix: `positions.forEach((position, i) => …)` — defined element + index, killing both the off-by-one and the `| undefined` (TS won't narrow `arr[i]` from a loop bound).
- **Draw loop** only used `i` for the offset, never indexing the array — so TS stayed silent. At `i = 100` it bound a dynamic offset of `100 × 256 = 25600` into a 25600-byte buffer → reads off the end → **WebGPU validation error at draw**, only at runtime.

Same bug; caught statically when it's an out-of-bounds **array access**, invisible to the type checker when it's an out-of-bounds **buffer offset**.

## The measurement

**100 cubes · 100 draw calls · ~10 ms · 100 FPS → passes.** Per-object updates + 100 draws don't tank the frame. Caveat that *is* the bottleneck note: 100 FPS / 10 ms is **vsync-capped** (≈100 Hz display), so the meter hides the true headroom — you can't see the real per-frame cost at this scale. The cost is **linear in draw calls** (100 × `setBindGroup`+`draw`, plus 100 redundant `setPipeline`s from `bind()`); to find the ceiling, uncap vsync or push to thousands. Instancing (#113) collapses it to one draw.

## What's next

- **Instancing (#113)** — the draw-call bottleneck this issue exists to flag.
- **Resize handling (#19)** — camera aspect + depth texture still fixed at construction.
