---
tags:
  - notes
phase: "2"
---
Give the loaded models their actual skin — load glTF textures + samplers and attach them to materials. The through-line: **a loader that brings in resources is two separable jobs — async *acquisition* (decode bytes → GPU texture) and sync *assembly* (reference them by index).** Keeping those apart (load all textures up front into an indexed list, then wire) is what makes the loader testable, dedup-able, and the on-ramp to the #24 `AssetManager`.

## What we built

- [src/gpu/texture.ts](../../../src/gpu/texture.ts) — refactored so a `Texture` can be built from an already-decoded `ImageBitmap` + a `GPUSamplerDescriptor` (`fromImageBitmap`), with `load(url)` now a thin wrapper. Sampler + `flipY` are parameters, not hardcoded.
- [src/assets/gltfTypes.ts](../../../src/assets/gltfTypes.ts) — `GltfTexture` / `GltfImage` / `GltfSampler` + `baseColorTexture` on the material.
- [src/assets/gltf.ts](../../../src/assets/gltf.ts) — `gltfSamplerToDescriptor` (GL enum → WebGPU), `loadTextures` (async acquisition pass → indexed `Texture[]`), and `PbrMaterial.baseColorTexture` resolved by index through `buildMaterial`/`buildScene`/`loadGltf`.
- [src/materials/shaders/textured.wgsl](../../../src/materials/shaders/textured.wgsl) + [src/main.ts](../../../src/main.ts) — a sampling shader and a per-model material branch, so the Duck renders with its real texture.
- [test/unit/assets/gltf.test.ts](../../../test/unit/assets/gltf.test.ts) — sampler-enum mapping + baseColorTexture resolution.

## The glTF texture model: three-way indirection

A material doesn't point at an image directly:
```
material.baseColorTexture.index → textures[t] → { source, sampler }
                                                    │         │
                                          images[source]  samplers[sampler]
                                          (the pixels)    (how to read them)
```
The split lets the same image be sampled different ways, or a sampler be reused. (Same indirection-chain flavor as geometry's accessor→bufferView→buffer.)

## The image lives in the BIN, not a URL

#16's loader fetched a URL; a `.glb`'s image is **embedded** — `images[0] = { bufferView: 3, mimeType: 'image/png' }`. So instead of `fetch`, slice the bytes from `bin` with the *same* buffer→bufferView machinery as geometry, wrap them in a `Blob`, and `createImageBitmap`. That's the byte-source twin of #16's `createImageBitmap(await resource.blob())`. (URI/data-URI images are deferred, like `.gltf` input.)

## Samplers: GL enums → WebGPU, with graceful defaults

The sampler is raw OpenGL enums. Two design choices:
- **Typed `number`, not a literal union.** Opposite of the accessor `componentType`: there we wanted *exhaustiveness*; here we want *graceful fallback* — look the enum up in a table and default the unknown. (Union when the compiler should force every case; `number` when you map-with-default.)
- **The minFilter split.** glTF packs within-level and between-level filtering into one enum (`‹within›_MIPMAP_‹between›`); WebGPU has two fields (`minFilter` + `mipmapFilter`). The Duck's `9986` = `NEAREST_MIPMAP_LINEAR` → `minFilter: 'nearest'`, `mipmapFilter: 'linear'` (GL's default).

The mapping leans on a **double `??`**: `TABLE[field ?? DEFAULT_ENUM] ?? DEFAULT_RESULT` — the inner defaults an *absent field*, the outer defaults an *unknown enum*. Both the type (no `| undefined`) and the robustness fall out of it.

## Async lives in acquisition, not assembly

The architectural call: decoding is async, but `buildScene`/`buildMaterial` are sync. Rather than thread `async` through the assembly logic, `loadGltf` does one acquisition pass — `const textures = await loadTextures(...)` (a `Promise.all` over the glTF textures, **order-preserving** so the result is indexed by texture index) — then sync assembly references `textures[i]`. This isolates I/O, dedups, and is exactly the shape #24's `AssetManager` generalizes. (`Promise.all` runs the decodes concurrently; a `for await` would serialize them.)

## The flipY gotcha

`fromImageBitmap` inherited `flipY: true` from #16. glTF's UV origin is **top-left with no flip**, so the Duck loaded upside-down. Fix at the source: `flipY` is now a parameter — `load` (cube) keeps `true` (its UVs were authored for it), `loadTextures` passes `false`. Verify-then-fix beat guessing the convention.

## Demo: per-model shader selection

The Box (`[position, normal]`) and Duck (`[position, normal, uv]`) have **different vertex layouts**, so one texture-sampling shader can't serve both (the Box has no UVs). So `loadModel` branches on `material.baseColorTexture`: present → textured material (3-binding group: MVP / texture / sampler); absent → the normals material. The bind-group **layout entries, the shader's `@binding`s, and the material entries must all describe the same slots** — and `visibility` flags must match where each binding is read.

## Type traps that recurred

- **Inference too narrow:** `let entries = [{ …buffer… }]` locks to buffer resources; annotate `GPUBindGroupEntry[]` so texture-view/sampler resources fit.
- **Literal widening:** `DEFAULT_SAMPLER` without a `: GPUSamplerDescriptor` annotation infers `string`, not the `GPUFilterMode` union.
- **`exactOptionalPropertyTypes`:** conditional-spread optionals (`Blob`'s `type`, the material's `baseColorTexture`) — "omitted" ≠ "undefined."
- **`...(cond && x)` vs `...(cond && { x })`:** spreading the value splats *its* fields; you want an object with the *key*. `tsc` won't catch it — a test will.

## Scope

`baseColorTexture` from a `bufferView`, only. Deferred: URI/data-URI images; the other texture slots (normal / metallic-roughness / emissive — Phase 4 #41); and real PBR shading (#35) — the demo just samples the base color flat.

## What's next

- **#23** — KTX2 / Basis (transcoded GPU-compressed textures).
- **#24** — `AssetManager`: caching + ref-counting, generalizing `loadTextures`'s indexed resource pass across files.
- **#35 (Phase 4)** — PBR shading that uses `baseColor`/`metallic`/`roughness` *and* the textures together.
