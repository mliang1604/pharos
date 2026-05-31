---
tags:
  - notes
phase: "0"
---
Our first piece of **tooling**: a tiny read-only debug overlay showing **FPS, frame time, and draw calls**, drawn as a canvas-2D layer on top of the WebGPU canvas and toggled with the backtick key. Builds on the delta-time loop from [[Issue 7 - RAF Loop with Delta Time]], hooking a single `hud.frame(now, drawCalls)` call into the existing `frame(now)`.

## What we built

A `createHud(canvasElement)` **factory** (in `src/debug/hud.ts`) that returns `{ frame }`. Each frame it samples timing, and four times a second it recomputes three cached strings and paints them onto a sibling `<canvas id="debug-hud">` stacked over `#app`. Backtick (`` ` ``) hides/shows it.

## Frame time vs FPS

Frame time (ms per frame) is the **fundamental** measurement; FPS is just its reciprocal:

```
fps = 1000 / frameTimeMs
```

A useful sanity check falls out of this: the two numbers can never be independent. If the HUD ever shows `FPS: 100` *and* `Frame Time: 100 ms`, something is broken — at 100 fps the frame time must read ~10 ms. (That exact mismatch is how we'd catch a stale or frozen readout.)

## Windowed averaging: sample every frame, display rarely

The core design idea. We **sample every frame** (increment a `frameCount`) but only **refresh the displayed numbers every 250 ms**. Decoupling the two cadences matters for two reasons: updating text 60–144×/sec is wasted work, and a number that flickers faster than the eye can read is useless.

Crossing the 250 ms threshold tells you *when* to refresh; the average over the window tells you *what* to show. Both fall out of two accumulators:

```
avg_fps        = frameCount / windowMs * 1000
avg_frametime  = windowMs / frameCount
```

For timing the window we used a **timestamp delta** (`now - lastHudUpdate >= 250`) rather than accumulating `dt`. It needs only one remembered number, and on fire we snap `lastHudUpdate = now` — *not* `+= 250` — which avoids drift and a catch-up burst after a long frame.

## Factory vs class, and a real closure gotcha

We used a **factory function** over a class: the rest of the codebase is closures (see `startRenderLoop`), closure variables are genuinely private with no `this` to bind, and there's only ever one HUD instance — so a class earns nothing here.

But the choice surfaced a subtle TypeScript behavior worth keeping. The 2D context is guarded once:

```ts
const ctx = canvasElement.getContext('2d'); // CanvasRenderingContext2D | null
if (!ctx) throw new Error(...);
// ctx is now narrowed to non-null...
```

That narrowing is **preserved inside an arrow function** assigned after the guard — but **not inside a hoisted `function` declaration**. A hoisted declaration can, in principle, be called before the guard ever runs, so TypeScript conservatively widens `ctx` back to `... | null` inside it (`TS18047: 'ctx' is possibly 'null'`). TypeScript 5.4+ preserves narrowing into closures created *after* the last assignment, and a hoisted declaration has no well-defined "after." Making `frame` an arrow (`const frame = () => {...}`) keeps the narrowing and drops the redundant guard. Same family as the no-`!` scoping lesson from [[Issue 5 - Hardcoded Triangle]].

## Two gotchas

- **Seed the timing baseline.** Initializing `lastHudUpdate = 0` makes the *first* window measure from the page-load time origin (hundreds of ms), producing one garbage reading. Seeding it with `performance.now()` at construction fixes it — rAF timestamps and `performance.now()` share a time origin, so they're directly comparable.
- **`vite preview` base path.** The build bakes `base: '/pharos/'` into the HTML (for the GitHub Pages project site), but `vite.config.ts` keyed the base off `command`, which is `'serve'` for **both** dev *and* preview — so preview served assets at `/` while the HTML asked for `/pharos/`, returning the SPA fallback HTML in place of the JS and freezing on "Loading…". Keying off `mode` (`'production'` for both build and preview) fixes it. Shipped as a separate commit in this PR.

## Things deliberately left as stubs

- **Draw calls = `1`, hardcoded.** There's exactly one `drawIndexed` per frame today, so the render loop reports a literal `1` into the HUD. The seam is right (the HUD is a passive display; the count is reported *in*), but it will lie the moment a second draw site appears — flagged with a `TODO` at the call site.
- **Toggle is desktop-only.** It listens for a physical-key `keydown` (`event.code === 'Backquote'`). Phones have no hardware keyboard, a `<canvas>` can't summon the soft keyboard, and `event.code` is unreliable on virtual keyboards — so on mobile the HUD just stays on. Fine for a dev tool.

## An aside the HUD already earned its keep on

On a 144 Hz monitor the dev build sat at ~100 fps / ~10 ms, not 144. That's the HUD doing its job: `requestAnimationFrame` is capped *at most* to the display refresh rate, but the observed rate is `min(refresh, how fast the frame loop completes)`. Sitting below the ceiling means we're limited by per-frame work (dev-mode overhead), not vsync — exactly the gap a profiler exists to surface.

## What's next

- A **real draw-call counter** once there's more than one draw site (increment per draw, read+reset per frame).
- More debug surfaces in `src/debug/` — the folder anticipates inspectors and perf graphs later.
