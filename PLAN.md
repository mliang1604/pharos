# Pharos — Milestones & Issues

A planning document for the Pharos WebGPU game engine. Every issue below is
mirrored as a GitHub issue; the `#NN` is its issue number and the marker is its
state.

> **Plan ↔ GitHub alignment.** This file and the GitHub issues/milestones are two
> views of the same plan and must be kept in sync. When you change the plan here
> (add, remove, re-scope, or re-phase an issue), make the matching change on
> GitHub — and when issues change on GitHub, reflect them here. Run a
> reconciliation (`gh issue list --state all`) whenever they may have drifted.
>
> **Status markers:** ✅ merged (PR merged → issue closed) · 🔲 todo (open) · ⏳ in progress (PR in review).
> `➕ added` = issue created after the original roadmap was written.
> `⚠ no milestone` = open discrepancy: issue exists on GitHub with no milestone.
>
> **Last reconciled:** 2026-06-07 (through #113).

---

## Phase 0 — Foundations · ✅ complete (13/13)

**Milestone goal:** Project scaffolding, WebGPU context up, render a textured spinning cube with depth.

### Issues

- ✅ **[#1](https://github.com/mliang1604/pharos/issues/1)** Set up TypeScript + Vite project skeleton `[infrastructure]`
  Initialize package.json, tsconfig with strict mode, Vite config with HMR, and a minimal `index.html` mounting a `<canvas>`. Add ESLint + Prettier.

- ✅ **[#2](https://github.com/mliang1604/pharos/issues/2)** Add CI: typecheck, lint, and build on PRs `[infrastructure]`
  GitHub Actions workflow running `tsc --noEmit`, `eslint`, and `vite build` on every push and PR.

- ✅ **[#3](https://github.com/mliang1604/pharos/issues/3)** Detect WebGPU support and request a GPUAdapter / GPUDevice `[rendering]`
  Provide a clear fallback message when WebGPU is unavailable. Log adapter info in dev mode.

- ✅ **[#4](https://github.com/mliang1604/pharos/issues/4)** Configure GPUCanvasContext and present a clear color `[rendering]`
  Set up the swap chain with the preferred canvas format. Confirm the canvas updates every frame.

- ✅ **[#5](https://github.com/mliang1604/pharos/issues/5)** Render a hardcoded triangle `[rendering]`
  Single vertex + fragment WGSL shader, hardcoded positions, no buffers. Sanity check the pipeline.

- ✅ **[#6](https://github.com/mliang1604/pharos/issues/6)** Render a textured spinning cube with depth testing `[rendering]`
  Vertex/index buffers, depth attachment, MVP matrix uniform, a sampled texture. The "hello cube" milestone.

- ✅ **[#7](https://github.com/mliang1604/pharos/issues/7)** Add `requestAnimationFrame` loop with delta time `[rendering]`
  Frame loop that tracks elapsed time and dispatches an update + render step.

- ✅ **[#8](https://github.com/mliang1604/pharos/issues/8)** Set up a debug HUD (FPS, frame time, draw calls) `[tooling]`
  Tiny overlay using DOM or a simple canvas-2D. Read-only counters for now.

- ✅ **[#9](https://github.com/mliang1604/pharos/issues/9)** Document local dev setup in README `[docs]`
  Install, run, build, browser requirements (WebGPU support matrix).

- ✅ **[#84](https://github.com/mliang1604/pharos/issues/84)** Add Vitest and wire `test` script into CI `[infrastructure]` ➕ added
  Test runner setup; `test` step runs in the CI workflow.

- ✅ **[#85](https://github.com/mliang1604/pharos/issues/85)** Adopt copyright-header convention via skill `[infrastructure]` ➕ added
  Repo convention for SPDX/copyright headers on first-party source files.

- ✅ **[#88](https://github.com/mliang1604/pharos/issues/88)** Deploy production build to GitHub Pages via Actions `[infrastructure]` ➕ added
  CI deploys the `vite build` output to GitHub Pages.

- ✅ **[#94](https://github.com/mliang1604/pharos/issues/94)** Add VS Code workspace settings for Prettier format-on-save `[tooling]` ➕ added
  Workspace-level editor settings so formatting is consistent on save.

---

## Phase 1 — Rendering Core · ✅ core complete (12/13) · 🔲 1 deferred follow-up

**Milestone goal:** A reusable rendering API — meshes, materials, cameras, scene graph, basic lighting.

### Issues

- ✅ **[#10](https://github.com/mliang1604/pharos/issues/10)** Math library decision: integrate wgpu-matrix or gl-matrix `[rendering]`
  Compare APIs and column-major conventions; pick one. Wrap types in `src/math/` for future swap.

- ✅ **[#11](https://github.com/mliang1604/pharos/issues/11)** `Mesh` class with vertex/index buffer abstraction `[rendering]`
  Pre-validated vertex layouts, attribute introspection, optional index buffer.

- ✅ **[#12](https://github.com/mliang1604/pharos/issues/12)** `Material` and `Shader` abstraction `[rendering]`
  WGSL module loading, bind group layout introspection, uniform buffer helpers.

- ✅ **[#13](https://github.com/mliang1604/pharos/issues/13)** Define the bind group strategy `[rendering] [architecture]`
  Document the convention: group 0 = per-frame, group 1 = per-material, group 2 = per-object. Encode in code via constants.

- ✅ **[#14](https://github.com/mliang1604/pharos/issues/14)** Perspective camera with orbit controls `[rendering]`
  Camera component with projection/view matrices, mouse-drag orbit, scroll zoom.

- ✅ **[#15](https://github.com/mliang1604/pharos/issues/15)** Basic scene graph: `Node` with parent/children and local transform `[rendering]`
  Recursive world matrix computation with a dirty flag.

- ✅ **[#16](https://github.com/mliang1604/pharos/issues/16)** Texture loading from image URLs `[rendering] [assets]`
  Async loader → `GPUTexture` + `GPUSampler`. Handle mipmap generation (compute or manual).

- ✅ **[#17](https://github.com/mliang1604/pharos/issues/17)** Blinn-Phong shader as a baseline material `[rendering]`
  Single directional light, ambient + diffuse + specular. Placeholder until PBR lands in Phase 4.

- ✅ **[#18](https://github.com/mliang1604/pharos/issues/18)** Render 100 cubes with unique transforms (perf sanity check) `[rendering]`
  Validate per-object uniform updates don't tank frame time. Note any obvious draw-call bottlenecks.

- ✅ **[#19](https://github.com/mliang1604/pharos/issues/19)** Resize handling: canvas, depth buffer, camera aspect `[rendering]`
  Debounced resize observer; recreate depth texture; update projection.

- ✅ **[#102](https://github.com/mliang1604/pharos/issues/102)** Recommend a WGSL extension for shader syntax highlighting `[tooling]` ➕ added
  Workspace recommendation for WGSL editor support.

- ✅ **[#106](https://github.com/mliang1604/pharos/issues/106)** Scene graph: guard `Node.addChild` against cycles `[rendering]` ➕ added · ⚠ no milestone
  Reject self-parenting and ancestor cycles before mutating the tree. _Follow-up to #15; assign to Phase 1 milestone on GitHub._

- 🔲 **[#113](https://github.com/mliang1604/pharos/issues/113)** Instanced rendering: collapse per-object draws into one instanced draw `[rendering] [best effort]` ➕ added · ⚠ no milestone
  Deferred from #18: replace N per-object draws with a single instanced draw. _Assign to Phase 1 milestone on GitHub (or move to a perf milestone)._

---

## Phase 2 — Asset Pipeline · ⏳ in progress (7/10 merged)

**Milestone goal:** Load real-world assets — glTF scenes with KTX2 textures — through a managed loader.

### Issues

- ✅ **[#20](https://github.com/mliang1604/pharos/issues/20)** glTF 2.0 loader: geometry and node hierarchy `[assets]`
  Parse `.gltf` and `.glb`, build `Mesh` + node graph. Use `@gltf-transform/core` or roll a minimal parser.
  _Merged via #118: rolled a minimal `.glb` loader behind a `GltfScene` importer boundary. Deferred to #117 — `.gltf` (non-binary) input, interleaved/non-float source attributes._

- ⏳ **[#117](https://github.com/mliang1604/pharos/issues/117)** glTF loader: support `.gltf` (non-binary) input and non-tight/non-float attributes `[assets]` ➕ added
  Follow-up to #20: the `.gltf` JSON container (embedded/external buffers), interleaved bufferViews (`byteStride`), and non-float vertex attributes — all currently throw "unsupported."

- ✅ **[#21](https://github.com/mliang1604/pharos/issues/21)** glTF: PBR material parameters (metallic-roughness, baseColor) `[assets] [rendering]`
  Map glTF material data to engine material. Defer the shader work to Phase 4.
  _Merged via #121: normalize glTF material → engine `PbrMaterial` (baseColor/metallic/roughness) with spec defaults, attached per renderable. Textures deferred to #22; shading to #35._

- ✅ **[#22](https://github.com/mliang1604/pharos/issues/22)** glTF: texture and sampler import `[assets]`
  Wire glTF textures to the loader from Phase 1. Respect wrap/filter modes.
  _Merged via #122: decode embedded (bufferView) images, map GL sampler enums → `GPUSamplerDescriptor`, load into an indexed `Texture[]`, attach `baseColorTexture` per material; demo renders the textured Duck. URI images deferred; other texture slots → #41._

- ✅ **[#23](https://github.com/mliang1604/pharos/issues/23)** KTX2 / Basis Universal loader `[assets]`
  Integrate the KTX2 loader (transcoder WASM). Pick GPU-supported format from the adapter's feature list.
  _Merged via #128: device-feature negotiation, format selection (BC/ASTC/ETC2/RGBA32), Basis transcode via vendored Khronos WASM, compressed upload. Standalone loader + demo quad; glTF-native KTX2 deferred to #127._

- ✅ **[#24](https://github.com/mliang1604/pharos/issues/24)** `AssetManager`: async loading, caching, ref counting `[assets] [architecture]`
  Single load per URL, dispose when ref count drops to zero. Promise-based API.
  _Merged via #129: generic `AssetManager<T extends Disposable>` with injected loader, in-flight-promise single-flight dedup, ref-counted deterministic dispose-at-zero, and identity-guarded eviction of failed loads. No call sites yet; wired in with #26/#27 test assets._

- 🔲 **[#25](https://github.com/mliang1604/pharos/issues/25)** Loading state UX in the demo app `[ui]`
  Simple progress bar while a scene loads. Useful for spotting blocking work.

- ✅ **[#26](https://github.com/mliang1604/pharos/issues/26)** Test asset: load the Damaged Helmet glTF `[assets] [docs]`
  Industry-standard PBR test asset. Should render with placeholder shading; PBR comes in Phase 4.
  _Merged via #131: vendored canonical `DamagedHelmet.glb`, loaded with one `loadModel` entry (no engine changes — loader skips unmodeled attributes, binds baseColor only). Placeholder shading; not yet routed through AssetManager (#27 does that)._

- 🔲 **[#27](https://github.com/mliang1604/pharos/issues/27)** Test asset: load the Sponza scene `[assets]`
  Larger scene to validate draw-call performance and asset memory.

- ✅ **[#112](https://github.com/mliang1604/pharos/issues/112)** Centralize base-path-correct asset URLs (assetUrl helper) `[architecture] [assets]` ➕ added
  A helper that resolves asset URLs against the deploy base path. Generalizes the fix from #110 so runtime asset loads work under GitHub Pages' subpath.
  _Merged via #130: `assetUrl(path, base = import.meta.env.BASE_URL)` with injected-base DI for testing; all six call sites migrated so the helper is the sole owner of `BASE_URL` in `src/`._

---

## Phase 3 — Scene & Entity System · 🔲 todo (0/7)

**Milestone goal:** Refactor from ad-hoc node objects to a proper ECS with serialization.

### Issues

- 🔲 **[#28](https://github.com/mliang1604/pharos/issues/28)** Decide: integrate bitECS vs. build minimal in-house ECS `[ecs] [architecture]`
  Prototype both with a 10k-entity stress test. Document the choice in `/docs/architecture/ecs.md`.

- 🔲 **[#29](https://github.com/mliang1604/pharos/issues/29)** Core components: `Transform`, `MeshRenderer`, `Camera`, `Light` `[ecs]`
  Initial component set covering Phase 1 rendering needs.

- 🔲 **[#30](https://github.com/mliang1604/pharos/issues/30)** Transform hierarchy with dirty-flag propagation `[ecs]`
  Parent-relative transforms; only recompute world matrices when something changes.

- 🔲 **[#31](https://github.com/mliang1604/pharos/issues/31)** System scheduling and update order `[ecs] [architecture]`
  Define stages (input → simulation → animation → render). Document the contract.

- 🔲 **[#32](https://github.com/mliang1604/pharos/issues/32)** Scene serialization to JSON `[ecs] [tooling]`
  Save and reload an entity graph including referenced assets (by URL/UUID).

- 🔲 **[#33](https://github.com/mliang1604/pharos/issues/33)** Entity picking via raycasting (CPU fallback) `[ecs] [rendering]`
  Useful for editor groundwork. GPU picking can come later.

- 🔲 **[#34](https://github.com/mliang1604/pharos/issues/34)** Migrate existing demos to ECS `[ecs] [chore]`
  Convert the spinning cube and glTF scene demos to use entities and components.

---

## Phase 4 — Lighting & Shadows · 🔲 todo (0/8)

**Milestone goal:** Make Pharos look like a modern engine — PBR, multiple light types, shadows, IBL.

### Issues

- 🔲 **[#35](https://github.com/mliang1604/pharos/issues/35)** PBR metallic-roughness shader (Cook-Torrance) `[lighting] [rendering]`
  GGX distribution, Schlick Fresnel, Smith geometry. Matches glTF spec.

- 🔲 **[#36](https://github.com/mliang1604/pharos/issues/36)** Directional, point, and spot lights `[lighting]`
  Light components, light list uniform buffer, attenuation models.

- 🔲 **[#37](https://github.com/mliang1604/pharos/issues/37)** Shadow mapping: single directional light, one cascade `[lighting]`
  Render to a depth texture from the light's POV; sample in the main pass.

- 🔲 **[#38](https://github.com/mliang1604/pharos/issues/38)** Cascaded shadow maps (CSM) `[lighting]`
  Split the view frustum into N cascades; pick the right cascade per-fragment.

- 🔲 **[#39](https://github.com/mliang1604/pharos/issues/39)** Image-based lighting from HDR equirectangular maps `[lighting]`
  Equirect → cubemap conversion, prefiltered specular cubemap, irradiance map, BRDF LUT.

- 🔲 **[#40](https://github.com/mliang1604/pharos/issues/40)** Compute shader: BRDF LUT generation `[lighting] [rendering]`
  Offline pre-computation that runs once at startup; cache result.

- 🔲 **[#41](https://github.com/mliang1604/pharos/issues/41)** Material extension: emissive, normal map, AO map `[lighting] [rendering]`
  Full glTF metallic-roughness feature set.

- 🔲 **[#42](https://github.com/mliang1604/pharos/issues/42)** Visual regression test scene for lighting `[tooling] [docs]`
  A canonical "lighting test" scene. Save reference screenshots; diff on CI eventually.

---

## Phase 5 — Animation & Physics · 🔲 todo (0/8)

**Milestone goal:** Bring scenes to life — animated characters and rigid-body physics.

### Issues

- 🔲 **[#43](https://github.com/mliang1604/pharos/issues/43)** glTF skeletal animation: skin + joint hierarchy `[animation] [assets]`
  Parse skin data; build joint matrices each frame.

- 🔲 **[#44](https://github.com/mliang1604/pharos/issues/44)** Compute-shader skinning `[animation] [rendering]`
  Skin vertices on the GPU; output a transformed vertex buffer for the regular pipeline.

- 🔲 **[#45](https://github.com/mliang1604/pharos/issues/45)** Animation playback: clip, time, looping `[animation]`
  Sample translation/rotation/scale tracks; update transforms.

- 🔲 **[#46](https://github.com/mliang1604/pharos/issues/46)** Animation blending (two-clip linear blend) `[animation]`
  Crossfade between clips. Build the foundation for state machines later.

- 🔲 **[#47](https://github.com/mliang1604/pharos/issues/47)** Rapier physics integration via WASM `[physics]`
  Add rapier3d, run the simulation in a worker if practical.

- 🔲 **[#48](https://github.com/mliang1604/pharos/issues/48)** `RigidBody` and `Collider` components `[physics] [ecs]`
  Map ECS components to Rapier handles; sync transforms each frame.

- 🔲 **[#49](https://github.com/mliang1604/pharos/issues/49)** GPU raycasting for editor picking `[physics] [tooling]`
  Replace the Phase 3 CPU raycaster with a faster version for large scenes.

- 🔲 **[#50](https://github.com/mliang1604/pharos/issues/50)** Debug draw: colliders, joints, contact points `[physics] [tooling]`
  Toggleable debug overlay rendered via a simple line shader.

---

## Phase 6 — Post-Processing & Render Graph · 🔲 todo (0/8)

**Milestone goal:** Refactor to a render graph and add modern post-processing.

### Issues

- 🔲 **[#51](https://github.com/mliang1604/pharos/issues/51)** Design the render graph: passes, resources, lifetimes `[architecture] [rendering]`
  RFC document in `/docs/rfcs/`. Passes declare inputs/outputs; the graph resolves order and transient resources.

- 🔲 **[#52](https://github.com/mliang1604/pharos/issues/52)** Implement the render graph executor `[rendering]`
  Topological sort, resource aliasing, barrier insertion.

- 🔲 **[#53](https://github.com/mliang1604/pharos/issues/53)** Migrate the forward renderer onto the render graph `[rendering] [chore]`
  Existing shadow + main + present passes become graph nodes.

- 🔲 **[#54](https://github.com/mliang1604/pharos/issues/54)** Bloom post-process `[rendering]`
  Downsample → blur → upsample → composite. Configurable threshold and intensity.

- 🔲 **[#55](https://github.com/mliang1604/pharos/issues/55)** Tone mapping (ACES or Reinhard) and gamma correction `[rendering]`
  Final pass before present. Sit downstream of bloom.

- 🔲 **[#56](https://github.com/mliang1604/pharos/issues/56)** FXAA and/or TAA `[rendering]`
  Start with FXAA for simplicity. TAA is a much bigger task — open as a follow-up.

- 🔲 **[#57](https://github.com/mliang1604/pharos/issues/57)** SSAO `[rendering]`
  Screen-space ambient occlusion. Test with the Sponza scene from Phase 2.

- 🔲 **[#58](https://github.com/mliang1604/pharos/issues/58)** Profiling overlay: per-pass GPU time `[tooling] [rendering]`
  Use timestamp queries where supported; show a flame-graph-style overlay.

---

## Phase 7 — Audio, Input, UI · 🔲 todo (0/6)

**Milestone goal:** The non-rendering parts of "being a game engine."

### Issues

- 🔲 **[#59](https://github.com/mliang1604/pharos/issues/59)** Audio engine: Web Audio wrapper with 3D positioning `[audio]`
  Listener follows the active camera; sources attach to entities; basic attenuation curves.

- 🔲 **[#60](https://github.com/mliang1604/pharos/issues/60)** Audio: load, play, loop, fade `[audio]`
  Async sample loading; sample pooling; per-source volume/pitch.

- 🔲 **[#61](https://github.com/mliang1604/pharos/issues/61)** Input abstraction: keyboard, mouse, gamepad, touch `[input]`
  Action mapping layer (e.g. "jump" → space OR gamepad A). Allow rebinding.

- 🔲 **[#62](https://github.com/mliang1604/pharos/issues/62)** Input: pointer lock and relative mouse for FPS-style controls `[input]`
  Wrap the Pointer Lock API; expose a clean delta-x/delta-y stream.

- 🔲 **[#63](https://github.com/mliang1604/pharos/issues/63)** In-game UI: pick an approach (immediate-mode vs. DOM overlay) `[ui] [architecture]`
  RFC + decision. DOM overlay is simplest; immediate-mode (à la ImGui) is more flexible for debug tools.

- 🔲 **[#64](https://github.com/mliang1604/pharos/issues/64)** HUD example: health bar, ammo counter, crosshair `[ui]`
  Reference implementation of the chosen UI approach.

---

## Phase 8 — Editor · 🔲 todo (0/8)

**Milestone goal:** Make Pharos usable by people who aren't comfortable in raw code.

### Issues

- 🔲 **[#65](https://github.com/mliang1604/pharos/issues/65)** Editor shell: viewport + panel layout (React or Svelte) `[tooling]`
  Resizable panels, tabbed docking optional. Pharos viewport in the center.

- 🔲 **[#66](https://github.com/mliang1604/pharos/issues/66)** Hierarchy panel: tree view, drag-to-reparent, multi-select `[tooling]`
  Reflects the live ECS world; selection drives the inspector.

- 🔲 **[#67](https://github.com/mliang1604/pharos/issues/67)** Inspector panel: edit component fields by type `[tooling]`
  Type-driven UI (numbers, vectors, colors, dropdowns for enums, asset pickers).

- 🔲 **[#68](https://github.com/mliang1604/pharos/issues/68)** Asset browser: thumbnails, drag-into-scene, search `[tooling]`
  File-system-style view of the project's assets folder.

- 🔲 **[#69](https://github.com/mliang1604/pharos/issues/69)** Transform gizmos: translate, rotate, scale `[tooling] [rendering]`
  Screen-space handles overlaid on the selected entity.

- 🔲 **[#70](https://github.com/mliang1604/pharos/issues/70)** Scene save/load through the editor `[tooling]`
  Round-trip through the Phase 3 serialization. Add a "dirty" indicator.

- 🔲 **[#71](https://github.com/mliang1604/pharos/issues/71)** Undo/redo: command pattern `[tooling] [architecture]`
  Every editor mutation goes through a command object. Stack-based undo.

- 🔲 **[#72](https://github.com/mliang1604/pharos/issues/72)** Hot reload of scripts and shaders `[tooling]`
  Vite HMR for engine code; live WGSL recompile on file change.

---

## Phase 9 — Reference Game · 🔲 todo (0/8)

**Milestone goal:** Ship one small, complete game using only Pharos. Treat the engine as a customer of itself.

### Issues

- 🔲 **[#73](https://github.com/mliang1604/pharos/issues/73)** Pick a genre and scope it tightly `[design]`
  Examples: 3D puzzle, kart racer, arena shooter, top-down twin-stick. Aim for 30–60 minutes of gameplay.

- 🔲 **[#74](https://github.com/mliang1604/pharos/issues/74)** Game design document (1–2 pages) `[design] [docs]`
  Core loop, win/loss conditions, controls, must-haves vs. nice-to-haves.

- 🔲 **[#75](https://github.com/mliang1604/pharos/issues/75)** Build the minimum playable prototype `[game]`
  Player movement, one mechanic, one level. Whatever this surfaces becomes engine work.

- 🔲 **[#76](https://github.com/mliang1604/pharos/issues/76)** Audio pass: music, sfx, footsteps `[game] [audio]`

- 🔲 **[#77](https://github.com/mliang1604/pharos/issues/77)** UI pass: main menu, pause, end-of-game screen `[game] [ui]`

- 🔲 **[#78](https://github.com/mliang1604/pharos/issues/78)** Performance pass on mid-range hardware `[game] [rendering]`
  Profile on an integrated GPU; fix the worst offenders.

- 🔲 **[#79](https://github.com/mliang1604/pharos/issues/79)** Public WebGPU demo build `[game] [infrastructure]`
  Deploy to GitHub Pages or similar. The first thing strangers can play.

- 🔲 **[#80](https://github.com/mliang1604/pharos/issues/80)** Post-mortem: what does Pharos still need? `[docs]`
  Honest write-up of pain points discovered. Feeds the next phase of engine work.

---

## Unphased / housekeeping

Issues that landed outside the milestone roadmap (bugfixes, infra). Kept here so
the plan still accounts for them.

- ✅ **[#110](https://github.com/mliang1604/pharos/issues/110)** GitHub Pages: texture 404 from missing base-path prefix `[bug]` ⚠ no milestone
  Runtime texture load 404'd under the Pages subpath. Point fix; generalized by #112. _Consider assigning to Phase 1 on GitHub for the record._

- ✅ **[#119](https://github.com/mliang1604/pharos/issues/119)** Showcase a second glTF model and add a Duck loader regression test `[assets]` ⚠ no milestone
  Follow-up to #20: render cubes → Box → Duck front-to-back in the demo, and add `Duck.glb` as a permanent second fixture proving the loader isn't Box-specific. _Merged via #120._

- ✅ **[#123](https://github.com/mliang1604/pharos/issues/123)** Document repo workflow conventions in CLAUDE.md `[docs]` ⚠ no milestone
  Capture the per-issue workflow, CI-gated merge sequence, PLAN↔GitHub alignment, and project constraints in a root `CLAUDE.md`. _Merged via #124._

- ✅ **[#125](https://github.com/mliang1604/pharos/issues/125)** Models clip away when zooming out (far plane too near, zoom unbounded) `[rendering]` ⚠ no milestone
  Raise the camera far plane (100 → 1000) and clamp `OrbitControls` `maxRadius` (200) so zoom can't recede the scene past the clip. _Merged via #126._

- 🔲 **[#127](https://github.com/mliang1604/pharos/issues/127)** glTF KTX2 textures via the KHR_texture_basisu extension `[assets]` ⚠ no milestone
  Follow-up to #23: resolve `texture.extensions.KHR_texture_basisu.source` and route `image/ktx2` through `loadKtx2Texture`, with a KTX2-textured glTF test asset.

---
