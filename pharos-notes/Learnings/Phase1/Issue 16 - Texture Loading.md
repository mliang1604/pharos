---
tags:
  - notes
phase: "1"
---
Replacing the procedural checkerboard with a real image pulled from a URL. The through-line: **loading is a chain of format conversions, and at each link the GPU does nothing implicitly** — bytes → decoded pixels → a texture object → a *filled* mip chain. Every hand-off is a step you have to spell out, and most have a gotcha that fails silently (wrong colors, black mips, no filtering) rather than throwing.

## What we built

- [src/gpu/texture.ts](../../../src/gpu/texture.ts) — `Texture`: an async loader that fetches an image URL and produces a mipmapped `GPUTexture` + a `GPUSampler`, exposed as `public readonly` (same shape as `UniformBuffer`).
- [test/unit/gpu/texture.test.ts](../../../test/unit/gpu/texture.test.ts) — 7 tests over a mocked device + stubbed `fetch`/`createImageBitmap`.
- `public/textures/uv-grid.png` — a generated 8×8 UV-grid test asset (Vite serves `public/` at the root, so the URL is `/textures/uv-grid.png`).
- `main.ts` — swapped the inline checkerboard for `await Texture.load(...)`; `initScene` became `async`.

## The async-factory pattern

Loading is asynchronous (fetch + decode), but **constructors can't be `async`** — they can't `await` and must return the instance, not a `Promise`. So the shape is a `private constructor` plus a `static async load(...)` that does all the awaiting and only calls the constructor once the finished resources exist. The constructor stays trivial and synchronous; all the I/O lives in the factory. General pattern for "an object whose construction needs `await`."

## The conversion chain (and each gotcha)

1. **Fetch → bytes.** `fetch(url)`, guard `res.ok` (a 404 returns a `Response`, it doesn't throw), then `res.blob()`.
2. **Decode → pixels.** `createImageBitmap(blob)` turns compressed file bytes into a decoded, GPU-uploadable `ImageBitmap`. The raw PNG bytes are *not* something the GPU can read; decode is a distinct step.
3. **Allocate → a texture.** `device.createTexture({...})`, with two non-obvious choices:
   - **`format: 'rgba8unorm-srgb'` (color-space gotcha).** Image files store color sRGB-encoded. Sampling as plain `rgba8unorm` hands the shader sRGB numbers as if they were linear → wrong lighting/washed-out color. The `-srgb` format makes the GPU decode sRGB→linear on every read. (The checkerboard used plain `rgba8unorm` and got away with it because pure black/white is identical in both encodings.)
   - **`usage` includes `RENDER_ATTACHMENT` (counterintuitive).** A texture you only *sample* still needs to be a render target here — because mip generation **renders** into the smaller levels.
4. **Upload → level 0.** A decoded image uses `queue.copyExternalImageToTexture(...)`, **not** `writeTexture`. `writeTexture` is for raw byte arrays (the checkerboard); `copyExternalImageToTexture` takes an `ImageBitmap`/canvas/video directly. It only fills **mip level 0**.

## Mipmaps: allocated ≠ filled

A mip is one downscaled copy of the texture; the mipmap is the whole stack (full-res down to 1×1). They exist to stop **minification aliasing** — when a surface is far away, one screen pixel covers many texels, and reading a single texel makes the surface shimmer as the camera moves. The GPU instead reads a pre-shrunk level matching the on-screen size.

- **Count:** `floor(log2(max(w, h))) + 1` — how many halvings of the longer side reach 1×1, plus level 0.
- **The trap:** `mipLevelCount` only *allocates* the levels. WebGPU has **no built-in generator**, so levels 1…N start **black** until you fill them yourself.
- **Generation (manual render approach):** for each level `i`, draw a fullscreen triangle that samples level `i−1` (linear) into level `i`. One render pipeline (a tiny blit shader), one pass per level, each binding `i−1`'s view as source and `i`'s view as the color attachment via `createView({ baseMipLevel, mipLevelCount: 1 })`.
- **Why no manual barriers:** all passes go on one encoder and execute in submission order, so pass `i` reading level `i−1` always sees what pass `i−1` wrote. The ordering *is* the dependency.
- **The sampler must opt in:** `mipmapFilter: 'linear'` is the line that actually engages the chain (trilinear — blends between the two nearest levels). Without it the mips you built are ignored.

## Bugs worth remembering

The class came together through a string of small, instructive failures:

- **`return texture;`** returned the raw `GPUTexture` where the signature promised `Promise<Texture>` — the factory has to finish (sampler + mips) and `return new Texture(...)`.
- **`{ resource: { buffer: srcView } }`** — a `GPUTextureView` is bound **directly** (`resource: srcView`); the `{ buffer }` wrapper is only for buffer bindings.
- **`format: string`** was too loose — WebGPU wants the `GPUTextureFormat` union; plain `string` isn't assignable.
- A **semicolon inside an object literal** is a parse error that masks every other error behind it (tsc bails at the first syntax failure), and an **unfinished loop** surfaced as "declared but never read" for the variables the missing render pass would have consumed.

Lesson: a clean `typecheck` is a sequence of unblockings — fix the syntax error first, then the type errors it was hiding appear.

## Testing a GPU loader without a GPU

No device or browser in Node, so the test mocks the `GPUDevice` (every method a `vi.fn`, `createTexture` echoing its descriptor) and stubs `fetch`/`createImageBitmap`. That lets us assert the *contract* — mip count from image size (incl. non-power-of-two flooring), the sRGB format + the three usage flags, one downsample pass per level (8 for a 256² image), `mipmapFilter: 'linear'` on the returned sampler, and a thrown error on a failed fetch. Behavior visible at the API boundary, no pixels required. (The actual pixels were checked by running the app.)

## What's next

- **Wire textures through the material/bind-group path** properly once the per-object group lands.
- **glTF loaders (#20+)** will reuse this loader for image-based material textures.
