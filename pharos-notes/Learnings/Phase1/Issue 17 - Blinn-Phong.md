---
tags:
  - notes
phase: "1"
---
The cube finally gets *lit*. The through-line: **lighting isn't a fragment-shader add-on — it's a data-flow demand that reshapes the whole pipeline.** Blinn-Phong needs, per fragment, the surface normal `N`, the direction to the light `L`, and the direction to the camera `V`. The unlit pipeline carried *none* of the world-space data those require, so most of this issue was restructuring what flows where — geometry, transforms, and the uniform block — and only the last step was the actual lighting math.

## What we built

- [src/materials/shaders/cube.wgsl](../../../src/materials/shaders/cube.wgsl) — rewritten: a `Uniforms` struct, split transforms, world-space varyings, and the Blinn-Phong fragment shader (ambient + diffuse + specular).
- [src/main.ts](../../../src/main.ts) — a data-driven cube generator (faces → interleaved buffer, now with normals) and per-frame packing of a 240-byte uniform block.
- [src/camera/camera.ts](../../../src/camera/camera.ts) — a `worldPosition` getter (the eye, needed for the view vector).
- [test/unit/camera/camera.test.ts](../../../test/unit/camera/camera.test.ts) — tests for `worldPosition`.

## Three structural changes lighting forced

### 1. Normals on the geometry (and a generation refactor)

Lighting is dead without normals, and the cube had none. For a **sharp** edge you *want* a crease, so each face needs its own normal — which is why the cube was already 24 vertices (4 per face, unwelded back in the Mesh work): duplicated corners can each carry a distinct normal. (Contrast a **smooth** surface, where you average adjacent face normals at a *shared* vertex.)

Hand-editing the flat interleaved array to insert 3 floats into 24 rows was the wrong move — error-prone literal maintenance. Replaced it with a **data-driven generator**: describe the cube as 6 faces (each = one normal + 4 corners), then a loop interleaves `position, normal, uv` and emits the index pattern. The normal is written **once per face**, and the loop owns the layout. Same lesson as deriving the vertex layout from `formats`: describe once, compute the buffer.

### 2. Un-fusing the MVP

The old shader got a single CPU-premultiplied `mvpMatrix` — P × V × M collapsed, world space thrown away. But lighting lives in world space, so the fragment shader needs the **world position** and **world normal**. So the vertex shader now takes `model` and `viewProjection` *separately*: `worldPos = model * position`, `clipPos = viewProjection * worldPos`, and both `worldPos` and the world normal are passed as varyings. (`viewProjection × model` is still the old MVP — we just kept the factors so world space is recoverable.)

**The normal matrix.** Normals can't be transformed by the model matrix directly. Under **non-uniform** scale a normal transformed that way comes out *pointing the wrong direction* — and re-normalizing only fixes length, not direction (the circle→ellipse intuition: the surface flattens but the normal would tilt the opposite way). The fix is the **inverse-transpose** of the model's upper 3×3, computed on the CPU (`transpose(inverse(model))`) and passed as a uniform. It gracefully reduces to the plain matrix for rotation/uniform-scale. Transformed in the shader as `(normalMatrix * vec4(normal, 0.0)).xyz` — the **`0.0` w** makes it a direction (ignores translation); a point would use `1.0`.

### 3. A real uniform block — and WGSL alignment

One matrix became eight fields, which means confronting WGSL's std140-style layout rules (pure pre-knowledge, not derivable):

- `vec3` **aligns to 16** but is only 12 wide — the classic trap.
- `mat3x3` is **48 bytes**, not 36: three columns each padded to 16. A footgun, so we pass `normalMatrix` as a `mat4x4` to dodge it entirely (+16 bytes, zero padding bugs).
- A scalar (`f32`) after a `vec3` packs into that `vec3`'s trailing 4 bytes. So each `vec3` is **paired with a scalar** (`cameraPosition`+`shininess`, `lightDirection`+`ambient`, `lightColor`+`specularStrength`), giving a tight 240-byte block.

**Packing bug worth remembering:** the scalars are single `f32`s, but they were first built with `vec3.fromValues(...)` and written with `.set()` — which writes **three** floats. `specularStrength` at offset 59 overran the 60-float buffer (`RangeError` on frame 1); `shininess`/`ambient` only "worked" because the next field's `.set` overwrote their spilled zeros — pure ordering luck. A scalar is one float: `data[i] = value`, not `.set(vec3, i)`.

## The Blinn-Phong math

Four unit vectors: `N` (re-normalized — interpolation across the triangle denormalizes it), `L` (toward the light, our stored convention), `V = normalize(cameraPosition − worldPosition)`, and the **half-vector** `H = normalize(L + V)`. `H` is *the* Blinn idea: instead of Phong's "reflect `L`, compare to `V`," measure how close `N` is to the halfway vector — cheaper, stabler highlights.

Three terms:
- **Ambient** — flat floor so unlit faces aren't pure black.
- **Diffuse** — `max(dot(N, L), 0)`; the `max` matters (a face turned away gives a negative dot — negative light is nonsense).
- **Specular** — `specularStrength * pow(max(dot(N, H), 0), shininess)`; the exponent tightens the highlight.

The combine encodes a physical distinction: `(ambient + diffuse) * lightColor * baseColor` — ambient/diffuse reveal the *surface's own color*. `+ specular * lightColor` — the highlight is light *reflecting off* the surface, so it takes the **light's** color, not the texture's. (A white light puts a white hotspot on a blue cube — as it should.)

## The verification "bug" that wasn't

Stopping the spin and orbiting under the cube, the bottom face showed no highlight — prompting "does the camera rotate the light?" It doesn't, and that confusion is the lesson: **the light is world-fixed; orbiting moves the *camera*, not the cube or the light.** The bottom face's normal points away from the overhead light, so `dot(N, L) ≤ 0` → no diffuse, and you can never get specular on a face turned away from the light, regardless of camera. Whether a face is lit depends on its orientation vs. the (fixed) light; the camera only decides *where the highlight sits among the already-lit faces*. The dark bottom is proof the lighting is correct, not a bug. (Earlier, the *spin* rotated the cube's model — a different thing — which is why the highlight swept across faces then.)

## Scope

Single **directional** light, as specified — an explicit placeholder until PBR (Cook-Torrance) lands in Phase 4. Still one bind group (the per-frequency split is deferred). The lighting math is WGSL, validated at pipeline creation and verified visually; only the new reusable unit (`Camera.worldPosition`) is unit-tested.

## What's next

- **Resize handling (#19)** — the camera aspect and depth texture are still fixed at construction.
- Lighting graduates to **PBR metallic-roughness (#35)** in Phase 4; this Blinn-Phong is the stand-in until then.

## References

- [Blinn–Phong reflection model — Wikipedia](https://en.wikipedia.org/wiki/Blinn%E2%80%93Phong_reflection_model) — the model, the half-vector, and how it differs from Phong.
- [LearnOpenGL — Advanced Lighting (Blinn-Phong)](https://learnopengl.com/Advanced-Lighting/Advanced-Lighting) — the half-vector specular and why it beats Phong's `reflect`; has an interactive Phong-vs-Blinn toggle.
- [LearnOpenGL — Basic Lighting](https://learnopengl.com/Lighting/Basic-Lighting) — the ambient + diffuse + specular decomposition and the `N`/`L`/`V` vectors.
- Blinn, J. F. (1977). "Models of Light Reflection for Computer Synthesized Pictures." *Computer Graphics (SIGGRAPH '77)*, 11(2), 192–198 — the original half-vector paper.
- Phong, B. T. (1975). "Illumination for Computer Generated Pictures." *Communications of the ACM*, 18(6), 311–317 — the Phong model this modifies.
- Akenine-Möller, Haines, Hoffman et al. *Real-Time Rendering* (4th ed.), Ch. 5 (shading) — the standard textbook treatment.
