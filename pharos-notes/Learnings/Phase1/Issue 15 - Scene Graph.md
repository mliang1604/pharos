---
tags:
  - notes
phase: "1"
---
The first piece of *retained* spatial structure — and the per-object owner that's been foreshadowed since #13 ("`Node` → group 2"). Like the camera issue, almost all of the work was reasoning, not typing. The whole issue collapses to a single idea: **a transform matrix is a cache derived from TRS, and a scene graph is that cache replicated down a tree.** Every decision below — two dirty flags, the direction invalidation flows, the encapsulation contract — falls out of taking that one sentence seriously.

## What we built

- [src/scene/node.ts](../../../src/scene/node.ts) — `Node`: TRS as the source of truth, `parent`/`children` links, and lazily-cached local + world matrices guarded by a two-flag dirty system.
- [test/unit/scene/node.test.ts](../../../test/unit/scene/node.test.ts) — 12 tests across local transform, hierarchy, invalidation, parenting, and the encapsulation contract.

## The through-line: source vs. derived

The central reframing: TRS and the matrices aren't two peer concerns sitting side by side. One is **source** (authored truth), the other is **derived** (a computed cache).

- **TRS is the source.** It's what you'd edit in an inspector, key in an animation, or interpolate. Interpolation is the decider: you can `slerp` a quaternion and `lerp` a position and get something meaningful — you *cannot* blend two `Mat4`s component-by-component without shear/skew falling out. So the editable, animatable truth has to live decomposed.
- **The `Mat4` is derived** — a cache computed from TRS, in the one form the GPU consumes.

Name the general pattern, because it's what the rest of the issue implements: **cache invalidation in a dependency tree.** The world matrix is a memoized function of `(parent.world, local)`; change an input and the output — plus everything downstream of it — goes stale. Same idea as a spreadsheet recalculating dependent cells, or a build system rebuilding downstream targets. A "dirty flag" is just the bookkeeping for "my cached derived value is stale because a source it depends on changed."

### Two dirty flags, not one

The local and world matrices are *both* caches, but they go stale under **different** conditions, and that asymmetry is the whole argument for two bits:

- **local** is stale iff *this node's own* TRS changed.
- **world** is stale iff *this node's own* TRS changed **OR any ancestor's** did.

Move a tank and the turret parented under it keeps a perfectly valid *local* matrix (its own TRS never changed) but a stale *world* matrix (`tank.world × turret.local`, and `tank.world` moved). One flag couldn't tell the turret "rebuild only your world (one matrix multiply)" from "rebuild your local too (a full T×R×S recompose)." Conflating them would force needless TRS→matrix recomposition down the whole subtree — exactly the work the second bit exists to avoid.

### Invalidation flows down; recompute flows up

These are mirror-image passes, and keeping them separate is what makes the system cheap.

**Write side — mark dirty (cheap, no math).** A setter stores the value and flips flags: on the touched node, both `localDirty` *and* `worldDirty`; on every descendant, `worldDirty` *only* (their locals are untouched). A nice consequence: the downward mark can **short-circuit** — if you reach an already-`worldDirty` node, stop, because a dirty node guarantees all its descendants are already dirty (a node only clears `worldDirty` by being read, and reading forces the whole ancestor chain to recompute). Repeated moves before a read cost O(1), not O(subtree).

**Read side — recompute (lazy).** `getWorldMatrix()` rebuilds `local` if `localDirty`, then `world` if `worldDirty`, then **clears the flag** — that last step is the difference between a cache and a recompute-every-call. It gets a fresh parent world by calling the *same method* on the parent (`parent.getWorldMatrix()`) — the recursion up the chain mirrors the mark-dirty walk down it. Base case at the root: with no parent there's no enclosing transform, so `world = local`. (Conceptually the root's "parent" is the world frame = identity, and `identity × local = local` — so the special-case is the multiply provably collapsing, not a shortcut.)

## Encapsulation: closing the door *and* the windows

The dirty flags only work if every mutation funnels through code that flips them — so TRS became private backing fields with a single mutation path. But privacy on the *field* isn't enough; there were two leaks to close:

- **The getter window.** A getter that returns the internal `Vec3` hands out a live reference — `node.scale[0] = 2` then mutates internals with the setter never called, and the cache silently lies. Fix: getters **clone out**.
- **The constructor window.** `this._position = position` aliases the caller's array; they can mutate it later and change the node behind its back. Fix: constructor **clones in**, same contract as the setters.

A sharp sub-lesson: TypeScript's `readonly` is **compile-time only**, and `Vec3` is `Float32Array`-backed — `readonly` won't stop `arr[0] = …` at runtime the way it would on a `readonly number[]`. The runtime guarantee is an actual clone. (We *did* use `readonly Node[]` for the `children` getter — but knowingly, as a cheap compile-time guard against `node.children.push(...)` desyncing the hierarchy, not as a hard guarantee, and specifically to avoid a per-frame copy on a tree the renderer walks every frame.)

### The wgpu-matrix copy-direction gotcha

`vec3.copy(a, dst)` copies `a` **into** `dst`. The first draft of the setter had `copy(this._position, newValue)` — backwards: it overwrote the *caller's* array with the old value and left the field unchanged, so setting a position silently did nothing. The lesson that generalizes: with dst-style math libraries, the destination is the **last** argument; trace the data direction, don't eyeball the call.

## Lifetime ownership: own one buffer

Same through-line as Mesh/Material. The world rebuild first reallocated a fresh `Float32Array` every call (`this._worldMatrix = mat4.multiply(...)`), which on a per-frame hot path is pure GC churn. Passing `this._worldMatrix` as the `dst` argument writes **into** the buffer allocated once at construction — the node owns one matrix buffer for its whole life. The flip side, documented deliberately: `getWorldMatrix()` returns that **live internal reference** (no clone) — the one place we trade the clone-everywhere TRS discipline for hot-path speed, with a comment so the inconsistency is intentional, not an oversight.

## Parenting: two halves of one link

`parent` and `children` are a single relationship stored from both ends, so they must move together. `addChild`/`removeChild` keep them in sync, and `addChild` re-parents by routing through `removeChild` (DRY — the "detach from old parent" logic lives in one place). Re-parenting invalidates the child's **world** only: its ancestry changed but its own TRS didn't, so `localDirty` stays put — the same asymmetry as a parent move, applied to a structural change instead of a transform change.

## Scope & deferred

- **Cycle guard → [#106](https://github.com/mliang1604/pharos/issues/106).** `addChild` doesn't check whether the new child is already an ancestor; a cycle would make `getWorldMatrix` recurse forever. An ancestor-walk on every parenting op is real cost to catch a caller bug that shouldn't happen, so it's filed as a follow-up with the policy decision (always / debug-only / documented-only) left open.
- **Not yet wired into the renderer.** `Node` is built and tested in isolation; the engine still drives the cube through the one MVP uniform. Feeding world matrices into a per-object (group 2) uniform — finally completing the #13 bind-group split now that both ends (camera → group 0, `Node` → group 2) exist — is a consumer step, not part of this issue.

## What's next

- **Wire `Node` into the render path** and perform the per-frame / per-object bind-group split foreshadowed in #13.
- **Resize handling (#19)** — the camera's `aspectRatio` is still fixed at construction.
