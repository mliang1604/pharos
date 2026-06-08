---
tags:
  - notes
phase: "2"
---
Lift the loader from "the curated assets we export" to "arbitrary glTF." The through-line: **one shortcut hid three features.** The minimal `.glb` loader (#20) assumed a single embedded buffer of tightly-packed floats; every real-world feature it punted on — external buffers, interleaving, integer attributes — traces back to that one assumption. #117 removes it.

## What we built (all on top of one spine change)

- **The spine:** `bin: ArrayBuffer` → `buffers: ArrayBuffer[]`, threaded through `decodeAccessor → buildVertexData/buildMesh → buildScene` and `loadTextures` ([src/assets/gltf.ts](../../../src/assets/gltf.ts)). A `bufferView` always named its buffer via `bufferView.buffer`; `.glb` let us ignore it because there was only one. Plural buffers make that index matter.
- **Part 1 — `.gltf` container:** `parseGltf` (pure manifest mirror of `parseGlb`), `resolveUri` (base64 `data:` / relative fetch), `resolveBuffers`, `resolveImageBytes` (embedded vs external images), and `loadGltf` detecting the container by magic and converging both formats on one resolver.
- **Part 2 — interleaved bufferViews:** `decodeAccessor` de-interleaves a strided view into a packed array.
- **Part 3 — non-float attributes:** `toFloat32` converts integer accessors to float, rescaling normalized ones.
- Tests ([test/unit/assets/gltf.test.ts](../../../test/unit/assets/gltf.test.ts)): `.gltf` end-to-end (data-URI + external buffer), interleaved de-interleaving, `toFloat32` normalization — synthetic fixtures, since no shipped asset exercises the latter two.

## Parse vs. resolve — the seam that mattered

`parseGlb` is **pure and synchronous**: a `.glb` already *contains* its bytes, so it returns `{ json, bin }` with no I/O. A `.gltf` can't offer that — it's a manifest that *points at* its bytes (sibling files, or inline `data:` URIs). The temptation is a `parseGltf` that loads everything; the right move is to keep `parseGltf` equally pure (just `JSON.parse` + version check) and put the async byte-fetching in a **separate, shared `resolveBuffers`**. Two payoffs: `parseGltf` unit-tests exactly like `parseGlb` (feed bytes, assert manifest — no fetch mock), and a `.glb` that *also* references an external buffer goes through the same resolver. The lesson: **parse = bytes→manifest (pure, per-format); resolve = URIs→bytes (async, shared).** `parseGlb` only looked like one job because it short-circuited the resolve for its single embedded buffer.

## Container detection, and URL resolution

Detect by **magic bytes, not extension**: a `.glb` opens with `glTF` (`0x46546c67`); JSON can't collide. Relative references (`Sponza.bin`) resolve against the `.gltf`'s own location via `new URL(uri, baseUrl)` — and the trap is that **the base must be absolute**: `new URL('Sponza.bin', '/pharos/.../Sponza.gltf')` throws, so promote the path to a full URL first (`new URL(url, location.href)`), falling back to a dummy origin under Node so tests (which mock `fetch`) don't need a real `location`.

## Interleaving: a copy that buys a contiguous world

Two layouts share a bufferView. **Tight:** each attribute contiguous, `byteStride === elementSize`. **Interleaved:** attributes woven per-vertex (`[P P P T T | P P P T T]`), so consecutive POSITIONs sit `byteStride` apart with TEXCOORD bytes between. A contiguous `new Ctor(buffer, start, length)` would read the neighbor's bytes. The fix de-interleaves into a fresh packed array — loop `count` elements, each at `start + i*byteStride`, copy its `componentCount` contiguous components out. The fast path (tight) stays a **zero-copy view**; only interleaved data pays for a copy. A subtlety surfaced here: the file's `TypedArrayConstructor` type only declared the `(buffer, …)` overload, so `new Ctor(length)` (the allocate-fresh overload) needed a second construct signature added — the type abstraction has to declare each runtime overload you use.

## Normalized: integers that are really fractions

A non-float attribute is either a literal value (a joint index — plain numeric cast) or, when `normalized: true`, an integer standing in for a fraction to save bytes. The rescale follows the spec: unsigned `c / MAX` → `[0,1]`; signed `max(c / MAX, -1)` → `[-1,1]`, the clamp pinning the most-negative integer (which divides to just under −1) to exactly −1. A small `NORMALIZE` table (componentType → divisor + signedness) drives it, and `Float32Array.from(data, mapFn)` does the conversion without hand-indexing (sidestepping the `noUncheckedIndexedAccess` friction of a manual loop). `Mesh` stays float-only; the conversion is CPU-side, once, at load.

## What Sponza actually needed (scoping by inspection)

Before building, I dumped Sponza's manifest: **1 external buffer, 69 external images, all-`f32` attributes, and every `byteStride` equal to element size.** So Sponza strictly needs only Part 1 — its strides don't trip the interleave path, and it has no integer attributes. We built all three anyway (the issue's scope), but the inspection meant Parts 2 & 3 are covered by *synthetic* fixtures, not Sponza — and it confirmed Part 1 is the real unblocker. Measure the asset before assuming which code paths it exercises.

## What's next

- **#27 Sponza** — now unblocked; the first real `.gltf` load and the first real `AssetManager` (#24) call site.
