---
tags:
  - landing
phase: "1"
---
# **Milestone goal**
A reusable rendering API — meshes, materials, cameras, scene graph, basic lighting.

# Learning Notes

- [[Issue 11 - Mesh Class]] — vertex/index buffer abstraction: string-literal format unions with `Record` exhaustiveness, deriving layouts/offsets/counts instead of duplicating them, the grouped-optional index buffer, `readonly` immutability over getters/setters, encapsulating the draw, and the `ArrayBuffer` pinning gotcha revisited (pin the type, don't cast).
- [[Issue 12 - Material and Shader]] — the appearance half: WGSL extracted to a file via Vite `?raw`, a thin `Shader` (one module, two entry points), a `UniformBuffer` helper, and a Thin `Material` that owns pipeline + bind group through `layout: 'auto'` introspection. Through-line: lifetime ownership — only store what outlives the constructor (and keep what does). Scoped to group 0; the bind-group strategy is next.
- [[Issue 13 - Bind Group Strategy]] — defining a convention rather than building a thing: bind groups grouped by update frequency (per-frame / per-material / per-object) to minimize rebinds, encoded as an `as const` `BindGroup` constant (not a numeric enum). Through-line: establish the contract before you can consume it — the cube stays a single-group case (no fake-wiring), and the real three-way split is owned by the next issues (camera → group 0, `Node` → group 2). Plus a Windows case-insensitive-filename gotcha.
