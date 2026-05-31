---
tags:
  - landing
phase: "0"
---
# **Milestone goal** 
Project scaffolding, WebGPU context up, render a textured spinning cube with depth.

# Learning Notes

- [[Issue 3 - WebGPU Init]] — boot sequence, asymmetric failure modes, `void` for floating promises, top-level `await`, Vite dead-code elimination, TypeScript narrowing across closures.
- [[Issue 4 - Canvas Context and Clear Color]] — beginner-friendly intro to canvas contexts, swap chains, render passes, command encoders, and the rAF loop. Pairs with Issue 3.
- [[Issue 5 - Hardcoded Triangle]] — the render pipeline: WGSL vertex/fragment shaders, shader modules, the draw call, format matching, and the no-`!` scoping lesson.
- [[Issue 6 - Textured Spinning Cube]] — vertex/index buffers, the MVP matrix with uniforms and bind groups, depth testing, texture sampling, and the TS 5.7 typed-array buffer-type gotcha.
- [[Issue 7 - RAF Loop with Delta Time]] — delta-time game loop, closed-form vs stateful animation, frame-rate independence, and the update/render split.
