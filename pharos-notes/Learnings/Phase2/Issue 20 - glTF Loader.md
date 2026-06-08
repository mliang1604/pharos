---
tags:
  - notes
phase: "2"
---
Load a real 3D model instead of hand-typed geometry. The through-line: **a loader is a *translation across a boundary*.** glTF stores data the way authoring tools like it — de-interleaved arrays, indirection everywhere, matrix *or* TRS. The engine wants it the way GPUs like it — one interleaved buffer, a transform tree. The loader's whole job is to convert one into the other, and the discipline that makes it clean is that **the engine never learns what glTF is** — glTF-shaped data stops at the loader.

This was also a long lesson in **`tsc` clean ≠ correct**: nearly every step compiled green while still being wrong, because the bugs were logic the compiler can't see (loop bounds, `forEach` element-vs-index, a dropped branch, `0` being falsy).

## What we built

- [src/assets/gltf.ts](../../../src/assets/gltf.ts) — the loader: `parseGlb`, `decodeAccessor`, `buildVertexData`, `buildNode`, `buildMesh`, `buildScene`, and the async `loadGltf`, behind a `GltfScene` / `Renderable` importer boundary.
- [src/assets/gltfTypes.ts](../../../src/assets/gltfTypes.ts) — a typed model of the glTF JSON manifest (the subset #20 needs).
- [src/materials/shaders/normals.wgsl](../../../src/materials/shaders/normals.wgsl) — a minimal unlit material (position + normal → color) to render the box, which has no UVs.
- [src/main.ts](../../../src/main.ts) — loads `Box.glb` and draws it alongside the cubes.
- [src/materials/material.ts](../../../src/materials/material.ts) — `bind()` fix (see "the latent bug" below).
- [test/unit/assets/gltf.test.ts](../../../test/unit/assets/gltf.test.ts) — unit tests against a real `Box.glb` fixture.
- `public/models/Box.glb` — the Khronos test asset.

## The shape of glTF: indirection

Almost nothing in glTF holds its own data — everything is an *index into a flat array*. To read a triangle's positions you walk a ladder: `mesh → primitive → accessor → bufferView → buffer`. Each rung is one translation step, and the loader is that walk made concrete:

| rung | says | we do |
|---|---|---|
| node | "I draw mesh N" (or carry TRS/children) | → a `Node` |
| primitive | "positions in accessor A, indices in accessor B" | → a `Mesh` |
| accessor | "C items, each a VEC3 of FLOAT, in bufferView V" | → a typed array |
| bufferView | "bytes X..Y of buffer Z" | → a byte window |
| buffer | the raw bytes (or, in `.glb`, the BIN chunk) | → the numbers |

## The importer boundary: two views, not one

`loadGltf` returns `GltfScene { roots: Node[]; renderables: Renderable[] }`. These are **two views of the same data**:
- `roots` is the **transform hierarchy** — *every* top-level node, including ones with no geometry (group/pivot/camera nodes). It's a tree.
- `renderables` is the **flat draw list** — only the `{ node, mesh }` pairs that actually draw, computed once so the render loop never walks the tree.

Modeling them separately (rather than `Node.mesh`) keeps `Node` a pure transform and maps cleanly onto Phase 3's `MeshRenderer` component. Decision deferred from instinct to reasoning: a car node (no mesh) with four wheel children → `roots.length === 1`, `renderables.length === 4`.

## The `.glb` container

A `.glb` is a 12-byte header (`magic`, `version`, `length`) then a sequence of `[u32 length][u32 type][data]` chunks — a JSON chunk and a BIN chunk. Lessons:
- **Read integers with `DataView`, not `Uint32Array`** — `DataView` lets you state endianness explicitly (`.glb` is little-endian), and doesn't require 4-byte alignment. `Uint32Array` reads in *host* endianness. The header check failed silently until `getUint32(0, true)`.
- **Drive traversal by the format's length fields** — a cursor advancing `8 + chunkLength`, capturing chunks *by type*, not by position. Robust to extra chunks.
- **Fail loud at the door** — bad magic/version/overrun throw immediately, turning "garbage 200 lines later" into "this isn't a glTF 2.0 file."

## Typing the manifest

Modeled `GltfJson` and friends as `interface`s for object shapes, `type` aliases for the literal unions (`'SCALAR' | 'VEC2' | …`, `5120 | … | 5126`). Decisions that recur:
- **Optional vs required mirrors the *format*, not our expectations.** `accessor.bufferView?` is optional because the spec allows it; we don't support its absence, so the *runtime* throws — the type stays honest, the guard enforces our subset.
- **Literal unions buy exhaustiveness.** A `Record<GltfAccessorType, number>` forces every case at compile time (delete a key → `tsc` errors). `string`/`number` would let typos through.
- **Model only what you read.** Dropped `min`/`max` — no consumer needed them.
- **The meta-lesson:** `tsc` enforces your model, it does **not** check your model against reality. Three modeling bugs (`scale` typed `number` and required, an empty `GltfSceneDef`, a `number[]` vs `number` mix-up) compiled clean because they were *valid TypeScript that was wrong about glTF*.

## Decoding accessors

`decodeAccessor` walks accessor → bufferView → buffer and returns a typed array. Two traps:
- **Alignment, solved for free by `slice`.** `new Float32Array(buf, start, …)` throws unless `start` is a multiple of 4. glTF guarantees alignment *relative to the buffer start*; because `parseGlb` `slice`s the BIN into a fresh `ArrayBuffer` re-based to byte 0, the guarantee carries over. A decision made for *simplicity* (independent copy) also bought *correctness*.
- **Interleaved source data** — a `byteStride` larger than one element means gaps; a contiguous read would slurp neighbors. We **fail loud** and defer (the box is tightly packed, so it passes).
- **The typed-array constructor union** — mapping `componentType → Int8Array | … | Float32Array` needs a constructor type. Reaching for `any` throws away the whole typed pipeline; instead declare the *slice of the constructor we use* (`new (buffer, offset?, length?) => TypedArray` + `BYTES_PER_ELEMENT`).

## `ArrayBufferLike` vs `ArrayBuffer` (the saga)

In this TS/lib version, a **bare `Float32Array` means `Float32Array<ArrayBufferLike>`** — which includes `SharedArrayBuffer` and is *not* assignable to the `<ArrayBuffer>` that `Mesh` (and the GPU write API) want. The fix always goes at the **producer**: annotate `<ArrayBuffer>` on `decodeAccessor`'s union, `buildVertexData`'s return, and write matrices into a pre-allocated `Float32Array(16)` (wgpu-matrix's `Mat4` is `<ArrayBufferLike>`). Tighten the type where the data is *made*, not where it's consumed.

## Interleaving

glTF gives `[all positions][all normals]` (de-interleaved); `Mesh` wants `[P N | P N | …]` (interleaved). `buildVertexData` decodes each attribute, then weaves per-vertex:
```
out[ v*stride + attrOffset + c ] = attr.data[ v*attr.components + c ]
```
The design decision: glTF's `attributes` is an **unordered map**, but a vertex buffer is **ordered** (`formats[0]` → `@location(0)`). So a fixed `VERTEX_ATTRIBUTES` order (POSITION, NORMAL, TEXCOORD_0) turns the map into a deterministic layout — and that order is the contract the shader's `@location`s rely on. Loop-bound bug caught here: iterating `v < vertices.length` (144) instead of `v < vertexCount` (24).

## Nodes: matrix *or* TRS

A glTF node carries *either* a `matrix` *or* TRS — but the spec gives no discriminator, and both sides are optional. So the **type stays loose (all optional); the runtime resolves**: if `matrix` is present, decompose it (`mat4.getTranslation` / `mat4.getScaling` / `quat.fromMat`); else use the TRS fields with spec defaults (`[0,0,0]`, identity quat `[0,0,0,1]`, `[1,1,1]`). Bug caught: the TRS branch was dropped entirely at first (compiled clean — the box has a matrix, so it hid). Caveat noted: `quat.fromMat` mis-extracts rotation under non-uniform scale; fine for the box (rotation-only).

## Assembling the scene

`buildScene` is a two-pass tree build: build every `Node`, then link children. The bug worth remembering: `children.forEach((_, childIndex) => …)` — `forEach`'s callback is `(element, index)`, and `children` holds node *indices* as its **elements**. Using the loop *position* instead made node 0 adopt itself → the #106 cycle guard threw on the simplest possible file. *Always ask what a variable means.*

## Seeing it: the demo, and a latent bug

Rendered the box with a minimal **normals-as-color** material (it has no UVs, so the textured cube material can't take it — materials are #21/#22). Wiring it surfaced a real bug in `Material.bind`: `pass.setBindGroup(0, group, dynamicOffsets)` with `dynamicOffsets === undefined` throws *"cannot be converted to a sequence."* Every prior caller (the cube) passed an array, so the no-offsets path was never exercised. Fix: omit the argument when there are none. (Also a truthiness note: `...(x && { x })` is safe for a typed array but a footgun for a `string`/`number`, where `''`/`0` are falsy-but-valid — `!== undefined` is the honest test.)

## Recurring lessons

- **`tsc` clean ≠ correct** — loop bounds, `forEach` arg order, dropped branches, `0`/`''` falsiness all pass the compiler.
- **Fix types at the producer** (`<ArrayBuffer>`), not the consumer.
- **`exactOptionalPropertyTypes`** makes "omitted" ≠ "present-but-undefined" — conditional-spread the optional in.
- **The boundary is the architecture** — the parser-vs-library choice is reversible if the engine never imports glTF.

## Deferred / what's next

- **#21 / #22** — glTF PBR material params and texture/sampler import (the box is unlit-normals until then).
- Follow-ups: `.gltf` (non-binary) input, interleaved / non-float source attributes — all currently throw or are unsupported.
- The loader is scoped to the uncompressed core spec; KTX2/Draco are later.
