# Project Structure

> Living reference for how Pharos source is organized. Last updated 2026-06-01
> (during Issue #11, "`Mesh` class with vertex/index buffer abstraction").
>
> Companion to [PLAN.md](../../PLAN.md), which lists *what* gets built and when;
> this document covers *where* it lives and *why*.

## Guiding principle: dependency direction over folder names

Folder names are cheap to change — a rename is a mechanical edit. What is
expensive to undo is **dependency direction**: engine code reaching back into
application code, or subsystems forming import cycles.

The arrow must always point one way:

```
app (main.ts) ──▶ engine subsystems ──▶ math / core primitives
```

- `main.ts` (the demo app + bootstrap) may import from any subsystem.
- Subsystems may import each other, but must avoid cycles.
- **No subsystem may import from `main.ts`.** The day one needs to, that is the
  signal the app/engine boundary wants formalizing (see "Deferred decisions").

Everything below serves keeping that arrow clean.

## Current decision: flat, fine-grained

As of Phase 1 we are **single-package and flat**: feature folders live directly
under `src/` (consistent with the existing `math/` and `debug/`). There is **no
`src/app/` wrapper and no monorepo yet** — `main.ts` remains both the bootstrap
and the demo scene. Subsystem code is pulled out of `main.ts` into feature
folders as each issue touches it.

Granularity is **fine-grained**: geometry, materials, camera, scene, renderer,
and gpu are separate folders rather than one `rendering/` bucket. This mirrors
how mature engines (three.js, Bevy) decompose, and stops any single folder from
becoming the next monolith.

## Folder map

Each folder is created when its first file is born — we do **not** scaffold
empty directories. The point of listing them up front is that every future file
already has an obvious, agreed home, so nothing needs moving later.

| Folder         | Responsibility                                          | First lands in   | Status   |
| -------------- | ------------------------------------------------------- | ---------------- | -------- |
| `src/math/`    | Vector/matrix chokepoint (wraps `wgpu-matrix`)          | Phase 1 / #10    | ✓ exists |
| `src/debug/`   | Dev overlays — HUD now; debug-draw, profiling later     | Phase 0          | ✓ exists |
| `src/gpu/`     | Adapter/device, canvas context, swap chain              | Phase 0          | planned  |
| `src/geometry/`| `Mesh`, vertex formats, vertex layouts                  | Phase 1 / #11    | planned  |
| `src/materials/`| `Material`, `Shader`, WGSL loading, bind-group constants| Phase 1          | planned  |
| `src/camera/`  | Perspective camera, orbit controls                      | Phase 1          | planned  |
| `src/scene/`   | Scene graph `Node` now; ECS components + systems later  | Phase 1 → 3      | planned  |
| `src/renderer/`| Render loop, forward renderer → render graph + passes   | Phase 0 → 6      | planned  |
| `src/assets/`  | glTF + KTX2 loaders, textures, `AssetManager`           | Phase 2          | planned  |
| `src/lighting/`| Lights, shadow maps, IBL                                | Phase 4          | planned  |
| `src/animation/`| Clips, playback, blending, skinning                    | Phase 5          | planned  |
| `src/physics/` | Rapier wrapper, `RigidBody` / `Collider`                | Phase 5          | planned  |
| `src/audio/`   | Web Audio wrapper, 3D positioning                       | Phase 7          | planned  |
| `src/input/`   | Keyboard/mouse/gamepad/touch, action mapping            | Phase 7          | planned  |
| `src/ui/`      | In-game UI / HUD widgets                                | Phase 7          | planned  |

Post-processing (Phase 6 — bloom, tone mapping, AA, SSAO) lives under
`src/renderer/` as passes, not a separate top-level folder, since it is part of
the render-graph story.

## Where today's `main.ts` pieces will move

`main.ts` is currently a monolith. As subsystems are extracted, its contents
redistribute roughly as:

| Current concern in `main.ts`            | Destination          |
| --------------------------------------- | -------------------- |
| Adapter/device request, canvas context  | `src/gpu/`           |
| Cube vertex/index buffers + layout      | `src/geometry/`      |
| Pipeline / shader setup                 | `src/materials/`     |
| Render loop, draw calls                 | `src/renderer/`      |
| "Spin a cube" scene wiring              | stays in `main.ts`   |

The residue left in `main.ts` is exactly the demo app: build the scene, wire
subsystems together, start the loop.

## Conventions

- **Path alias.** Import via `@/` (maps to `src/`), mirrored in both
  `tsconfig` and `vite.config`. Example:
  `import { VertexFormat } from '@/geometry/vertexFormats'`. Avoid `../../`
  chains.
- **Copyright header.** Every first-party file under `src/` starts with the
  SPDX header (see the `copyright-headers` convention and `src/math/index.ts`).
  Files under `test/` are **exempt** — no header on test files.
- **Tests.** Live in a top-level `test/` tree split into two lanes —
  `test/unit/` and `test/integration/` — each **mirroring `src/`** (e.g.
  `src/geometry/vertexLayout.ts` → `test/unit/geometry/vertexLayout.test.ts`).
  The path declares the kind, so unit vs integration is never ambiguous. Both
  keep `src/` as pure production code and import their subject through the `@/`
  alias rather than relative paths. Vitest runs them as separate projects (see
  `vite.config.ts`): `npm test` runs the **unit** lane (Node, mocked GPU,
  fast and CI-safe); `npm run test:integration` runs the **integration** lane
  (real GPU/browser — environment switched when the first one lands). `test/` is
  in `tsconfig` `include` so tests are type-checked too. Create `test/integration/`
  when its first test is born; don't scaffold it empty.
- **WGSL shaders.** Colocate with the owning subsystem
  (e.g. `src/materials/shaders/*.wgsl`, imported via Vite `?raw`), not a global
  shader dump. Shared chunks may live in `src/materials/common`.
- **Barrels (`index.ts`).** Only where a folder exposes a small, stable public
  API (as `src/math/` does). Avoid barrels in large or leaf folders — they
  invite import cycles and bundle bloat.
- **Shared constants.** Cross-cutting conventions get a named module rather than
  scattered literals — e.g. the bind-group strategy (group 0 = per-frame,
  1 = per-material, 2 = per-object) is encoded in `src/materials/bindGroups.ts`
  as the `BindGroup` constants. Group indices are a hard contract: they must match
  `@group(N)` in WGSL and `setBindGroup(N)` in code.

## Deferred decisions

These are intentionally *not* settled yet. Each has a clear trigger for when to
revisit, so deferring stays cheap:

- **App/engine split (`src/app/`).** Deferred. Revisit when a feature folder
  needs to import from `main.ts`, or when the Phase 8 editor / Phase 9 game
  needs to consume the engine as a distinct unit.
- **Monorepo (`packages/engine`, `packages/demo`, …).** Deferred. A clean
  dependency arrow now makes this a mechanical promotion later. Revisit if/when
  multiple apps (editor, reference game) need independent build/versioning.
- **ECS vs. ad-hoc nodes.** Decided in Phase 3 (PLAN.md). `src/scene/` is
  designed to host either without moving folders.
