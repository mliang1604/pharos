---
tags:
  - notes
phase: "1"
---
The first Phase 1 abstraction, and the first time we take something that already *worked* and make it *reusable*. [[Issue 6 - Textured Spinning Cube]] hand-rolled the cube's geometry inline in `main.ts` — two `createBuffer`/`writeBuffer` pairs, a vertex layout with the magic numbers `arrayStride: 20` and `offset: 12` typed by hand, and a `setVertexBuffer`/`setIndexBuffer`/`drawIndexed` trio scattered through the render loop. This issue gathers all of that into a `Mesh` object that knows its own layout, owns its buffers, and draws itself — without changing a single pixel on screen.

## What we built

Four small, focused files, plus the rewiring of `main.ts`:

- [src/geometry/vertexFormats.ts](../../../src/geometry/vertexFormats.ts) — a `VertexFormat` string-literal union and a `VERTEX_FORMAT_SIZE` lookup.
- [src/geometry/vertexLayout.ts](../../../src/geometry/vertexLayout.ts) — `buildVertexBufferLayout(formats)`, which turns an ordered list of formats into a `GPUVertexBufferLayout`. Pure, GPU-free, and **unit-tested**.
- [src/gpu/buffers.ts](../../../src/gpu/buffers.ts) — `createGpuBufferWithData(...)`, one helper that creates *and* uploads any buffer.
- [src/geometry/mesh.ts](../../../src/geometry/mesh.ts) — the `Mesh` class itself.

The cube still spins and tumbles exactly as before — `npm run dev` is the proof, since a `Mesh` needs a real GPU to construct.

## The through-line: derive, don't duplicate

Almost every decision in this issue is the same instinct applied repeatedly: **if a fact can be computed from data you already hold, don't store it a second time.** Two values that "must agree" are a desync bug waiting to happen. Over the issue we derived:

```
  arrayStride        ← sum of the formats' byte sizes
  attribute offset   ← running sum of preceding sizes
  shaderLocation     ← the attribute's index in the list
  byte size          ← the format string ('float32x3' → 12)
  vertexCount        ← vertices.byteLength / arrayStride
  index format       ← the indices array's type (Uint16Array → 'uint16')
  index count        ← indices.length
```

The hand-typed `20` and `12` from [[Issue 6 - Textured Spinning Cube]] were exactly the kind of duplicated, derivable constant this removes.

## Vertex formats: a closed set the compiler enforces

The first building block is a **string-literal union**, not a loose `string`:

```ts
type VertexFormat = 'float32' | 'float32x2' | 'float32x3' | 'float32x4';
```

A value of this type can only be one of those exact strings — a typo like `'flot32x3'` is a *compile* error, not a runtime surprise. The names deliberately mirror WebGPU's own `GPUVertexFormat`, so one string does double duty: it's the key into the size table *and* the `format` we later hand straight to the GPU. No translation layer.

The size table is keyed by the union, not by `string`:

```ts
const VERTEX_FORMAT_SIZE: Record<VertexFormat, number> = { ... };
```

`Record<VertexFormat, number>` forces an entry for **every** member — add `'float32'` to the union and the file won't compile until you give it a size. The type system makes the table impossible to leave incomplete.

## From formats to a layout

`buildVertexBufferLayout(['float32x3', 'float32x2'])` walks the formats in order, tracking a running byte offset, and emits one `GPUVertexAttribute` per format (`shaderLocation` = index, `offset` = running total, `format` = the string itself), with `arrayStride` = the final total. For position + uv that reproduces the old layout exactly: stride `20`, offsets `0` and `12`.

Because it's a **pure function** — data in, data out, no GPU — it's the natural unit-testing seam. [test/unit/geometry/vertexLayout.test.ts](../../../test/unit/geometry/vertexLayout.test.ts) pins three cases: a single attribute, position + uv, and the empty list (which "just works" because the loop simply never runs — no special-casing). `toEqual`, not `toBe`, because we compare a freshly built object by *value*, not identity.

## One buffer helper for vertices and indices

Creating a GPU buffer is two steps — `device.createBuffer({ size, usage })` then `device.queue.writeBuffer(...)` — and they almost always happen together for static geometry. So the helper does both and hands back a ready-to-use buffer:

```ts
createGpuBufferWithData(device, data, usage, label?)
```

Two design notes worth keeping:

- It **OR's in `COPY_DST` internally** (`usage | GPUBufferUsage.COPY_DST`). A buffer we write to *must* have `COPY_DST`, so rather than trust each caller to remember, the helper guarantees it — a caller passing just `GPUBufferUsage.VERTEX` physically cannot produce a broken buffer.
- The `data` parameter is typed `GPUAllowSharedBufferSource` — the same type `writeBuffer` accepts. That one type covers a `Float32Array` (vertices) *or* a `Uint16Array`/`Uint32Array` (indices), so the **same helper builds both kinds of buffer**. Parameterizing by `usage` is what collapses two near-identical helpers into one.

## The Mesh class

### Modeling the optional index buffer

The hard part of "optional index buffer" is keeping three facts consistent: the index `GPUBuffer`, its `GPUIndexFormat`, and the index count. The naive shape is three separate optional fields — but then in `draw`, checking `if (this.indexBuffer)` narrows only the *buffer*; TypeScript has no idea the count and format are therefore also present, and you're back to `!`. The fix is to recognize they're **one fact, not three**, and group them:

```ts
private readonly index?: {
  readonly buffer: GPUBuffer;
  readonly format: GPUIndexFormat;
  readonly count: number;
};
```

Now a single `if (this.index)` narrows the whole object — `this.index.buffer / .format / .count` are all defined inside the branch, no assertion needed. And the invariant is enforced *structurally*: you can't construct a buffer without its format. The presence of `index` is itself the "is this mesh indexed?" flag — no separate boolean to drift out of sync.

The format isn't asked for; it's **derived from the array** the caller already passes: `indices instanceof Uint16Array ? 'uint16' : 'uint32'`. The constructor types `indices` as `Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>`, which makes that derivation total — there's no third case to handle.

### Immutability over accessors

The first draft of the class had a `private _field` + getter + setter for every field. The setters are a trap: a `Mesh`'s buffers, layout, and counts are derived **once** in the constructor and must stay consistent — a public `set vertexCount(n)` lets any caller desync it from the actual buffer. The fix collapses each three-part pattern into one line:

```ts
public  readonly vertexBufferLayout: GPUVertexBufferLayout;  // pipeline reads it
private readonly vertexBuffer: GPUBuffer;
private readonly vertexCount: number;
```

`readonly` *is* the "no writing from outside" guarantee, a public field is already readable, and assigning in the constructor makes the field provably initialized — so the getters, setters, **and** the `!` definite-assignment marks all disappear together. Only `vertexBufferLayout` is public, because only the pipeline reads it; everything else is private because only `draw` touches it.

### Encapsulating the draw

`draw(pass)` hides the one branch that mattered:

```ts
draw(pass) {
  pass.setVertexBuffer(0, this.vertexBuffer);
  if (this.index) {
    pass.setIndexBuffer(this.index.buffer, this.index.format);
    pass.drawIndexed(this.index.count);
  } else {
    pass.draw(this.vertexCount);
  }
}
```

The renderer no longer needs to know whether a mesh is indexed, what its index format is, or how many vertices it has — it just says `mesh.draw(pass)`. The indexed-vs-non-indexed decision lives in one place, next to the data that decides it.

### The `exactOptionalPropertyTypes` nuance

With `exactOptionalPropertyTypes` on, an optional `index?: {...}` means "the key may be **absent**," *not* "the key may be `undefined`." So you assign it only inside `if (indices) { this.index = {...} }` and leave it untouched otherwise — writing `this.index = undefined` in an `else` is a type error. (Same shape as the conditional `label` spread inside the buffer helper.)

## The pinning gotcha, again — and the right fix

The `Float32Array<ArrayBufferLike>` vs `<ArrayBuffer>` issue from [[Issue 6 - Textured Spinning Cube]] came back, and it's worth recording how it played out because the *first* fix was wrong. Passing a default `Float32Array` straight into the buffer helper fails:

```
Argument of type 'Float32Array<ArrayBufferLike>' is not assignable to
parameter of type 'GPUAllowSharedBufferSource'.
  ... Type 'SharedArrayBuffer' is not assignable to type 'ArrayBuffer'.
```

`GPUAllowSharedBufferSource` resolves to `ArrayBufferView<ArrayBuffer>` (pinned to `ArrayBuffer`), but a default typed array's buffer might be a `SharedArrayBuffer`. The tempting fix is `data as GPUAllowSharedBufferSource` — but a cast is a "trust me" assertion in the same family as `!`: it *silences* the check rather than satisfying it. The correct fix is to make it provably safe by **pinning the input types**, not asserting at the call:

```ts
vertices: Float32Array<ArrayBuffer>;
indices?: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>;
```

A literal `new Float32Array([...])` already infers `<ArrayBuffer>`, so the cube data satisfies the pinned parameter with no cast. The general rule (and the one carried over from Issue 6): **pin to `ArrayBuffer` at the source; never cast at the call.** When a type error is real, find the constraint and type around it rather than assert past it.

## Wiring it in

The payoff shows in `main.ts`. The hand-rolled buffers and the hardcoded layout are gone; the cube is now:

```ts
const cubeMesh = new Mesh({
  device,
  vertices: cubeVertexData,
  formats: ['float32x3', 'float32x2'],
  indices: cubeIndexData,
});
```

Two lines change downstream, and they're the whole point of the issue:

- The pipeline's `buffers:` is now `[cubeMesh.vertexBufferLayout]` — the pipeline **asks** the mesh how it's laid out instead of re-asserting `arrayStride: 20` by hand (*attribute introspection*).
- The render loop is a single `cubeMesh.draw(pass)` (*encapsulation*). The old `indexCount` and the buffer locals that `startRenderLoop` threaded around are deleted — `noUnusedParameters` flagged each one as a checklist.

`tsc` clean, tests green, cube renders identically. All three phrases of the issue title are real: *pre-validated/derived layouts*, *attribute introspection*, *optional index buffer*.

## Where things live now

This issue is where the engine stops being one `main.ts` file. We settled a flat, fine-grained folder layout — `src/geometry/` for mesh/format/layout concerns, `src/gpu/` for low-level resource helpers like the buffer factory — documented in [docs/architecture/project-structure.md](../../../docs/architecture/project-structure.md). The guiding rule isn't the folder names (those are cheap to change) but the **dependency direction**: `main.ts → feature folders → @/math`, never the reverse.

Tests also moved to a top-level `test/` tree, split into `test/unit/` and `test/integration/` lanes that each mirror `src/` (so `src/geometry/vertexLayout.ts` is covered by `test/unit/geometry/vertexLayout.test.ts`) and import their subject through the `@/` alias instead of `../../` chains. `npm test` runs the unit lane; `npm run test:integration` is the separate GPU lane.

## A tooling detour worth remembering

Mid-issue, the editor showed a `TS2345` that the CLI `tsc` didn't — because the editor was using its *bundled* TypeScript, not the workspace's. The fix is to point it at the workspace version, and the current VS Code setting for that is **`js/ts.tsdk.path`** (the older `typescript.tsdk` is deprecated). Lesson: when the editor and `tsc` disagree, suspect a version mismatch first — and the CLI is the source of truth, since it's what CI runs.

## What's next / open threads

- **Index padding.** A `Uint16Array` with an *odd* index count has a `byteLength` that isn't a multiple of 4, which `createBuffer`/`writeBuffer` reject. The cube's 36 indices are even, so it's fine today — left as a follow-up (pad the buffer, or a guard).
- **Mesh unit tests — done.** `Mesh` turned out to be cleanly *unit*-testable after all, not just an integration concern. It's pure orchestration, so a fake `GPUDevice` that records the buffers it hands out, plus a spy render pass, lets you assert the interactions — the derived `vertexCount`, the `'uint16'`/`'uint32'` format, the indexed-vs-plain `draw` branch — with no real GPU. The one wrinkle: `GPUBufferUsage` is a browser-only runtime global (the types ship, the values don't), so the test stubs the three flags. See [test/unit/geometry/mesh.test.ts](../../../test/unit/geometry/mesh.test.ts).
- **Richer introspection.** Today the Mesh exposes its layout; named attributes or per-attribute queries could come later if a system needs them.
- **`Material` / `Shader` next** — the sibling abstraction that owns the pipeline and bind groups, the other half of separating *geometry* from *appearance*.
