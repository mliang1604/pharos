# Issue 4 - Canvas Context and Clear Color

A friendly walkthrough for someone who has never touched WebGPU (or any graphics API) before. Pairs with [[Issue 3 - WebGPU Init]], which covered how we got hold of the `GPUDevice` in the first place.

## What we built

A WebGPU "clear loop" — every animation frame, the canvas is wiped to a slowly cycling color. It's the simplest possible rendering: no triangles, no shaders, just paint the whole canvas one color. But it proves the entire WebGPU plumbing is wired correctly end-to-end and gives every later thing (triangles, textures, lighting) a foundation to stand on.

When you run `npm run dev` and open the page, you should see the whole canvas slowly cycling through colors. That's it. That's the whole feature.

## A mental model for what's even happening

A GPU is a fundamentally different kind of computer from a CPU.

- **A CPU** is a small team of generalists. Each core is very fast at any single task, but you only have a handful of them.
- **A GPU** is a small army of specialists. Each core is much slower individually, but you have *thousands* of them, all able to do similar work at the same time. That's why GPUs are good at rendering — drawing a million pixels means doing a million similar computations.

You can't talk to the GPU directly. The flow is always:

```
JavaScript ──(commands)──> GPU driver ──(executes)──> GPU memory ──(displayed)──> screen
```

Your code builds a list of commands ("clear this texture", "draw these triangles"), hands the list to the driver, and the GPU runs them on its own schedule. **WebGPU is the API for building those command lists from a browser.**

## What's a "canvas context"?

The `<canvas>` element in HTML is just a chunk of pixels that something needs to draw into. *What* draws into it depends on which **context** you ask for:

- `canvas.getContext('2d')` → old-school 2D drawing API (the one with `fillRect`, `arc`, etc.).
- `canvas.getContext('webgl')` → WebGL — the previous-generation GPU API.
- `canvas.getContext('webgpu')` → WebGPU — what we want.

A canvas can only have one context type for its lifetime. We chose WebGPU in [src/main.ts](../../../src/main.ts):

```ts
const context = canvas.getContext('webgpu');
```

Once you have the context, you need to **configure** it before WebGPU can render into it:

```ts
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format,
  alphaMode: 'opaque',
});
```

Three things going on:

- **`device`** is the GPU handle we got back from [[Issue 3 - WebGPU Init]]. The context needs to know which device will be drawing into it.
- **`format`** is the pixel layout. `getPreferredCanvasFormat()` asks the browser what format will give the cheapest "GPU memory → screen" path on this machine. On most desktops it returns `'bgra8unorm'` — blue, green, red, alpha, 8 bits per channel, normalized to a 0–1 range. We don't really need to know which it is; we just trust the browser.
- **`alphaMode: 'opaque'`** says the canvas covers everything behind it. The alternative is `'premultiplied'` for transparent overlays — useful if you wanted to see HTML through the canvas, which we don't.

## What's a "swap chain"?

Imagine drawing on one sheet of paper while showing another. As soon as you finish drawing, you flip them — now you draw on the old sheet while the new one is shown. Repeat 60 times per second.

That's a swap chain. It's a small ring of canvas-sized images. You draw into one (the "back buffer") while the browser is busy showing another. When you finish, the browser flips them: yours becomes visible, and the old visible one becomes the next thing you draw into.

The good news: WebGPU manages the whole swap chain for us automatically once we've configured the context. We just ask for "the current back buffer" every frame:

```ts
const currentTexture = context.getCurrentTexture();
```

That returns a *different* `GPUTexture` each frame — whichever one in the ring is currently your turn to draw into.

## What's "clearing"?

When a frame starts, the back buffer is leftover memory — full of whatever was drawn into it last time (or random garbage on the very first frame). Before we draw anything new and trust the result, we have to wipe it to a known starting state.

That's "clearing." Set every pixel of the buffer to one color before any actual rendering happens. In real games the clear color is usually the sky color, or pure black. Here, we're cycling through colors **so you can see, with your eyes, that something is actually happening every frame**.

## The frame loop, line by line

This is the heart of the code. Every animation frame:

```ts
function frame(): void {
  // 1. Pick this frame's clear color
  const elapsed = (performance.now() - startTime) / 1000;
  const r = 0.5 + 0.5 * Math.sin(elapsed * 0.7);
  const g = 0.5 + 0.5 * Math.sin(elapsed * 1.1 + 2.0);
  const b = 0.5 + 0.5 * Math.sin(elapsed * 1.3 + 4.0);

  // 2. Build a recipe for the GPU
  const encoder = device.createCommandEncoder({ label: 'frame encoder' });
  const pass = encoder.beginRenderPass({
    label: 'clear pass',
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: { r, g, b, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  pass.end();

  // 3. Hand the recipe to the GPU
  device.queue.submit([encoder.finish()]);

  // 4. Ask the browser to call us again before the next paint
  requestAnimationFrame(frame);
}
```

### Step 1: pick a color

We compute red, green, blue from `Math.sin(time)`. `sin` returns `[-1, +1]`, so `0.5 + 0.5 * sin(x)` returns `[0, 1]` — exactly the range WebGPU wants for color channels. Different multipliers and phase offsets for each channel means they all change at different rates, giving us a constantly evolving color instead of fading uniformly.

### Step 2: build a recipe (command buffer)

You don't issue WebGPU commands directly — you record a list of commands and submit the whole list at once. The thing that records them is called a **command encoder**:

```ts
const encoder = device.createCommandEncoder();
```

Inside the recipe, you describe one or more **render passes**. A render pass is the description of "I'm going to draw into this texture; here's what to do at the start and end of drawing":

```ts
const pass = encoder.beginRenderPass({
  colorAttachments: [{
    view: context.getCurrentTexture().createView(),
    clearValue: { r, g, b, a: 1 },
    loadOp: 'clear',
    storeOp: 'store',
  }],
});
pass.end();
```

The four key fields:

| Field | What it means |
| --- | --- |
| `view` | *Which* texture to draw into. We hand it the current back buffer from the swap chain. |
| `clearValue` | The color to wipe to. Values are 0–1 (not 0–255 like CSS). |
| `loadOp: 'clear'` | At the start of the pass, wipe everything to `clearValue`. Alternative: `'load'` (keep whatever was there). |
| `storeOp: 'store'` | At the end of the pass, keep what was drawn. Alternative: `'discard'` (throw it away — useful for temporary render targets, not for the swap chain). |

We call `pass.end()` immediately because we have nothing to draw between begin and end. The clear is implicit — it's what `loadOp: 'clear'` does. Just opening and closing the render pass is enough to wipe the texture.

The `label` strings are optional but extremely useful when debugging in browser DevTools — they show up in WebGPU error messages so you know which encoder/pass complained.

### Step 3: hand the recipe to the GPU

```ts
device.queue.submit([encoder.finish()]);
```

`encoder.finish()` seals the recipe into a `GPUCommandBuffer`. `device.queue.submit([...])` hands one or more command buffers to the GPU for execution. **The GPU runs them asynchronously** — your JavaScript thread keeps going while the GPU works.

### Step 4: schedule the next frame

```ts
requestAnimationFrame(frame);
```

`requestAnimationFrame` (aka rAF) tells the browser "call this function right before the next screen refresh." On most displays that's 60 times per second; on high-refresh-rate monitors it's 120 or 144. It's the right primitive for any per-frame work because:

- It only runs when the tab is visible (saves battery on background tabs).
- It runs synchronized with the screen, not faster (no wasted frames).
- The callback receives a timestamp so you can compute deltas between frames.

The pattern is recursive: `frame()` calls `requestAnimationFrame(frame)` to schedule itself for the next refresh. The loop runs forever, or until something stops it.

## Why bother with a cycling color?

The simplest possible version of this PR could have used `clearValue: { r: 0.1, g: 0.1, b: 0.2, a: 1 }` — a static dark blue. The canvas would turn dark blue and… look exactly like setting `background-color` in CSS.

By **animating** the color, we're proving the frame loop is actually running. If you see the color cycling on screen, you know the entire chain — JS → command encoder → GPU → swap chain → screen — is working end-to-end. That's the "Confirm the canvas updates every frame" half of the issue.

## A few small details worth knowing

- **`sizeCanvasToDisplay`** sets `canvas.width` / `canvas.height` to match its CSS pixel size. Without this, an `<canvas>` defaults to 300×150 regardless of CSS, which would give you a tiny low-res image stretched to full screen. We also clamp to `device.limits.maxTextureDimension2D` because creating a texture bigger than the device allows is an error.
- **No resize handler yet.** If you resize the window after the page loads, the canvas backing store stays the original size and looks stretched/blurry. There's a separate issue in PLAN.md for proper resize handling (also covers depth buffer + camera aspect ratio).
- **`context.getCurrentTexture()` is called *inside* the frame loop**, not once upfront. The swap chain rotates which texture is "current" between frames, so you have to ask fresh every time.

## What's next

This is the bare-minimum render. The next things in increasing order of complexity:

- **A triangle** needs vertex + fragment shaders, a vertex buffer, a render pipeline, and a `draw()` call inside the render pass.
- **3D anything** needs a perspective matrix, a depth buffer, and at least one uniform buffer to ship the matrix to the GPU.
- **Textures** need samplers, texture resources, and bind groups to attach them to a pipeline.

Each step adds setup but reuses the swap-chain plumbing we just built. The fact that we now have a frame loop calling `requestAnimationFrame` means everything we add from here just slots into "step 2" of the recipe-building.
