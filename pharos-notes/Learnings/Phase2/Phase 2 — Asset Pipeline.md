---
tags:
  - landing
phase: "2"
---
# **Milestone goal**
Load real-world assets — glTF scenes with KTX2 textures — through a managed loader. The engine stops being a triangle demo and starts showing content artists make.

# Learning Notes

- [[Issue 20 - glTF Loader]] — a minimal `.glb` loader behind a `GltfScene` importer boundary. Through-line: a loader is a *translation across a boundary* (authoring-friendly de-interleaved/indirection → GPU-friendly interleaved `Mesh` + transform tree), and the engine never learns what glTF is. The indirection ladder (mesh→primitive→accessor→bufferView→buffer); two output views (`roots` hierarchy vs flat `renderables` draw list); `.glb` binary parsing with `DataView` little-endian + fail-loud; a typed manifest (literal unions for exhaustiveness, optional-mirrors-the-format); accessor decode (the alignment trap solved free by `slice`; the typed-array constructor union; the `ArrayBufferLike` vs `ArrayBuffer` saga — fix types at the producer); interleaving an unordered attribute map into an ordered buffer; matrix-or-TRS node decomposition (loose type, runtime resolve); two-pass tree assembly; and a demo (normals material) that surfaced a latent `Material.bind` bug. Meta-lesson throughout: **`tsc` clean ≠ correct** — loop bounds, `forEach` arg order, dropped branches, `0`/`''` falsiness all compile green.

_(Materials/textures #21–#22, KTX2 #23, and the AssetManager #24 are still to come.)_
