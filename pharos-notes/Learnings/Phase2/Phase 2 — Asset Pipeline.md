---
tags:
  - landing
phase: "2"
---
# **Milestone goal**
Load real-world assets — glTF scenes with KTX2 textures — through a managed loader. The engine stops being a triangle demo and starts showing content artists make.

# Learning Notes

- [[Issue 20 - glTF Loader]] — a minimal `.glb` loader behind a `GltfScene` importer boundary. Through-line: a loader is a *translation across a boundary* (authoring-friendly de-interleaved/indirection → GPU-friendly interleaved `Mesh` + transform tree), and the engine never learns what glTF is. The indirection ladder (mesh→primitive→accessor→bufferView→buffer); two output views (`roots` hierarchy vs flat `renderables` draw list); `.glb` binary parsing with `DataView` little-endian + fail-loud; a typed manifest (literal unions for exhaustiveness, optional-mirrors-the-format); accessor decode (the alignment trap solved free by `slice`; the typed-array constructor union; the `ArrayBufferLike` vs `ArrayBuffer` saga — fix types at the producer); interleaving an unordered attribute map into an ordered buffer; matrix-or-TRS node decomposition (loose type, runtime resolve); two-pass tree assembly; and a demo (normals material) that surfaced a latent `Material.bind` bug. Meta-lesson throughout: **`tsc` clean ≠ correct** — loop bounds, `forEach` arg order, dropped branches, `0`/`''` falsiness all compile green.

- [[Issue 21 - PBR Material Params]] — carry each model's PBR material (metallic-roughness) as data, ahead of the shader. Through-line: separate the *finish* from the *shape*, and lay the data pipe before the tap. Normalize glTF's nested `pbrMetallicRoughness` into a flat engine-native `PbrMaterial { baseColor, metallic, roughness }` at the importer boundary; resolve spec defaults (white / metallic 1 / rough 1, including the no-material default) via one `?.`→`??` chain; name a type for what it *is* (`PbrMaterial`, not a vague `-Params` suffix); and two type traps — a field whose name must match the JSON key exactly (the cast trusts your spelling), and the `number[]`→4-tuple bridge. Textures (#22) and the PBR shading math (Phase 4 #35) deferred.

_(Textures #22, KTX2 #23, and the AssetManager #24 are still to come.)_
