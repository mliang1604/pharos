---
tags:
  - landing
phase: "1"
---
# **Milestone goal**
A reusable rendering API — meshes, materials, cameras, scene graph, basic lighting.

# Learning Notes

- [[Issue 11 - Mesh Class]] — vertex/index buffer abstraction: string-literal format unions with `Record` exhaustiveness, deriving layouts/offsets/counts instead of duplicating them, the grouped-optional index buffer, `readonly` immutability over getters/setters, encapsulating the draw, and the `ArrayBuffer` pinning gotcha revisited (pin the type, don't cast).
