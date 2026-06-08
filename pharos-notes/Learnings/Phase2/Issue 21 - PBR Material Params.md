---
tags:
  - notes
phase: "2"
---
Carry a model's **material** — what its surface is made of — not just its geometry. The through-line: **separate the shape from the finish, and lay the data pipe ahead of the shader.** #20 loaded the *form* (mesh + nodes); #21 loads the *appearance* as physically-meaningful PBR knobs, normalizes them to an engine-native type at the importer boundary, and attaches one to every renderable. Nothing shades with them yet — that's Phase 4 (#35). This issue is plumbing the water main before the tap exists.

## What we built

- [src/assets/gltfTypes.ts](../../../src/assets/gltfTypes.ts) — a `GltfMaterial` interface (`pbrMetallicRoughness?: { baseColorFactor?, metallicFactor?, roughnessFactor? }`) and `materials?` on `GltfJson` — the glTF-side raw shape.
- [src/assets/gltf.ts](../../../src/assets/gltf.ts) — an engine-native `PbrMaterial` type, `buildMaterial` (glTF → engine, with spec defaults), and `material` added to `Renderable`, wired through `buildScene`.
- [test/unit/assets/gltf.test.ts](../../../test/unit/assets/gltf.test.ts) — Box (red `baseColor`), Duck (defaults), and a no-material primitive (the spec default material).

## PBR in one breath

A **material** is "how a surface responds to light," separate from its shape. **PBR** (physically based rendering) describes it with physically-grounded knobs so it looks right under *any* lighting. The **metallic-roughness** model is three of them:

- **baseColor** (RGBA) — the surface's intrinsic color (diffuse albedo for non-metals; reflection tint for metals).
- **metallic** (0–1) — dielectric (plastic/wood) vs metal.
- **roughness** (0–1) — mirror-smooth vs matte.

So Box "Red" = `baseColor [0.8,0,0,1]`, `metallic 0`, `roughness 1` (default) → matte red plastic.

## The importer boundary, again

glTF's material is nested and glTF-specific: `{ pbrMetallicRoughness: { baseColorFactor, … } }`. The boundary rule (the spine of #20) says the engine must not see that. So `buildMaterial` **flattens and renames** it into an engine-native `PbrMaterial { baseColor, metallic, roughness }`. The Phase 4 shader will consume *that*, never the glTF shape — which keeps the loader swappable.

## Naming: name a type for what it is

The data type couldn't be `Material` (that's the GPU pipeline class — same clash as `GltfScene` vs the glTF scene object). Candidates were `MaterialParams` vs `PbrMaterial`. Chose **`PbrMaterial`**: it names *what the thing is* (the metallic-roughness model), pairs with the coming PBR shader, and avoids a **vague suffix** — `-Params`/`-Data`/`-Info`/`-Manager` are a naming smell that pad without informing. (My initial lean was the weaker `MaterialParams`; the reasoning corrected it.)

## Optional-with-defaults, via one `?.` chain

glTF materials are optional all the way down — a primitive may have no material, a material may have no `pbrMetallicRoughness`, that block may omit any factor. Rather than nested guards, an optional chain into `??` defaults handles all three uniformly:
```ts
const pbr = json.materials?.[primitive.material ?? -1]?.pbrMetallicRoughness;
const baseColor = pbr?.baseColorFactor ?? [1, 1, 1, 1];
const metallic  = pbr?.metallicFactor  ?? 1;
const roughness = pbr?.roughnessFactor ?? 1;
```
The spec defaults matter: a primitive with *no* material resolves to the **default material** — white, fully metallic (`1`), fully rough (`1`). That `metallic = 1` default (vs the explicit `0` in our assets) is its own test case.

## Two small type traps

- **The type must match the JSON key exactly.** A first draft named the field `pbrMetallic` instead of `pbrMetallicRoughness`. Because `parseGlb` *casts* the JSON to `GltfJson` (trusted, not validated), `tsc` stayed green — but `material.pbrMetallic` would be `undefined` forever, silently defaulting every material. Box's red would just vanish. Same family as #20's "compiler enforces your model, not its truth"; only the Box test catches it.
- **Tuple vs array.** `baseColorFactor` is `number[]`, but `PbrMaterial.baseColor` is a fixed `[number,number,number,number]`. `?? [1,1,1,1]` yields `number[]`, which won't assign to the tuple ("source may have fewer"). The glTF spec guarantees length-4 when present, so a documented `as [number, number, number, number]` is the proportionate bridge — not an `any`.

## Scope

Factors only. Deferred (by design): **textures** (`baseColorTexture` — #22, which is why the Duck's painted skin is ignored here) and the **PBR shading math** (Cook-Torrance/GGX — Phase 4 #35). After #21, every renderable knows its surface; nothing draws it differently yet.

## What's next

- **#22** — glTF texture & sampler import (wire the Duck's `baseColorTexture` to the #16 texture loader).
- **#35 (Phase 4)** — the PBR shader that finally turns `baseColor`/`metallic`/`roughness` into lit pixels.
