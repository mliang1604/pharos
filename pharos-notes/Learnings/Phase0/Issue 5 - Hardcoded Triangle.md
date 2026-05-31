---
tags:
  - notes
phase: "0"
---
The first time we draw an actual *shape*. Pairs with [[Issue 4 - Canvas Context and Clear Color]], which got the canvas clearing to a cycling color every frame. Until now the screen has only ever been wiped to a flat color — no geometry, no shaders. This issue adds the smallest possible real render: a single triangle, drawn by code we wrote, on top of that same cycling background.

## What we built

A red triangle, pointing up, sitting in the middle of the canvas while the background keeps cycling colors behind it.

That's deliberately unglamorous. The issue called it a "sanity check the pipeline" — the goal isn't the triangle itself, it's proving that the entire *programmable* rendering path works end to end: we can write a shader, hand it to the GPU, build a pipeline around it, and issue a draw call that actually puts our pixels on screen. Every fancier thing later (textured meshes, lighting, 3D) is just a more elaborate version of exactly this loop.

When you run `npm run dev` and open the page, you should see the red triangle on the cycling background. If you do, the whole programmable pipeline is wired correctly.

## The GPU's assembly line

To draw a triangle, the GPU runs a small assembly line with three stations. You only program the two on the ends; the middle one is free.

```
   3 vertices                 pixels covered                  final
   (we give                   by the triangle                 colors
    positions)                                                 on screen
       │                            │                            │
       ▼                            ▼                            ▼
 ┌───────────────┐   fixed   ┌──────────────┐   fixed   ┌───────────────┐
 │ VERTEX shader │ ────────► │ rasterizer   │ ────────► │ FRAGMENT      │
 │ (we write)    │ (GPU does │ (GPU does it │           │ shader        │
 │               │   this)   │  for you)    │           │ (we write)    │
 └───────────────┘           └──────────────┘           └───────────────┘
   runs 3 times                fills in the              runs once per
   (once per vertex)           triangle's pixels         covered pixel
```

- **Vertex shader** — runs **once per vertex** (3 times for a triangle). Its only job is to output *where* each corner of the triangle goes. It defines the *shape*.
- **Rasterizer** — the GPU does this for free. It takes our 3 corners, works out which screen pixels land *inside* that triangle, and produces one "fragment" (a candidate pixel) for each. We don't write any of this.
- **Fragment shader** — runs **once per covered pixel**. Its job is to output the *color* of that pixel. It defines the *color*.

The single most important idea here is the **run counts**. It's tempting to think the fragment shader runs three times too (one per corner). It doesn't. The rasterizer is a *multiplier*: 3 corners in, tens of thousands of fragments out. A triangle covering a big chunk of the canvas means the fragment shader runs tens of thousands of times — once for every pixel it touches.

That's the whole reason GPUs are built the way they are (the "army of specialists" from [[Issue 4 - Canvas Context and Clear Color]]). The fragment shader fires millions of times per frame in a real scene, so each invocation has to be tiny and independent, all running in parallel. Practical consequence: anything that varies *per pixel* (a gradient, a texture lookup, lighting) has to live in the fragment shader, because it's the only station that "sees" each individual pixel.

## Why there's a "pipeline" object

WebGPU makes you build a `GPURenderPipeline` object before you can draw. At first that feels like ceremony — why not just call `draw()`?

The intuition: the GPU is a physical machine that has to be *configured* before it can run that assembly line, and reconfiguring it is expensive. It needs to know, ahead of time, which shaders to load into the two stations, what shape it's assembling (triangles? lines? points?), what pixel format it's writing into, and a pile of other knobs.

A render pipeline is that entire frozen configuration bundled into one object.

- Building the pipeline = **setting up the factory line.** Slow, done **once** at startup.
- Calling `draw` = **pressing the start button.** Fast, done **every frame.**

This split drives where the code lives (see below): pipeline creation happens once, the draw call happens inside the frame loop.

## Drawing without a vertex buffer

Normally the 3 corner positions would live in a **vertex buffer** — a chunk of GPU memory we fill and feed into the pipeline. This issue deliberately says *no buffers*, to keep the sanity check minimal. So where do the positions come from?

The trick: the vertex shader gets a free input called `@builtin(vertex_index)` — an integer that counts `0, 1, 2` across the three runs. We hardcode a little array of 3 positions *inside the shader itself* and index into it with that number. The geometry lives in the shader source as a constant. No buffer needed.

## Clip space

The vertex shader has to answer "where does this corner go?" — but in what units? Not pixels. It outputs **clip space**, a fixed coordinate system that's the same regardless of canvas size.

```
              +1  (top)
               │
               │
  -1 ──────────┼──────────► +1   X: left edge = -1, right edge = +1
 (left)        │  (0,0)          Y: bottom = -1, top = +1
               │                 (note: +Y is UP, unlike screen pixels)
               │
              -1  (bottom)
```

The center of the canvas is `(0, 0)`, the edges are at `±1`. Because positions are fractions of the viewport rather than pixel counts, the same triangle looks right at any canvas size — the GPU maps `±1` onto whatever pixel dimensions the canvas happens to have.

Our three corners are `(0, 0.5)` top-center, `(-0.5, -0.5)` bottom-left, `(0.5, -0.5)` bottom-right — a tidy upward triangle well inside the box.

## The two shaders

Both stations are written in **WGSL**, a separate language the GPU compiles. Our TypeScript never *runs* the WGSL — it just hands the source text over as a string. Both functions live in one module in [src/main.ts](../../../src/main.ts):

```wgsl
@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  let positions = array<vec2<f32>, 3>(
    vec2<f32>(0.0, 0.5),
    vec2<f32>(-0.5, -0.5),
    vec2<f32>(0.5, -0.5)
  );
  return vec4<f32>(positions[index], 0.0, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
  return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}
```

A few things worth pinning down:

- `@vertex` / `@fragment` tag each function for its station.
- `@builtin(vertex_index) index: u32` is the free `0,1,2` counter. `u32` is an unsigned 32-bit int.
- `-> @builtin(position) vec4<f32>` means the vertex shader returns a clip-space position, tagged so the rasterizer knows that's the corner location.
- The return promotes our 2D point to a 4D vector: `(x, y, z, w)`. `z = 0.0` because the triangle is flat (no depth yet); `w = 1.0` means "no perspective scaling" — `w` only earns its keep once 3D cameras and matrices arrive.
- `-> @location(0) vec4<f32>` in the fragment shader means "write this color to color attachment #0" — the same attachment the render pass declares. Color channels are floats in `[0, 1]`, not `0–255`, so `(1, 0, 0, 1)` is opaque red.
- `vec2<f32>` and the shorter `vec2f` are the same type; we used the long form throughout.

One detail filed away for later: the corner order traces *clockwise* on screen. That matters for **back-face culling** (skipping triangles that face away from the camera), which we haven't turned on — so the triangle draws regardless of winding today.

## Wiring it up in TypeScript

Two GPU objects turn that shader text into something drawable:

```ts
const shaderModule = device.createShaderModule({
  label: 'triangle shaders',
  code: `...both shaders above...`,
});

const pipeline = device.createRenderPipeline({
  label: 'triangle pipeline',
  layout: 'auto',
  vertex: { module: shaderModule, entryPoint: 'vs_main' },
  fragment: {
    module: shaderModule,
    entryPoint: 'fs_main',
    targets: [{ format }],
  },
  primitive: { topology: 'triangle-list' },
});
```

- `createShaderModule` compiles the WGSL. One module can hold many entry points; we point the pipeline at the specific ones by name (`vs_main`, `fs_main` — these strings must match the function names exactly).
- `layout: 'auto'` lets WebGPU infer the resource layout. Fine while the shaders take no external inputs; we'll define it explicitly once uniforms and textures (bind groups) appear.
- `topology: 'triangle-list'` means "every 3 vertices form one triangle."

### The one rule that bites: format must match

`targets[0].format` must **exactly equal** the format the canvas was configured with (`navigator.gpu.getPreferredCanvasFormat()`, from [[Issue 4 - Canvas Context and Clear Color]]). The fragment shader writes pixels in a specific byte layout; the canvas texture it writes into has its own layout. If they disagree — say the pipeline thinks `bgra8unorm` but the texture is `rgba8unorm` — red and blue would silently swap, or worse. Rather than let that happen, WebGPU validates the two formats match *at pipeline-creation time* and rejects the pipeline outright. So we always pass the same `format` variable, never a hardcoded string.

## The draw call, and where code lives

The draw itself is two lines, dropped into the render pass *between* `beginRenderPass` and `pass.end()` — the empty gap the clear loop left in [[Issue 4 - Canvas Context and Clear Color]]:

```ts
pass.setPipeline(pipeline);   // use this factory configuration
pass.draw(3);                 // run the line for 3 vertices → 3 vertex runs → 1 triangle
```

That `3` is literally why the vertex shader runs three times and `vertex_index` counts `0,1,2`.

Clear and draw aren't competing — they're two phases of one render pass. The pass first runs `loadOp: 'clear'` (fill the whole canvas with the background color), then the draw paints the triangle's pixels on top. That's why we kept the clear: the triangle only covers a third of the canvas, and the clear defines every pixel around it. Without it, the surrounding pixels would show leftover garbage from a recycled swap-chain texture.

And the once-vs-every-frame split from earlier decides placement: `createShaderModule` and `createRenderPipeline` run **once** at startup; `setPipeline` + `draw` run **inside** the frame loop.

## The refactoring lesson

This is the part worth remembering even after the WebGPU details fade, because it's not WebGPU-specific.

The first working version built the shader module and pipeline at the *bottom of the file*, outside the `if (device)` guard. To make it compile, four non-null assertions (`!`) crept in:

```ts
let format!: GPUTextureFormat;             // definite-assignment !
const shaderModule = device?.createShaderModule(...);
pass.setPipeline(pipeline!);               // pipeline might be undefined
module: shaderModule!,                      // shaderModule might be undefined
```

This codebase **bans `!`** — that's the whole reason [src/main.ts](../../../src/main.ts) has a `requireElement` helper instead of `el!`. ESLint enforces it. So four `!` showing up in one feature wasn't a coincidence; it was the type system saying *the structure is wrong*.

Each `!` traced back to one root cause: the pipeline was created where `device` might be null and `format` might be unassigned. Using `device?.createRenderPipeline(...)` gave the result type `GPURenderPipeline | undefined`, which then needed `!` at every use.

The fix wasn't to add more `!` — it was to **move the work to where the values are provably valid**. Inside the `else` block, three things are already guaranteed: `device` is non-null (we're inside `if (device)`), `context` is non-null (inside the `else` of `if (!context)`), and `format` was just assigned. Building the shader module and pipeline *there*, then passing the pipeline into the frame loop as a typed parameter:

```ts
function startClearLoop(
  device: GPUDevice,
  context: GPUCanvasContext,
  pipeline: GPURenderPipeline   // non-optional — no ! needed at use
): void { ... }
```

...made all four `!` and both `?.` disappear — not by silencing the compiler, but by restructuring so its objection no longer applied.

The transferable habit: **when you reach for `!`, treat it as a signal to fix the structure, not the symptom.** Scope the value so it's provably non-null where you use it. `!` says "trust me"; good scoping says "here's why you don't have to."

## What's next

The triangle proves the programmable pipeline works. The next steps build on exactly this skeleton:

- **A triangle from a real vertex buffer** — move the hardcoded positions out of the shader and into GPU memory, with a vertex buffer layout describing how to read it. Same pipeline, plus one buffer and a `setVertexBuffer` call.
- **Uniforms and 3D** — to move or rotate anything we need a uniform buffer carrying a matrix, plus a bind group to attach it, plus a depth buffer once triangles can overlap in 3D.
- **Textures** — samplers, texture resources, and bind groups, with the fragment shader doing the lookups.

Each one slots into the same `createShaderModule → createRenderPipeline → setPipeline → draw` flow we just built.
