# Issue 6 - Textured Spinning Cube

The "hello cube" milestone — the first time everything comes together into something that actually looks 3D. Pairs with [[Issue 5 - Hardcoded Triangle]], which drew a single flat triangle whose corners were hardcoded in the shader. This issue is a big jump: real geometry in memory, a 3D camera, depth, and a texture.

## What we built

A checkerboard-textured cube, spinning and tumbling, that stays solid and correct as it turns. Run `npm run dev` and you should see it rotating on the cycling background.

It bundles **four** new subsystems, each one a "first time you've seen this" concept:

1. **Vertex + index buffers** — geometry lives in GPU memory, not baked into the shader.
2. **An MVP matrix uniform** — a 3D camera that makes a cube look like a cube.
3. **A depth buffer** — so near faces correctly hide far faces.
4. **A sampled texture** — an image painted onto the faces.

Because that's a lot, we built it in four stages, each a working, testable increment (and a separate commit). This note follows the same path.

## The mental model: what changed since the triangle

In [[Issue 5 - Hardcoded Triangle]], the vertex shader *invented* its positions from `vertex_index` and returned them straight to clip space. Every new thing in this issue is about removing one of those shortcuts:

```
  Issue 5 triangle                     Issue 6 cube
  ────────────────                     ────────────
  positions hardcoded in WGSL    →     positions in a vertex BUFFER
  3 vertices, draw(3)            →     24 vertices + 36 INDICES, drawIndexed(36)
  positions already clip-space   →     model-space, transformed by an MVP MATRIX
  no notion of "in front"        →     a DEPTH buffer decides what's visible
  flat solid red                 →     a TEXTURE sampled per pixel
```

---

## Stage 1 — Geometry into a vertex buffer

Hardcoding positions in the shader doesn't scale (you can't bake a thousand-vertex mesh into source, and changing geometry would mean recompiling the shader). So positions move into a **vertex buffer**: a flat block of bytes in GPU memory.

The data flows through four things that must all agree:

```
  JS Float32Array  →  GPUBuffer (VERTEX)  →  vertex layout  →  @location(0) in the shader
```

- **The buffer** is created with `usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST` (it feeds the vertex stage, and we copy data into it with `writeBuffer`).
- **The layout** tells the pipeline how to read the bytes: `arrayStride` (bytes per vertex) and one `attribute` per field (`shaderLocation`, `offset`, `format`).
- **The shader** stops computing positions and starts *receiving* one: `@location(0) position`.

The big gotcha: **`arrayStride` and `offset` are measured in bytes, not in number-of-floats.** Each `f32` is 4 bytes. A vertex of `position(vec3) + uv(vec2)` is 5 floats = `20` bytes stride, with `uv` starting at byte `12` (after 3 position floats × 4). Get the units wrong and every vertex after the first reads misaligned garbage.

`usage` flags name the *roles* a buffer can play, OR-ed together: `VERTEX`, `INDEX`, `UNIFORM`, `COPY_SRC`/`COPY_DST`. A buffer can do only what it declares.

---

## Stage 2 — The cube and the MVP matrix

This is the conceptual heart of the issue.

### Index buffers, and why a cube has 24 vertices

A triangle-list cube is 6 faces × 2 triangles × 3 corners = 36 vertices if you list every triangle separately. Many are duplicates, so instead we store unique vertices once and add an **index buffer** — a list like `0,1,2, 0,2,3, …` that says "make triangles from these vertex numbers." Then `drawIndexed(36)` instead of `draw(36)`.

Why 24 and not 8 (the cube's geometric corners)? Because a vertex carries more than position — it carries a **UV** (texture coordinate). The three faces meeting at a corner need *different* UVs there, so that corner must exist as 3 separate vertices. 6 faces × 4 corners = 24.

The index buffer is just another `GPUBuffer`, but with `usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST`, and it's a `Uint16Array` (so the index format is `'uint16'` when you call `setIndexBuffer`).

### Coordinate spaces and the MVP matrix

The triangle's positions were *already* in clip space (the ±1 box), so the shader passed them through. The cube's corners live in **model space** (±1 on each axis, centered at the origin). To get them onto the screen, with perspective, as seen by a camera, they travel through three transformations:

```
  model space  ──[ Model ]──►  world space  ──[ View ]──►  view space  ──[ Projection ]──►  clip space
  (cube's own     places &       (cube in the    (camera at     (relative to    (perspective; mapped
   coords)        spins it)       world)          origin)        the camera)     into the ±1 box)
```

- **Model** — positions/rotates/scales the object. **This is the one we rebuild every frame** with a growing angle; that's what makes it spin. (View and Projection are usually constant frame-to-frame.)
- **View** — the camera. There's no real camera; you move the whole world so the camera sits at the origin. We use `mat4.lookAt([0,0,5], [0,0,0], [0,1,0])` — stand back 5 units, look at the origin.
- **Projection** — adds perspective and squashes the visible frustum into clip space. `mat4.perspective(fovY, aspect, near, far)`.

The three multiply into a single **MVP** matrix: `P × V × M`. Order matters — in the shader we write `mvp * position`, so the matrix applied to the vertex *first* is the rightmost, and the raw vertex starts in model space, so `M` must be rightmost. We let **wgpu-matrix** do the math (chosen over hand-rolling so we could focus on the WebGPU plumbing; chosen over gl-matrix because it targets WebGPU's 0..1 depth range natively).

### Uniform buffers and bind groups

The MVP matrix is the **same for all 24 vertices** in a frame — data that's constant across a draw is called *uniform*. It flows through a different channel than per-vertex data:

```
  per-vertex data            uniform data (same for every vertex)
  ───────────────            ─────────────────────────────────
  GPUBuffer (VERTEX)         GPUBuffer (UNIFORM), 64 bytes = a 4x4 f32 matrix
  setVertexBuffer            a BIND GROUP → setBindGroup
  @location(0)               @group(0) @binding(0) var<uniform> ...
```

A **bind group** is a labeled bundle of resources (uniforms, textures, samplers) handed to the shader. The shader declares slots like `@group(0) @binding(0)`, and the bind group says "binding 0 = this buffer." Because the pipeline uses `layout: 'auto'`, WebGPU *infers* the bind group layout from the shader, and we fetch it with `pipeline.getBindGroupLayout(0)` — which is why the bind group must be created *after* the pipeline.

Each frame: rebuild the MVP, `writeBuffer` it into the uniform buffer, then `setBindGroup(0, …)` before drawing.

### Inter-stage variables and interpolation

The vertex shader needs to hand the `uv` to the fragment shader. It returns a **struct** with `@builtin(position)` plus `@location(0) fragUV`. The rasterizer **interpolates** that `uv` across the triangle — a pixel halfway between two corners gets the average — which is exactly what makes a texture map smoothly. A subtlety: `@location` numbers live in *three separate namespaces* (vertex-buffer attributes, inter-stage variables, fragment-output targets), so the same number in different roles is unrelated.

---

## Stage 3 — Depth testing

After Stage 2 the cube spins but looks inside-out: faces draw in **index order**, so a face drawn later paints over one physically in front of it.

A **depth buffer** (z-buffer) fixes this. It's a full-screen image storing, per pixel, the depth of the closest fragment so far. Each new fragment is kept only if it's *nearer* than what's stored — so the result is correct regardless of draw order. Depth runs `0.0` (near plane) to `1.0` (far plane).

Three pieces, mirroring the color attachment:

1. A **depth texture** — `format: 'depth24plus'`, `usage: GPUTextureUsage.RENDER_ATTACHMENT`.
2. A **`depthStencil`** block on the pipeline: `depthWriteEnabled: true`, `depthCompare: 'less'`, `format: 'depth24plus'`.
3. A **`depthStencilAttachment`** on the render pass: the depth texture's view, `depthClearValue: 1.0`, `depthLoadOp: 'clear'`, `depthStoreOp: 'store'`.

### Why `depthClearValue` and `depthCompare` are a matched pair

This one is worth internalizing. The clear value is what every *first* fragment is compared against at the start of a frame.

- `depthCompare: 'less'` means "draw only if this fragment's depth is **less** (nearer) than what's stored."
- Clear to `1.0` (the farthest value): the buffer starts saying "everything here is infinitely far," so any real fragment (depth < 1.0) wins. Correct.
- Clear to `0.0` instead: the buffer says "everything is at the camera," and `depth < 0.0` is never true, so **nothing draws** — a blank screen.

So you clear to the **worst** value for your test, so the first real fragment always beats it. `'less'` pairs with `1.0`; `'greater'` would pair with `0.0`. They must agree.

(The depth `format` must match between the texture and the pipeline's `depthStencil` — the same format-matching rule as the color target in [[Issue 5 - Hardcoded Triangle]].)

---

## Stage 4 — Texturing

The fragment shader stops *computing* a color and starts *looking one up* from an image.

```
  image bytes (RGBA)        how to read it          shader
  ──────────────────        ──────────────          ──────
  Uint8Array of pixels      a SAMPLER               textureSample(tex, samp, uv)
       │                          │                      ▲
  a TEXTURE  ───────────── both go in the bind group ────┘
```

- **Texture** — the image in GPU memory. Created with `format: 'rgba8unorm'`, `usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST`, and filled via `device.queue.writeTexture(...)` (where `bytesPerRow = width × 4`). We generate a procedural checkerboard into a `Uint8Array` rather than load an asset file.
- **Sampler** — the *rules* for reading the texture (see below). Created separately so one sampler can serve many textures.
- The shader declares `@group(0) @binding(1) var t: texture_2d<f32>` and `@binding(2) var s: sampler` (note: `var`, no `<uniform>`), and returns `textureSample(t, s, uv)`. The bind group binds a **view** of the texture (`texture.createView()`) and the sampler object directly.

### What the sampler actually does

A texture is a grid of stored pixels (*texels*). But the shader samples at a continuous `uv` like `(0.5137, 0.92)`, which rarely lands on one texel, and the face is usually drawn at a different size than the texture's native resolution. The **sampler is the recipe for turning a `uv` + a size mismatch into one color**. It answers:

1. **Filtering** — when texels and screen pixels don't line up 1:1:
   - `magFilter` (texture zoomed in, one texel covers many pixels) and `minFilter` (texture shrunk, many texels per pixel).
   - `'nearest'` grabs the closest texel (crisp, blocky); `'linear'` blends the 4 neighbours (smooth). Toggling these visibly changes how sharp the checker edges look.
2. **Address mode** — what to do when `uv` leaves `[0,1]`: `'repeat'` (tile), `'clamp-to-edge'` (default), `'mirror-repeat'`. Irrelevant here since our UVs stay in `[0,1]`, but it's what tiles a texture.
3. **Mipmapping** — anti-aliasing for distant textures via pre-shrunk copies (unused here).

The split is deliberate: the **texture** is *what the image is*; the **sampler** is *how to read it*.

---

## The recurring TypeScript lesson: typed arrays and their buffer

Twice this issue, `typecheck` rejected a perfectly good typed array passed to a WebGPU call (`writeBuffer` for the MVP matrix, `writeTexture` for the pixels):

```
Argument of type 'Float32Array<ArrayBufferLike>' is not assignable to 'GPUAllowSharedBufferSource'
```

TypeScript 5.7 made typed arrays **generic over their backing buffer** — a `Float32Array` is now `Float32Array<ArrayBuffer>` *or* `Float32Array<SharedArrayBuffer>`. WebGPU's write methods demand the `ArrayBuffer`-backed one. The wide type sneaks in two ways:

- wgpu-matrix returns `Float32Array<ArrayBufferLike>` — fixed by giving it our own `new Float32Array(16)` (ArrayBuffer-backed) as the `dst` argument. Bonus: reusing one scratch array avoids allocating a matrix every frame.
- A return-type annotation `(): [number, Uint8Array]` widens the array — fixed by parameterizing it: `[number, Uint8Array<ArrayBuffer>]`.

The general lesson: when a WebGPU write rejects a typed array, it's the "might be SharedArrayBuffer" wide type. Pin it to `ArrayBuffer` at the source rather than casting at the call.

## A structural note

As the resource count grew, the bootstrap `else` block got long, so we extracted it into `initScene(device, context)` — called only where `device` and `context` are guaranteed non-null, so no `!` is needed (the same no-non-null-assertion discipline from [[Issue 5 - Hardcoded Triangle]]). The per-frame work lives in `startRenderLoop(...)`, which now takes the pipeline, buffers, bind group, and depth texture as typed parameters. See [src/main.ts](../../../src/main.ts).

## What's next

The cube is the foundation for almost everything 3D. Natural next steps:

- **Lighting** — add normals to each vertex and a light direction; shade faces by how much they face the light. Needs another uniform.
- **A camera you can move** — turn the fixed `lookAt` into an orbit/fly camera driven by input, and handle window resize (recreating the depth texture and updating the projection's aspect ratio).
- **More than one object** — a separate model matrix per object, and eventually instancing to draw many cheaply.
- **Loading real meshes and textures** — replace the hardcoded cube and procedural checkerboard with data loaded from files (glTF, image assets).

Each reuses the exact pipeline we built here: buffers → pipeline → uniforms/bind groups → depth → draw.
