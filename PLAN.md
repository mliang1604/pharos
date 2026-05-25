# Pharos — Milestones & Issues

A planning document for the Pharos WebGPU game engine. Copy these into GitHub
Milestones and Issues, or use `gh issue create` to bulk-import.

---

## Phase 0 — Foundations

**Milestone goal:** Project scaffolding, WebGPU context up, render a textured spinning cube with depth.

### Issues

- **Set up TypeScript + Vite project skeleton** `[infrastructure]`
  Initialize package.json, tsconfig with strict mode, Vite config with HMR, and a minimal `index.html` mounting a `<canvas>`. Add ESLint + Prettier.

- **Add CI: typecheck, lint, and build on PRs** `[infrastructure]`
  GitHub Actions workflow running `tsc --noEmit`, `eslint`, and `vite build` on every push and PR.

- **Detect WebGPU support and request a GPUAdapter / GPUDevice** `[rendering]`
  Provide a clear fallback message when WebGPU is unavailable. Log adapter info in dev mode.

- **Configure GPUCanvasContext and present a clear color** `[rendering]`
  Set up the swap chain with the preferred canvas format. Confirm the canvas updates every frame.

- **Render a hardcoded triangle** `[rendering]`
  Single vertex + fragment WGSL shader, hardcoded positions, no buffers. Sanity check the pipeline.

- **Render a textured spinning cube with depth testing** `[rendering]`
  Vertex/index buffers, depth attachment, MVP matrix uniform, a sampled texture. The "hello cube" milestone.

- **Add `requestAnimationFrame` loop with delta time** `[rendering]`
  Frame loop that tracks elapsed time and dispatches an update + render step.

- **Set up a debug HUD (FPS, frame time, draw calls)** `[tooling]`
  Tiny overlay using DOM or a simple canvas-2D. Read-only counters for now.

- **Document local dev setup in README** `[docs]`
  Install, run, build, browser requirements (WebGPU support matrix).

---

## Phase 1 — Rendering Core

**Milestone goal:** A reusable rendering API — meshes, materials, cameras, scene graph, basic lighting.

### Issues

- **Math library decision: integrate wgpu-matrix or gl-matrix** `[rendering]`
  Compare APIs and column-major conventions; pick one. Wrap types in `src/math/` for future swap.

- **`Mesh` class with vertex/index buffer abstraction** `[rendering]`
  Pre-validated vertex layouts, attribute introspection, optional index buffer.

- **`Material` and `Shader` abstraction** `[rendering]`
  WGSL module loading, bind group layout introspection, uniform buffer helpers.

- **Define the bind group strategy** `[rendering] [architecture]`
  Document the convention: group 0 = per-frame, group 1 = per-material, group 2 = per-object. Encode in code via constants.

- **Perspective camera with orbit controls** `[rendering]`
  Camera component with projection/view matrices, mouse-drag orbit, scroll zoom.

- **Basic scene graph: `Node` with parent/children and local transform** `[rendering]`
  Recursive world matrix computation with a dirty flag.

- **Texture loading from image URLs** `[rendering] [assets]`
  Async loader → `GPUTexture` + `GPUSampler`. Handle mipmap generation (compute or manual).

- **Blinn-Phong shader as a baseline material** `[rendering]`
  Single directional light, ambient + diffuse + specular. Placeholder until PBR lands in Phase 4.

- **Render 100 cubes with unique transforms (perf sanity check)** `[rendering]`
  Validate per-object uniform updates don't tank frame time. Note any obvious draw-call bottlenecks.

- **Resize handling: canvas, depth buffer, camera aspect** `[rendering]`
  Debounced resize observer; recreate depth texture; update projection.

---

## Phase 2 — Asset Pipeline

**Milestone goal:** Load real-world assets — glTF scenes with KTX2 textures — through a managed loader.

### Issues

- **glTF 2.0 loader: geometry and node hierarchy** `[assets]`
  Parse `.gltf` and `.glb`, build `Mesh` + node graph. Use `@gltf-transform/core` or roll a minimal parser.

- **glTF: PBR material parameters (metallic-roughness, baseColor)** `[assets] [rendering]`
  Map glTF material data to engine material. Defer the shader work to Phase 4.

- **glTF: texture and sampler import** `[assets]`
  Wire glTF textures to the loader from Phase 1. Respect wrap/filter modes.

- **KTX2 / Basis Universal loader** `[assets]`
  Integrate the KTX2 loader (transcoder WASM). Pick GPU-supported format from the adapter's feature list.

- **`AssetManager`: async loading, caching, ref counting** `[assets] [architecture]`
  Single load per URL, dispose when ref count drops to zero. Promise-based API.

- **Loading state UX in the demo app** `[ui]`
  Simple progress bar while a scene loads. Useful for spotting blocking work.

- **Test asset: load the Damaged Helmet glTF** `[assets] [docs]`
  Industry-standard PBR test asset. Should render with placeholder shading; PBR comes in Phase 4.

- **Test asset: load the Sponza scene** `[assets]`
  Larger scene to validate draw-call performance and asset memory.

---

## Phase 3 — Scene & Entity System

**Milestone goal:** Refactor from ad-hoc node objects to a proper ECS with serialization.

### Issues

- **Decide: integrate bitECS vs. build minimal in-house ECS** `[ecs] [architecture]`
  Prototype both with a 10k-entity stress test. Document the choice in `/docs/architecture/ecs.md`.

- **Core components: `Transform`, `MeshRenderer`, `Camera`, `Light`** `[ecs]`
  Initial component set covering Phase 1 rendering needs.

- **Transform hierarchy with dirty-flag propagation** `[ecs]`
  Parent-relative transforms; only recompute world matrices when something changes.

- **System scheduling and update order** `[ecs] [architecture]`
  Define stages (input → simulation → animation → render). Document the contract.

- **Scene serialization to JSON** `[ecs] [tooling]`
  Save and reload an entity graph including referenced assets (by URL/UUID).

- **Entity picking via raycasting (CPU fallback)** `[ecs] [rendering]`
  Useful for editor groundwork. GPU picking can come later.

- **Migrate existing demos to ECS** `[ecs] [chore]`
  Convert the spinning cube and glTF scene demos to use entities and components.

---

## Phase 4 — Lighting & Shadows

**Milestone goal:** Make Pharos look like a modern engine — PBR, multiple light types, shadows, IBL.

### Issues

- **PBR metallic-roughness shader (Cook-Torrance)** `[lighting] [rendering]`
  GGX distribution, Schlick Fresnel, Smith geometry. Matches glTF spec.

- **Directional, point, and spot lights** `[lighting]`
  Light components, light list uniform buffer, attenuation models.

- **Shadow mapping: single directional light, one cascade** `[lighting]`
  Render to a depth texture from the light's POV; sample in the main pass.

- **Cascaded shadow maps (CSM)** `[lighting]`
  Split the view frustum into N cascades; pick the right cascade per-fragment.

- **Image-based lighting from HDR equirectangular maps** `[lighting]`
  Equirect → cubemap conversion, prefiltered specular cubemap, irradiance map, BRDF LUT.

- **Compute shader: BRDF LUT generation** `[lighting] [rendering]`
  Offline pre-computation that runs once at startup; cache result.

- **Material extension: emissive, normal map, AO map** `[lighting] [rendering]`
  Full glTF metallic-roughness feature set.

- **Visual regression test scene for lighting** `[tooling] [docs]`
  A canonical "lighting test" scene. Save reference screenshots; diff on CI eventually.

---

## Phase 5 — Animation & Physics

**Milestone goal:** Bring scenes to life — animated characters and rigid-body physics.

### Issues

- **glTF skeletal animation: skin + joint hierarchy** `[animation] [assets]`
  Parse skin data; build joint matrices each frame.

- **Compute-shader skinning** `[animation] [rendering]`
  Skin vertices on the GPU; output a transformed vertex buffer for the regular pipeline.

- **Animation playback: clip, time, looping** `[animation]`
  Sample translation/rotation/scale tracks; update transforms.

- **Animation blending (two-clip linear blend)** `[animation]`
  Crossfade between clips. Build the foundation for state machines later.

- **Rapier physics integration via WASM** `[physics]`
  Add rapier3d, run the simulation in a worker if practical.

- **`RigidBody` and `Collider` components** `[physics] [ecs]`
  Map ECS components to Rapier handles; sync transforms each frame.

- **GPU raycasting for editor picking** `[physics] [tooling]`
  Replace the Phase 3 CPU raycaster with a faster version for large scenes.

- **Debug draw: colliders, joints, contact points** `[physics] [tooling]`
  Toggleable debug overlay rendered via a simple line shader.

---

## Phase 6 — Post-Processing & Render Graph

**Milestone goal:** Refactor to a render graph and add modern post-processing.

### Issues

- **Design the render graph: passes, resources, lifetimes** `[architecture] [rendering]`
  RFC document in `/docs/rfcs/`. Passes declare inputs/outputs; the graph resolves order and transient resources.

- **Implement the render graph executor** `[rendering]`
  Topological sort, resource aliasing, barrier insertion.

- **Migrate the forward renderer onto the render graph** `[rendering] [chore]`
  Existing shadow + main + present passes become graph nodes.

- **Bloom post-process** `[rendering]`
  Downsample → blur → upsample → composite. Configurable threshold and intensity.

- **Tone mapping (ACES or Reinhard) and gamma correction** `[rendering]`
  Final pass before present. Sit downstream of bloom.

- **FXAA and/or TAA** `[rendering]`
  Start with FXAA for simplicity. TAA is a much bigger task — open as a follow-up.

- **SSAO** `[rendering]`
  Screen-space ambient occlusion. Test with the Sponza scene from Phase 2.

- **Profiling overlay: per-pass GPU time** `[tooling] [rendering]`
  Use timestamp queries where supported; show a flame-graph-style overlay.

---

## Phase 7 — Audio, Input, UI

**Milestone goal:** The non-rendering parts of "being a game engine."

### Issues

- **Audio engine: Web Audio wrapper with 3D positioning** `[audio]`
  Listener follows the active camera; sources attach to entities; basic attenuation curves.

- **Audio: load, play, loop, fade** `[audio]`
  Async sample loading; sample pooling; per-source volume/pitch.

- **Input abstraction: keyboard, mouse, gamepad, touch** `[input]`
  Action mapping layer (e.g. "jump" → space OR gamepad A). Allow rebinding.

- **Input: pointer lock and relative mouse for FPS-style controls** `[input]`
  Wrap the Pointer Lock API; expose a clean delta-x/delta-y stream.

- **In-game UI: pick an approach (immediate-mode vs. DOM overlay)** `[ui] [architecture]`
  RFC + decision. DOM overlay is simplest; immediate-mode (à la ImGui) is more flexible for debug tools.

- **HUD example: health bar, ammo counter, crosshair** `[ui]`
  Reference implementation of the chosen UI approach.

---

## Phase 8 — Editor

**Milestone goal:** Make Pharos usable by people who aren't comfortable in raw code.

### Issues

- **Editor shell: viewport + panel layout (React or Svelte)** `[tooling]`
  Resizable panels, tabbed docking optional. Pharos viewport in the center.

- **Hierarchy panel: tree view, drag-to-reparent, multi-select** `[tooling]`
  Reflects the live ECS world; selection drives the inspector.

- **Inspector panel: edit component fields by type** `[tooling]`
  Type-driven UI (numbers, vectors, colors, dropdowns for enums, asset pickers).

- **Asset browser: thumbnails, drag-into-scene, search** `[tooling]`
  File-system-style view of the project's assets folder.

- **Transform gizmos: translate, rotate, scale** `[tooling] [rendering]`
  Screen-space handles overlaid on the selected entity.

- **Scene save/load through the editor** `[tooling]`
  Round-trip through the Phase 3 serialization. Add a "dirty" indicator.

- **Undo/redo: command pattern** `[tooling] [architecture]`
  Every editor mutation goes through a command object. Stack-based undo.

- **Hot reload of scripts and shaders** `[tooling]`
  Vite HMR for engine code; live WGSL recompile on file change.

---

## Phase 9 — Reference Game

**Milestone goal:** Ship one small, complete game using only Pharos. Treat the engine as a customer of itself.

### Issues

- **Pick a genre and scope it tightly** `[design]`
  Examples: 3D puzzle, kart racer, arena shooter, top-down twin-stick. Aim for 30–60 minutes of gameplay.

- **Game design document (1–2 pages)** `[design] [docs]`
  Core loop, win/loss conditions, controls, must-haves vs. nice-to-haves.

- **Build the minimum playable prototype** `[game]`
  Player movement, one mechanic, one level. Whatever this surfaces becomes engine work.

- **Audio pass: music, sfx, footsteps** `[game] [audio]`

- **UI pass: main menu, pause, end-of-game screen** `[game] [ui]`

- **Performance pass on mid-range hardware** `[game] [rendering]`
  Profile on an integrated GPU; fix the worst offenders.

- **Public WebGPU demo build** `[game] [infrastructure]`
  Deploy to GitHub Pages or similar. The first thing strangers can play.

- **Post-mortem: what does Pharos still need?** `[docs]`
  Honest write-up of pain points discovered. Feeds the next phase of engine work.

---

