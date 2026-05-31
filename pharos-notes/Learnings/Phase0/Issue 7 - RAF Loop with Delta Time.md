---
tags:
  - notes
phase: "0"
---
A small but important refactor: turning the ad-hoc frame loop into the shape real engines use — a **delta-time game loop** with a clean **update / render** split. Follows [[Issue 6 - Textured Spinning Cube]], which left us with a working `requestAnimationFrame` loop that computed the cube's rotation directly from total elapsed time.

## What we built

No visible change — the cube spins exactly as before. The point was *structural*: rewrite the loop so animation is driven by **delta time** (the seconds between frames) and split each frame into a distinct `update(dt)` step and `render()` step. That's the foundation every future moving thing (input, physics, a moving camera) will build on.

## The key idea: closed-form vs stateful

The old loop was **closed-form**: every frame it recomputed `angle = elapsed` from scratch, as a direct function of total time. That works, and it's even frame-rate independent — but only for motion you can write as a formula of time.

The new loop is **stateful**: it keeps a persistent `rotationAngle` and *accumulates* it each frame (`rotationAngle += ANGULAR_SPEED * dt`). You need this the moment motion depends on something that changes over time — hold a key to speed up, gravity, friction, a collision. There's no closed-form `f(elapsed)` for those; you have to step the state forward a little each frame. Physics is the headline example.

## Delta time and frame-rate independence

`dt` is the seconds elapsed since the previous frame. Why it matters — three ways to spin a cube, on a 60 fps vs a 144 fps monitor, after one real second:

| Approach | 60 fps | 144 fps | Frame-rate… |
| --- | --- | --- | --- |
| `angle = elapsed * speed` (closed-form) | `speed × 1` | `speed × 1` | **independent** ✓ |
| `angle += 0.01` per frame (fixed step) | `+0.60` | `+1.44` | **dependent** ✗ (2.4× faster!) |
| `angle += speed * dt` (integrated) | `speed × 1` | `speed × 1` | **independent** ✓ |

The middle row is the classic bug: a fixed increment per frame runs faster on a faster display. Multiplying by `dt` fixes it — `position += 5 * dt` moves 5 units per *second* no matter the frame rate. So `dt` is what lets us accumulate state (which we need for anything input-driven) *without* re-introducing frame-rate dependence.

## The update / render split

```
frame(now):
  dt = (now - lastTime) / 1000   // seconds since last frame
  lastTime = now
  update(dt)                     // advance the world: rotationAngle += speed * dt
  render()                       // read the world, build MVP, draw
  requestAnimationFrame(frame)
```

- **`update(dt)`** mutates state. Nothing to do with the GPU.
- **`render()`** reads the current state and draws it. No state changes.

Keeping them separate is what lets you later add input handling or a fixed-timestep physics sub-loop without untangling simulation from draw calls. The `now` timestamp comes free as the argument `requestAnimationFrame` passes to its callback — more accurate than calling `performance.now()` inside the frame.

## The gotcha: units

`dt` came out as `now - lastTime`, which is in **milliseconds** (both `performance.now()` and the rAF timestamp are ms). But `ANGULAR_SPEED` is radians per **second**. Mixing them would add ~16.7 radians per frame at 60 fps — about 2.6 full turns *per frame*, an unreadable blur. The fix is `/ 1000` to convert to seconds.

This is the same lesson as the byte-vs-float strides in [[Issue 6 - Textured Spinning Cube]]: **whenever two quantities meet in a formula, check their units agree.** Rates are "per second," so `dt` must be in seconds.

## What's next

The loop is now ready to be *influenced* rather than just play back a fixed animation:

- **Input** — read keyboard/mouse in `update(dt)` to drive rotation, a camera, or movement.
- **A fixed-timestep sub-loop** — for stable physics, accumulate `dt` and step the simulation in fixed slices, interpolating the render. (Only needed once real physics arrives.)
- **Resize handling** ([Issue #19]) — a debounced `ResizeObserver` to update the canvas, recreate the depth texture, and refresh the projection aspect, fixing the stretch-on-resize.
