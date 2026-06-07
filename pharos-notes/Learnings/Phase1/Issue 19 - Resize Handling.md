---
tags:
  - notes
phase: "1"
---
Make the scene survive a window resize. The through-line: **resize is a *consistency* problem.** Three things are pinned at construction — the canvas drawing buffer, the depth texture, and the camera's aspect ratio — and they have to move **together**. Update one without the others and you either see a distorted image or crash the render pass.

## What we built

- [src/camera/camera.ts](../../../src/camera/camera.ts) — `setAspectRatio(n)` (the projection is derived per frame, so it just stores the value).
- [src/main.ts](../../../src/main.ts) — a `createDepthTexture` helper; `startRenderLoop` now **owns** the depth texture as mutable state and runs a frame-coalesced resize via a `ResizeObserver`.
- [test/unit/camera/camera.test.ts](../../../test/unit/camera/camera.test.ts) — `setAspectRatio` updates the projection.

## The bug that wasn't (yet)

The expected story was "resize → distortion *and* a crash." Only the distortion showed. Why: the canvas **drawing buffer was also frozen** (`sizeCanvasToDisplay` ran once), so the color target (which auto-sizes to `canvas.width/height`) and the depth texture stayed the **same** size — internally consistent, no validation error. What you saw was the browser **CSS-stretching** a fixed-resolution buffer to fill the resized element: deformation + blur, but no crash.

The fatal bug is one the *fix* introduces: a render pass requires its color and depth attachments to be the **same size**. The instant you start resizing the drawing buffer, the color target grows — and if you don't recreate the depth texture to match, the sizes disagree → WebGPU validation error. So "recreate the depth texture" isn't cleanup; it's what keeps the resize from crashing. The three updates are a package:

1. **Resize the drawing buffer** (`canvas.width/height`) → matches the display box, killing the CSS stretch + blur.
2. **Recreate the depth texture** at the new size → stays consistent with the grown color target.
3. **Update the camera aspect** → projection matches the new buffer.

## Ownership: the loop owns what changes

`render()` calls `depthTexture.createView()` every frame, so recreating the texture *elsewhere* leaves the loop holding a stale reference. Fix: `startRenderLoop` **owns** the depth texture as a `let` and recreates it in place, so `render()` always reads the current one. (Reassigning the *parameter* would trip `no-param-reassign` and read badly — own it as local state instead, and drop the now-unneeded `depthTexture` parameter.) Recreate also `destroy()`s the old texture — otherwise every resize leaks a depth buffer on the GPU. General rule: **the thing that mutates should live with the code that reads it.**

## Debounce: coalesce to the frame, don't time it

`ResizeObserver` fires in bursts during a drag. Two ways to "debounce":
- **Timer:** `clearTimeout` + `setTimeout(apply, ~100ms)`.
- **Frame-coalesced (chosen):** the observer just sets `needsResize = true`; the top of `frame()` applies it once and clears the flag.

The frame-coalesced version wins here because **all GPU-resource churn happens on the render timeline**, right before drawing — never mid-event-handler, and bursts naturally collapse to one rebuild per frame. No timer to tune.

Two small gotchas: `ResizeObserver` fires **once immediately** on `observe()`, so the resize path runs on the first frame too (harmless — same dims, one extra rebuild at startup); and `sizeCanvasToDisplay` clamps to `max(1, …)`, so a collapsed/hidden element never produces a 0-size texture.

## Scope

Closes out the *core* of Phase 1 — the rendering API now handles a live, resizable surface. The observer isn't disconnected (no teardown path exists for the loop yet); worth revisiting if a teardown lands.

## What's next

- **Instancing (#113)** — collapse the 100-cube draw calls into one; re-measure against #18's baseline.
- Phase 1's remaining items are now optimizations/edge cases (#113 instancing, #106 cycle guard).
