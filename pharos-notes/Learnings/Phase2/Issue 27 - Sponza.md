---
tags:
  - notes
phase: "2"
---
The through-line: **loading Sponza was #117's job; #27 was making the renderer draw a scene it wasn't built for.** A 50 MB atrium — 103 primitives, 25 materials, 69 textures — tripped two demo-renderer assumptions (one material per model; even-sized index buffers) that single-primitive assets had quietly satisfied all along.

## What we built

- `public/models/Sponza/` — the canonical Khronos asset vendored (`.gltf` + external `.bin` + 69 textures, ~50 MB).
- [src/main.ts](../../../src/main.ts) — **per-renderable materials** (a `Material[]` per model, bound per primitive); a `?scene=sponza` startup selector gating the showcase vs. the atrium; a Sponza camera preset.
- [src/gpu/buffers.ts](../../../src/gpu/buffers.ts) — a 4-byte write-alignment fix.
- [test/unit/assets/gltf.test.ts](../../../test/unit/assets/gltf.test.ts) (Sponza loads → 103 renderables, headless) + [test/unit/gpu/buffers.test.ts](../../../test/unit/gpu/buffers.test.ts) (the padding regression).

## Per-renderable materials

The demo built **one** `Material` from `renderables[0]` and bound it for every renderable — invisible as a bug while every model was a single primitive (Box, Duck, Helmet). Sponza's 103 primitives would all wear primitive 0's texture. The fix: build a `Material` per renderable (each with its own baseColor bind group) and bind `materials[i]` in the draw loop. The loader already emitted a per-renderable `PbrMaterial` back in #22 — the demo simply collapsed it. The real lesson: a renderer "works" only against the asset shapes you've fed it; a structurally richer asset is the test.

## The bug only a real asset finds

WebGPU requires every `writeBuffer` to write a multiple of 4 bytes. A `Uint16` index buffer with an **odd** count is `odd × 2 ≡ 2 (mod 4)` → rejected. Box/Duck/Helmet all had even counts; some Sponza primitive doesn't. Fix in `createGpuBufferWithData`: round the buffer up to a 4-byte multiple and write a zero-padded copy — `drawIndexed` reads only the real `count`, so the pad index is inert. A handful of curated assets had hidden an entire alignment-bug class.

## MVP aliasing — why one-per-model still holds

The draw loop writes one MVP buffer per model, once per renderable. That would alias (last-write-wins, since all `writeBuffer`s land before the command buffer runs) **if** a model's renderables had differing transforms. Sponza is a single node, so all 103 share one world matrix — the repeated write is idempotent. So #18's per-renderable-MVP treatment still isn't required: Sponza is safe by structure, not by accident. (The day a model has multiple nodes with their own transforms, this breaks.)

## Startup selector, and an orbit camera with no pan

`?scene=sponza` builds the atrium alone; anything else builds the showcase. Gating is one `isSponza` flag over the *drawn* content (the models array, cube `positions`, the KTX2 block). Known wart: the cube/showcase scaffolding still initializes in Sponza mode — fully fixing it means decomposing `initScene` into per-scene builders, deferred to [[#133]]. The camera taught its own lesson: `OrbitControls` orbits/zooms around a **fixed** target with no pan, so "move into the atrium" isn't a drag gesture — it's the preset's `target`, which only code can set. Sizing it needed the real bounds: the node scales by 0.008, putting the atrium at ~30 (X) × 12 (Y) × 18 (Z) world units.

## Scoping: what we deliberately didn't wire

The `AssetManager` (#24) stays **uncalled**. I'd expected #27 to be its payoff, but a single Sponza load shares no URLs — 69 distinct textures, one scene built once — so dedup has nothing to bite. It earns its keep when something loads the same URL twice: a live scene toggle that loads/unloads ([[#133]]), or instanced models. Deferred with a reason, not forgotten. Likewise the ~103 pipelines Sponza builds → caching deferred to [[#134]].

## What's next

- **#25 loading UX** — there's finally a genuinely slow load (50 MB, 103 pipelines) worth a progress bar.
- Follow-ups: live scene toggle ([[#133]]), pipeline caching ([[#134]]).
