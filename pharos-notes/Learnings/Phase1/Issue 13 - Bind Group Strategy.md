---
tags:
  - notes
phase: "1"
---
A different kind of issue from the two before it. [[Issue 11 - Mesh Class]] and [[Issue 12 - Material and Shader]] each *built a thing*; this one **defines a convention** — and most of the work is deciding how much of it to apply *today* versus leave for the issues that naturally own it. The deliverable is small (one constants file, a comment, a doc line), but the reasoning behind why it's small is the whole point.

## What we built

- [src/materials/bindGroups.ts](../../../src/materials/bindGroups.ts) — the bind-group convention encoded as a typed `BindGroup` constant plus a derived union type, with the convention itself documented in the doc comments.
- A one-line honest comment in [src/materials/material.ts](../../../src/materials/material.ts) explaining why its `setBindGroup` still says `0`.
- A tense-and-truth nudge to the "Shared constants" bullet in [docs/architecture/project-structure.md](../../../docs/architecture/project-structure.md).

No shader changes, no `main.ts` changes, **no tests.** The cube renders byte-identically because nothing behavioral changed.

## Why bind groups are grouped at all: update frequency

The convention is *group 0 = per-frame, 1 = per-material, 2 = per-object*. The first thing to understand is that those three labels are all measuring **one axis: how often the data changes**, and therefore how often you'd have to re-bind it.

The cube today dumps everything — its transform, its texture, its sampler — into a single `@group(0)`, and that's fine for one cube. The payoff of splitting appears when the scene grows. WebGPU lets you set each group independently, so you bind each only as often as its data actually changes:

```
setBindGroup(0, camera)          // ONCE for the whole frame
for each material (×10):
  setBindGroup(1, material)       // ONCE per material
  for each object using it:
    setBindGroup(2, transform)    // per object
    draw()
```

1,000 objects sharing one camera and ten materials upload the camera **once** instead of 1,000 times, and bind each texture **ten** times instead of 1,000. Grouping by update frequency is what makes that possible — and it's also *why* renderers sort their draws by material: group 1 sits still while you rip through everything that shares it.

## The realization: the MVP was a fusion

The detail that reframes the whole issue: the cube's one uniform, `mvpMatrix`, is built as `projection · view · model`. Map each factor onto the frequency axis:

| factor | rate | belongs in |
| --- | --- | --- |
| `projection · view` | per-frame (the camera) | group 0 |
| `model` | per-object (this cube's spin) | group 2 |

The combined MVP is **two different update rates fused into one binding.** "Put the MVP in group 0" was never *correct* under the convention — it was *convenient*, and convenient only because there is exactly **one** cube: with a single object, per-frame and per-object happen at the same instant, so fusing them costs nothing. The moment a second cube shares the camera, that fused matrix forces you to re-upload the camera per object — the exact waste the convention exists to prevent. (The texture and sampler, by contrast, are cleanly per-material — they don't fuse with anything.)

## The coupling: you can't half-apply this

Defining the convention immediately surfaces that **`Material`'s real home is group 1 (per-material)**, not group 0 — a material *is* per-material data. But you can't just change `Material.bind` to `setBindGroup(1, …)` and stop, because then nothing feeds the shader's group 0 (viewProj) or group 2 (model), and the cube goes blank. Applying the convention to `Material` *forces* the full three-way split: a restructured shader (`clipPosition = viewProj * model * position`), separate per-frame and per-object uniform buffers, and someone to own and bind each group. **"Define the convention" and "apply the convention" are coupled** — there's no clean halfway point.

## The scope decision, and the debt question

That coupling made scope the real decision. Two honest ends:

- **Option A — define now, apply when the pieces exist.** Encode the constants, document the convention, and leave the cube as a labelled single-group case.
- **Option C — full three-way split now.** Make the convention real immediately.

The deciding question was whether deferring the split creates technical debt — and the roadmap answers it. The **three issues that come right after this one** each own a piece of the split:

| group | owned by |
| --- | --- |
| 0 — per-frame (viewProj) | **Perspective camera** (the very next issue) |
| 2 — per-object (model) | **Scene graph `Node`** (local transform → world matrix) |
| — validates it at scale | **Render 100 cubes with unique transforms** |

So the split isn't *unscheduled* work that A sweeps under a rug — every piece is owned by a named, sequenced issue that has to touch bind groups regardless. That inverts the debt intuition:

- **Deferring costs ~nothing extra later** — A declines to *duplicate* work #14 and the `Node` issue must do anyway.
- **Doing it now (C) costs more and risks real debt** — you'd build the group-0 (camera) and group-2 (transform) plumbing *without* the `Camera` and `Node` abstractions meant to own it, and the next issue would refactor your scaffolding. Premature plumbing that gets rewritten is the debt.

The general principle worth keeping: **establish the contract before you can consume it.** A convention's *durable* artifact — the named constants other code builds against — has value the moment it exists, even if no running code applies it yet. `bindGroups.ts` is exactly that: the shared numbering the camera, `Node`, and 100-cubes issues will all agree on, so they don't each invent their own.

## Encoding it: `as const` object over numeric `enum`

The constant is a closed set of three values with names, which is the textbook spot to reach for an `enum`. We didn't. The shape is an `as const` object plus a value-union type derived from it:

```ts
export const BindGroup = { PerFrame: 0, PerMaterial: 1, PerObject: 2 } as const;
export type BindGroup = (typeof BindGroup)[keyof typeof BindGroup]; // 0 | 1 | 2
```

(The value and the type deliberately share the name `BindGroup` — `BindGroup.PerFrame` is the value, `: BindGroup` is the type.)

The tempting reason to avoid an enum — "renumbering shifts everything" — actually *doesn't* apply here: these indices aren't ours to renumber. `@group(0)` in the WGSL and `setBindGroup(0, …)` in the API are a hard contract; group 0 must be 0 on both sides. The *real* reasons modern TypeScript steers away from numeric enums are sharper:

- **A numeric enum doesn't pin the value.** `const slot: BindGroup = 7` compiles with no error for a numeric enum (legacy bit-flag behaviour), and `BindGroup.PerObject + 1` stays typed as the enum. The `as const` union genuinely closes the set to `0 | 1 | 2` — a stray `7` is a compile error.
- **It emits runtime baggage** — a numeric enum compiles to a two-way reverse-mapping object you don't need.
- **It fights this repo's build** — with `isolatedModules` and `verbatimModuleSyntax` on, `const enum` is out and plain enums have erasability quirks. The `as const` object sidesteps all of it.

And the point that's easy to miss: the *type* exists for **our** benefit, not WebGPU's. `setBindGroup`'s index parameter is just `number` — the runtime value is all the API needs. The `0 | 1 | 2` union is what lets *our* future code (a function that takes "a bind-group slot") reject a stray index at compile time.

## Honesty over a tidy-looking constant

The one way Option A *could* create debt is dishonesty. It would look tidy to replace `Material`'s magic `setBindGroup(0, …)` with `setBindGroup(BindGroup.PerMaterial, …)` — but that's a lie: the cube's single group holds per-frame **and** per-material **and** per-object data fused, not just material data. Naming it `PerMaterial` would mislead the next reader. There is no honest single constant for "everything," so the literal `0` stays, and a comment tells the truth: it's a single-group degenerate case (one object, one material, no camera → the three rates collapse), and the real split lands with the camera and the scene `Node`. **A comment that admits a temporary conflation is worth more than a constant that hides it.**

## A small cross-platform gotcha

The file was first saved as `bindgroups.ts` (lowercase `g`). On Windows that's the *same file* as `bindGroups.ts` — the filesystem is case-insensitive — so it works locally and hides the problem. But CI and the GitHub Pages build run on **case-sensitive Linux**, where `import … from '@/materials/bindGroups'` would not find `bindgroups.ts` and the build would break. "Works on my machine," exactly. The fix is a case-only rename (do it through the editor, since a plain `mv` can silently no-op on a case-insensitive FS). Worth remembering for every future file: the import path's casing is load-bearing, and your local machine won't tell you when it's wrong.

## What's next

- **Perspective camera (#14)** — builds the per-frame group (group 0, view-projection) for real, and is the natural moment the cube's fused MVP finally splits.
- **Scene graph `Node`** — owns the per-object transform (group 2, model/world matrix).
- **Render 100 cubes** — exercises and validates the per-object group at scale, which is the whole reason the convention exists.
