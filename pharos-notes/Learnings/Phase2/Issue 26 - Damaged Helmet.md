---
tags:
  - notes
phase: "2"
---
Load the industry-standard PBR test asset and watch the Phase 2 pipeline absorb it with no new engine code. The through-line: **the real test of a loader is an asset you didn't build it around.** DamagedHelmet went from URL to on-screen through the existing glTF loader (#20–#22), `assetUrl` (#112), and texture import — the entire "implementation" was one `loadModel(...)` entry. What you *don't* have to write is the story.

## What we built

- `public/models/DamagedHelmet.glb` — the canonical Khronos asset (3.77 MB, 14.5k verts, 5 JPEG maps).
- [src/main.ts](../../../src/main.ts) — one `loadModel(assetUrl('models/DamagedHelmet.glb'), …)` entry in the demo `models` array; placed/scaled to frame.
- [test/unit/assets/gltf.test.ts](../../../test/unit/assets/gltf.test.ts) — a shipped-asset regression (3-attribute interleave at 14556 × stride 8; baseColorTexture resolves → textured path).

## Provenance, again

Pulled from `KhronosGroup/glTF-Sample-Assets` (the current canonical repo) `Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb`. The #23 lesson said *verify it's not a Git-LFS pointer* — checked: 3.77 MB with a real `glTF`/`0x46546C67` magic and version 2, not a 130-byte text stub. The `.glb` (binary) variant matters because the `.gltf` (external-buffer) path is still unbuilt (#117); the binary form embeds geometry + images in one BIN chunk our loader already reads.

## Graceful degradation is what made it free

The asset loaded without engine changes because the loader **ignores what it doesn't model** instead of failing on it:
- The vertex stage iterates a *fixed* `VERTEX_ATTRIBUTES` list (POSITION/NORMAL/TEXCOORD_0) and pulls each that's present — any extra semantic (TANGENT, a second UV set) is simply skipped, not an error. (This particular variant happens to ship only the three anyway.)
- All five textures decode and upload, but `loadModel` binds only `baseColorTexture`; normal/metallic-roughness/emissive/occlusion sit loaded-but-unused until the PBR shader (Phase 4 #35).

That's the payoff of the #20–#22 boundary work: the loader translates what it understands and drops the rest, so a richer asset degrades to placeholder shading rather than crashing.

## Placeholder shading, honestly

"Renders" here means the baseColor map on lit-by-nothing geometry — `loadModel` auto-selects `texturedShader` when a baseColor texture exists. No lighting, no normal mapping, no metallic-roughness response yet; the helmet looks flat-lit. That's the intended Phase 2 end state (the issue says so) — Phase 4 turns the other four maps on.

## Headless can't see it

The unit regression proves the file *parses and interleaves* (no GPU needed), but "does it actually look right" is unverifiable in the test env — no `createImageBitmap`, no GPU. So the loop was the #23 one again: I shipped the asset + loader-coverage, the user ran `npm run dev`, tuned the transform, and confirmed visually. The thing that can't be checked statically gets checked by running it.

## Not wired through the AssetManager yet

#24's `AssetManager` still has no call sites — `loadModel` calls `loadGltf` directly. That's deliberate: the manager earns its keep when an asset is *shared* (one texture across many materials/nodes), which a single helmet doesn't exercise. Sponza (#27) is the natural place to route loads through it and see the dedup/ref-counting matter.

## What's next

- **#27 Sponza** — a large scene that shares assets and stresses draw-call count + memory; the first real `AssetManager` call site.
- **#35 (Phase 4)** — PBR shading that lights the helmet with all five maps.
