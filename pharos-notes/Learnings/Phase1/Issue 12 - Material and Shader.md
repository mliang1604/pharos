---
tags:
  - notes
phase: "1"
---
The sibling of [[Issue 11 - Mesh Class]]. Where the `Mesh` issue pulled the cube's *geometry* out of `main.ts` — buffers and layout gathered into an object that owns and draws itself — this one pulls out the cube's *appearance*: the inline WGSL, the render pipeline, the per-frame uniform, and the bind group. Same instinct, the other half. And the same proof of success: not a single pixel changes. The cube spins and tumbles exactly as before; `npm run dev` is the only test that counts here, because these classes can't even be constructed without a real GPU.

## What we built

Three small abstractions plus a shader file, then the rewiring of `main.ts`:

- [src/materials/shaders/cube.wgsl](../../../src/materials/shaders/cube.wgsl) — the WGSL lifted out of the inline backtick string, now its own file, imported via Vite's `?raw`.
- [src/materials/shader.ts](../../../src/materials/shader.ts) — `Shader`, a thin wrapper around a compiled `GPUShaderModule` plus its entry-point names.
- [src/gpu/uniformBuffer.ts](../../../src/gpu/uniformBuffer.ts) — `UniformBuffer`, the create-once / write-every-frame helper.
- [src/materials/material.ts](../../../src/materials/material.ts) — `Material`, which owns the render pipeline and its bind group and exposes a single `bind(pass)`.

All three are pure orchestration, so all three are **unit-tested** against a fake `GPUDevice` — the same trick the `Mesh` issue ended on.

## The through-line: lifetime ownership

[[Issue 11 - Mesh Class]] had one instinct applied everywhere — *derive, don't duplicate*. This issue has its own: **don't let an object own data whose lifetime doesn't match its own.** It showed up at three different scales, and getting each one right is most of the design.

The phrasing has two edges:

- *Don't keep what you won't reuse.* A field is a commitment to hold a value for the object's whole life. If nothing reads it after the constructor, it shouldn't be a field.
- *Do keep what you will.* The flip side — if a value **is** used for the object's whole life, it has earned a field.

Same rule, opposite verdicts depending on the value's actual lifetime.

## WGSL module loading, and what `?raw` actually does

The first move is the smallest: cut the shader text out of the backtick string in `main.ts` and into `cube.wgsl`, then bring it back with

```ts
import cubeShaderCode from '@/materials/shaders/cube.wgsl?raw';
```

The key realization is that **the backticks don't move — they disappear.** A backtick string and a `?raw` import are two ways to get the *same* `string`; you're swapping one for the other, not nesting them. `?raw` is a Vite feature: the suffix tells the bundler "don't process this file, hand me its exact text," and Vite **inlines that text into the JS bundle at build time** — so there's no runtime fetch (contrast `?url`, which gives a URL to go fetch). The two SPDX header lines at the top of the `.wgsl` become a harmless `//` comment in the shader source.

No `.d.ts` is needed: `vite/client` (already in the tsconfig `types`) ambiently declares `*?raw` modules as `string`, so the import type-checks with zero setup. `.wgsl` is in-scope for the copyright-header convention, so it gets the header like any other source file.

## Shader: one module, two entry points

`Shader` is deliberately thin. The interesting design question is *what it stores*, and the answer comes from asking what the pipeline reads off a shader:

```ts
public readonly shaderModule: GPUShaderModule;
public readonly vertexEntryPoint: string;
public readonly fragmentEntryPoint: string;
```

Two facts worth internalizing:

- **There is one module, not two.** `cube.wgsl` contains *both* `vs_main` and `fs_main`; compiling it yields a single `GPUShaderModule` holding both functions. The vertex and fragment *stages* share that one module — what differs is the `entryPoint` each stage calls. So `Shader` exposes one `shaderModule`, and the pipeline selects functions out of it by name. (The first draft tried `shader.vertex` / `shader.fragment` as if there were two modules — the compiler corrected it.)
- **The entry-point names are parameters with defaults**, not hardcoded constants: `vertexEntryPoint = 'vs_main'`, `fragmentEntryPoint = 'fs_main'`. This is the case where "make it configurable" is *not* speculative generality, because the default makes the configurability **free** — the common call is still `new Shader({ device, code })`, identical to hardcoding, but no future shader is *forced* to name its function `vs_main`. Worth seeing clearly: the entry-point name is a magic string — a contract with the WGSL text that TypeScript cannot verify (rename the function and forget here, and it fails at pipeline creation, not compile). Parameterizing doesn't fix that; it just keeps the string co-located with the module it belongs to.

The lifetime rule's *first* appearance is here: the first draft stored `device`, `code`, and `label` as private fields. But none of them is read after the constructor runs — they were used once to call `createShaderModule` and then carried dead weight (a whole copy of the WGSL string) for the object's life. They became constructor-locals; only the three fields above survive.

## UniformBuffer: the lifetime rule, inverted

The uniform buffer is different from the static geometry buffers of [[Issue 11 - Mesh Class]]. Those are created *and* written once (`createGpuBufferWithData`). The MVP uniform is created empty and **written every frame**, because the matrix changes as the cube spins. That create-once / write-repeatedly shape earns its own helper:

```ts
export class UniformBuffer {
  public readonly buffer: GPUBuffer;   // the scene reads this to bind it
  private readonly device: GPUDevice;  // write() needs it every frame

  write(data: GPUAllowSharedBufferSource, offset = 0): void {
    this.device.queue.writeBuffer(this.buffer, offset, data);
  }
}
```

Here the lifetime rule flips. In `Shader`, `device` was a constructor-local because nothing read it later. Here `write()` calls `device.queue.writeBuffer(...)` *every frame* — so `device`'s useful lifetime **is** the object's lifetime, and it earns a field. The same rule, the opposite answer, decided purely by whether the value is used again.

`buffer` is `public readonly` for a parallel reason on the *access* axis: the scene needs it to build the Material's bind group (`{ binding: 0, resource: { buffer: uniforms.buffer } }`). Expose exactly what's read from outside, no more — the same discipline that makes only `vertexBufferLayout` public on `Mesh`. (Caught before wiring: a `private buffer` compiles fine until the scene tries to read it.)

## Material: Thin by roadmap, not by reflex

The real design fork was **how much `Material` should own**. The bind group wires three resources — the uniform buffer, the texture, the sampler. Who creates them?

- **Fat:** `Material` creates and owns the uniform buffer, exposing `material.setUniform(mvp)`.
- **Thin:** the scene owns the resources and hands them in as a list of bind entries; `Material` owns only the pipeline and the bind group.

What settles it is the roadmap, and it hinges on a reclassification. Under the bind-group strategy coming in the next issue (group 0 = per-frame, 1 = per-material, 2 = per-object), today's MVP uniform is **not material data at all**: it's `projection · view` (the camera, per-frame) times `model` (the object, per-object). A Fat `Material` would bake in `setUniform(mvp)` — building on the misconception that the MVP belongs to the material, only to have it ripped back out a few issues later. That's the lifetime rule at the largest scale: a `Material` is *per-setup* config; the MVP is *per-frame* data; letting one own the other couples two different clocks.

So `Material` is Thin. It takes a `Shader` plus pipeline config plus a **generic list of `entries`**, and it makes no claim about which resource is which. The genericity is the future-proofing: when glTF arrives with five textures, they're just more entries — no structural change.

### Bind group layout introspection

The "introspection" in the issue title is concrete and small. `Material` builds the pipeline with `layout: 'auto'`, which tells WebGPU to *infer* the bind-group layout from the WGSL. Then it asks the pipeline for that inferred layout and fills it with the scene's resources:

```ts
this.pipeline = device.createRenderPipeline({ layout: 'auto', /* … */ });
const layout = this.pipeline.getBindGroupLayout(0);   // the inferred shape
this.bindGroup = device.createBindGroup({ layout, entries });
```

The payoff of `layout: 'auto'` is that **you never hand-author a bind-group layout** — no list of `{ binding, visibility, buffer/texture/sampler }` slot descriptions to keep in sync with the shader. The hardest bug here was conflating two superficially similar types: `GPUBindGroupLayoutEntry` (a *slot description* — what you'd write if hand-authoring a layout) versus `GPUBindGroupEntry` (a *resource* — `{ binding, resource }`). With `layout: 'auto'` you only ever supply the latter. The compiler spelled out the difference: *"Property `resource` is missing in type `GPUBindGroupLayoutEntry`."*

The constructor has a forced order — pipeline first, because the bind group depends on the layout the pipeline introspects. And the surviving fields are exactly what `bind(pass)` needs:

```ts
private readonly pipeline: GPURenderPipeline;
private readonly bindGroup: GPUBindGroup;   // the filled form — not the layout

bind(pass: GPURenderPassEncoder): void {
  pass.setPipeline(this.pipeline);
  pass.setBindGroup(0, this.bindGroup);     // group 0 hardcoded — see "scope" below
}
```

The introspected `layout` is a constructor-local: used to build the bind group, then never touched again. (The first draft stored `bindGroupLayout` as a field — the lifetime rule, a third time.)

### `exactOptionalPropertyTypes`, again

The same nuance from [[Issue 11 - Mesh Class]]: with `exactOptionalPropertyTypes`, an optional property may be **absent**, not present-and-`undefined`. So you can't pass `primitive,` straight through (that writes `primitive: undefined`). Each optional is handled by its nature: `primitive` has a sensible default (`primitive ?? { topology: 'triangle-list' }`, always present), while `depthStencil` and `label` have none and are **conditionally spread** (`...(x !== undefined ? { x } : {})`) so the key is omitted entirely when absent.

## Scope: group 0 only

The `setBindGroup(0, …)` is hardcoded on purpose. The group 0 / 1 / 2 convention — per-frame, per-material, per-object — is the *next* issue's job. This issue builds the skeleton ("a material is a pipeline plus a bind group") and deliberately makes no commitment to the grouping. The hardcoded `0` is the seam the next issue generalizes.

## The payoff in `main.ts`

The whole issue shows up as a deletion. The four inline blocks — a 25-line WGSL string, a hand-built pipeline with `layout: 'auto'` and `vs_main`/`fs_main` typed inline, a raw `createBuffer`, and a 20-line `createBindGroup` calling `getBindGroupLayout(0)` — collapse into three honest constructor calls. `startRenderLoop` stops juggling a pipeline, a raw buffer, and a bind group; it holds a `material` and a `uniforms`, and its three appearance lines become `uniforms.write(mvpData)` and `material.bind(pass)`. Net: roughly **96 lines deleted, 36 added.** What's left in `initScene` is the residue the structure doc predicted — pure scene wiring: make the resources, hand them to the abstractions, start the loop.

## Testing pure orchestration

Like `Mesh`, these classes don't render — they create GPU resources and record interactions — so a fake `GPUDevice` plus spy render pass tests them with no GPU:

- `UniformBuffer` stubs the browser-only `GPUBufferUsage` global (the types ship, the values don't) and asserts the buffer is `UNIFORM | COPY_DST`, and that `write` forwards `(buffer, offset, data)`.
- `Shader` asserts the module is compiled and exposed, the entry points default and override, and `label` is forwarded only when given.
- `Material` mocks a pipeline whose `getBindGroupLayout(0)` returns a sentinel, then asserts the bind group is built from *that* layout — i.e. that the introspection is actually wired — plus the default primitive, the passthrough of a custom primitive / depthStencil, and that `bind` sets the pipeline and group-0 bind group.

One lint lesson fell out: nested `expect.objectContaining(...)` returns `any`, which trips `no-unsafe-assignment`. Since `Material` builds the `vertex` / `fragment` sub-objects with a known, closed set of keys, asserting them as exact object literals (inside a single outer `objectContaining`) is both lint-clean and stricter.

## A small `verbatimModuleSyntax` note

`material.ts` imports `Shader` only to annotate a parameter type — it never writes `new Shader(...)`. Under `verbatimModuleSyntax`, that must be `import type { Shader }`: a guaranteed-erased, zero-runtime import that can't pull `shader.ts` into the runtime graph or create an import cycle. (In `main.ts`, where `Shader` and `Material` are *constructed*, they stay value imports.) It's the same dependency-direction hygiene the structure doc cares about, enforced one import at a time.

## What's next / open threads

- **Define the bind group strategy** — group 0 / 1 / 2 as per-frame / per-material / per-object, encoded as constants. This is what generalizes the hardcoded `setBindGroup(0, …)` and decides where the camera/model uniforms actually live (which is why `Material` stayed Thin).
- **Per-material resources, eventually.** A `Material` *will* own its textures and parameters once "per-material" (group 1) is a real thing — the Thin decision was about *today's* MVP uniform not being material data, not a rule that a material owns nothing forever.
- **Multiple bind groups.** `Material` binds exactly group 0 today. Per-frame and per-object groups arrive with the strategy work.
