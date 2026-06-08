---
tags:
  - notes
phase: "2"
---
A progress bar while a scene loads. The through-line: **a progress bar is only as honest as the events it can observe** — the demo couldn't show Sponza's 50 MB load *advancing* until the loader exposed per-texture completion. The work was a seam, not UI.

## What we built

- [src/assets/gltf.ts](../../../src/assets/gltf.ts) — an optional `onProgress(loaded, total)` (`LoadProgress`) threaded through `loadGltf` → `loadTextures`, fired as each texture resolves.
- [src/main.ts](../../../src/main.ts) + [index.html](../../../index.html) — a `#progress` bar driven by `setProgress(fraction | null)`: shown at 0 before the model loads, advanced by the callback, hidden before the first frame.
- [test/unit/assets/gltf.test.ts](../../../test/unit/assets/gltf.test.ts) — `loadTextures` reports `onProgress` once per texture, climbing to the total.

## Why coarse progress would lie

The tempting cheap version — advance a bar through `initScene`'s phases (WebGPU init → load → pipelines) — *frozen-bars* on the case that matters: Sponza is a single `await loadModel(...)`, so a phase bar sits at "loading" for the whole multi-second download and tells you nothing about whether work is happening. The issue's own framing ("useful for spotting blocking work") demands sub-load granularity, and the only signal with real resolution is **per-texture completion** — Sponza's 69 textures, the bulk of the load. That's exactly what the loader didn't expose, so the feature is mostly about adding that one observation point.

## The seam

`onProgress` is an *optional* callback, so every existing caller (and the tests) is untouched — the loader stays usable without a UI. It's threaded one level (`loadGltf` → `loadTextures`) and called after each texture's `fromImageBitmap`, with a running `loaded` count against `json.textures.length`. The demo's side is a two-state helper: `setProgress(fraction)` shows + fills the bar, `setProgress(null)` hides it. Loading-vs-not is the only state worth modelling.

## Honest scope

Across the *showcase* (three separate `loadModel` calls), each reports its **own** model's count, so the bar resets per model — fine, because those loads are small and fast; the bar is there for the one slow scene, Sponza, which is a single model and so advances cleanly 0→69. Byte-level progress (streaming `fetch` + `Content-Length`) would be smoother for the 9 MB `.bin` too, but texture-count is the simple, truthful signal the issue asked for.

## Testing a boundary that needs a GPU

`loadTextures` decodes images (`createImageBitmap`) and uploads them (`Texture.fromImageBitmap`) — neither exists headless, which is why the suite had never exercised it. The progress test mocks exactly that boundary (`createImageBitmap` stub + `vi.spyOn(Texture, 'fromImageBitmap')`) and uses embedded (`bufferView`) images so there's no `fetch`, leaving the *counting* logic — the only thing under test — to run for real. Assert the callback fired N times, monotonic 1→N, total constant.

## What's next

- Phase 2 is complete. The bar will get more to show as scenes grow; byte-level progress and a live scene toggle ([[#133]]) are natural extensions.
