---
tags:
  - notes
phase: "1"
---
The first issue with real *interaction* — you can grab the cube and swing the view around it. But the lasting lessons aren't the orbit math; they're a string of architecture decisions about **what varies vs. what stays stable**, and where to put the seam between them. Most of this issue was reasoning, not typing.

## What we built

- [src/camera/camera.ts](../../../src/camera/camera.ts) — `Camera`: pure, control-neutral matrix math (eye/target/FOV → view + projection).
- [src/camera/orbitControls.ts](../../../src/camera/orbitControls.ts) — `OrbitControls`: owns the orbit parameters, listens to pointer/wheel input, pushes the result into the camera.
- [src/camera/spherical.ts](../../../src/camera/spherical.ts) — `sphericalToCartesian(...)`, the one genuinely interesting computation, extracted as a pure function so it's unit-testable.
- Wired into `main.ts`, replacing the two frozen `perspective`/`lookAt` matrices that had the eye nailed to `(0,0,5)` forever.

Plus unit tests for the `Camera` and the spherical helper.

## The through-line: separate what varies from what stays stable

The title names two things — "perspective camera" and "orbit controls" — and the whole issue is about realizing those are **not the same responsibility**, and that getting the boundary right is what makes everything after it cheap.

### Composition over inheritance: the variation isn't where it looks

The first instinct, looking ahead to fly cameras / third-person / cinematic cameras, was **subclassing `Camera`**. But hold that against the observation that *the projection and view math is identical across all of them*. If the math is the same, what actually differs between a fly camera and an orbit camera? **Not the matrices — how the camera is *driven*.** WASD-and-mouselook vs. circle-a-target vs. follow-an-animation-curve.

So those "camera types" aren't `Camera` subclasses at all — they're **controllers** operating on one shared `Camera` (the three.js model: one `PerspectiveCamera`, swappable `OrbitControls` / `FlyControls`). The variation lives in **composition** (swap the controller), not **inheritance** (subclass the camera). Why that wins concretely: if "fly vs. orbit" were subclasses, each would re-duplicate the identical projection/view math just to attach different input, and an animation-driven camera (no input at all) wouldn't fit the hierarchy. With a plain `Camera` + swappable controls, adding a fly camera later is "write a `FlyControls`" — **zero changes to `Camera`.** Open to new behavior, closed to modification.

There *is* a legitimate `Camera` subclass axis — **projection type** (`PerspectiveCamera` vs. `OrthographicCamera`), which genuinely differ in the projection math — but with one need today, that stays a single class until a real second case forces a base out. Same YAGNI applied to the controller: a concrete `OrbitControls`, not a speculative `CameraController` base with one subclass.

### Control-neutral state: the spherical params don't belong to the camera

The sharper realization came mid-build: storing `radius`/`azimuth`/`elevation` *in the `Camera`* quietly **makes it an orbit camera**. Spherical coordinates are how an orbit controller *thinks*; a fly camera thinks in position + facing. So baking them into `Camera` contradicts the whole "swap the controller" goal — the swap can't work if the camera's *state model* assumes orbit.

The fix: the `Camera` holds a **control-neutral** view — `position`, `target`, `up` — and `OrbitControls` keeps the spherical params *internally*, does the spherical→cartesian, and writes the resulting eye into the camera via `setView`. Each controller owns its own parameterization; the camera is the reusable core underneath all of them.

### Single source of truth, single writer

That immediately raises a duplication worry: "where's the eye?" now seems to live in two places — the controller's spherical state *and* `camera.position`. The resolution is the distinction that matters: **duplication only desyncs when there are two independent *writers*.** Here there's one authority (the controller's spherical params) and one **derived** value (`camera.position`), written **one-directionally** every frame. The camera's position is a *snapshot it's handed*, not a competing source of truth — exactly like the CPU-side MVP matrix being the authority and the GPU uniform buffer being a mirror nobody edits on its own. (The more robust variant — make `camera.position` authoritative and have the controller hold only input *deltas*, reading the camera each frame — is what three.js actually does; deferred, since one camera + one controller doesn't need it.)

## The `[0,0,0]` coincidence, a fourth time

The eye is computed as `target + offset`. Twice during this issue that `+ target` went missing — once in the camera's first draft, once in the controller — and **both times it passed every check**, because `target` is `[0,0,0]` today and `position + [0,0,0] === position`. The same origin-special-case that masked the cube's MVP fusion and the earlier eye/target bugs. The rule worth burning in, restated for this issue: **when you change what a field *means* (here `position` went from "offset from target" to "the eye itself"), audit every line that reads it** — the arithmetic that was correct for the old meaning is silently wrong for the new one, and the types won't catch it.

## DOM event listeners (the genuinely new mechanism)

The orbit *math* was familiar; the **input** wasn't. A few things that are easy to get wrong:

- **You register callbacks; the browser calls them.** `element.addEventListener('pointermove', handler)` — the browser invokes `handler` with an **event object** (`clientX/clientY`, `deltaY`) whenever that event fires. A drag is *three* events with state between them (`pointerdown` → many `pointermove` → `pointerup`), which is why the controller tracks `isDragging` + `lastPointer`.
- **`this` binding.** A normal method passed to `addEventListener` loses its `this` when the browser calls it. **Arrow-function class fields** capture `this` lexically, so `this.orbitState` resolves correctly — and they give you a *stable reference*.
- **Removal needs the same reference.** `removeEventListener` only works with the exact function object you added — an inline `(e) => {…}` can never be removed. Arrow-field handlers are removable; that's *why* we use them.
- **`dispose()` prevents leaks.** A listener keeps the handler (and, through its closure, the whole `OrbitControls` and `Camera`) alive on the canvas. Without symmetric teardown, a discarded controller keeps firing and can't be collected.
- **Pointer capture** (`setPointerCapture` on `pointerdown`) keeps `pointermove`/`pointerup` flowing even when the cursor leaves the canvas — without it, releasing the button off-canvas leaves the drag "stuck on."

## Clamps are correctness, not preference

Two clamps aren't about feel — they prevent **degenerate matrices**:

- **Elevation** must stop short of the poles (≈ ±89°). At the pole the look direction is parallel to world-up and `lookAt` collapses — the view flips.
- **`minRadius` must be > 0.** Radius 0 puts the eye *on* the target; the view direction is zero-length and `lookAt` produces NaNs. You can never be allowed to zoom onto the target.

## Extracting a pure function for testability

The spherical→cartesian conversion started life as a private getter inside a DOM-driven class — untestable without simulating mouse events. Pulling it out into a standalone `sphericalToCartesian(radius, azimuth, elevation)` did double duty: it made `OrbitControls` read cleaner *and* turned the one piece of real math into something you can pin with known inputs → known outputs (`az=0, el=0, r=5 → (0,0,5)`; `el=90° → (0, r, 0)`). The general move: when the interesting logic is trapped inside event handlers, **extract the pure core** — the handlers stay a thin, manually-verified shell, and the math gets real tests. The `Camera` itself is pure too, so its `setView`/derived-matrix behavior is tested directly (no GPU, no mock). `OrbitControls`' DOM handlers are left to manual/visual verification by deliberate choice — synthetic pointer events would be a lot of jsdom machinery for little signal.

## Scope: still one MVP uniform

Per #13, this issue does **not** split bind groups. The camera produces a `viewProjection`, `main.ts` combines it with the model matrix on the CPU exactly as before, and writes the one existing uniform. The real per-frame group (group 0) waits until the per-object group has an owner too — the **scene `Node`** — so the split happens once, with both ends present, rather than half-done here.

## What's next

- **Scene graph `Node`** — local transforms + recursive world matrices. The per-object (group 2) owner, and the other half of the bind-group split.
- **Resize handling** — the camera's `aspectRatio` is fixed at construction today; a debounced resize observer will update it (and the depth texture) when the canvas changes.
- A future `update()`-based controller loop if damping/inertia is ever wanted (today's controls apply immediately on input).
