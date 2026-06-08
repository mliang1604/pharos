---
tags:
  - notes
phase: "2"
---
Load GPU-compressed textures that stay compressed in VRAM. The through-line: **author one supercompressed file, transcode it at load time to whatever the GPU supports** — "the JPEG of GPU textures." The engine negotiates a compressed format from the adapter, a WASM transcoder converts the universal payload to it, and we upload the compressed blocks directly.

## What we built

- [src/main.ts](../../../src/main.ts) `initWebGpu` — request the `texture-compression-bc`/`-etc2`/`-astc` features the adapter supports (the gate for using compressed formats), plus a demo quad rendering the transcoded photo.
- [src/gpu/ktx2.ts](../../../src/gpu/ktx2.ts) — `selectKtx2Target` (device feature → format), and `loadKtx2Texture` (lazy WASM init + transcode).
- [src/gpu/texture.ts](../../../src/gpu/texture.ts) — `Texture.fromCompressed` (upload pre-compressed mip levels with block-based row pitch).
- `public/basis/basis_transcoder.{js,wasm}` (vendored from `KhronosGroup/basis_universal`), `public/textures/test.ktx2` (a Basis ETC1S asset).
- [test/unit/gpu/ktx2.test.ts](../../../test/unit/gpu/ktx2.test.ts), [test/unit/gpu/texture.test.ts](../../../test/unit/gpu/texture.test.ts).

## Why GPU-compressed, and why Basis

A PNG decompresses to **raw RGBA in VRAM** (a 2K texture ≈ 16 MB). **Block-compressed** formats (BC/ETC2/ASTC) keep 4×4-texel blocks compressed *in* VRAM, decoded by the texture unit at sample time — ~4–8× less memory/bandwidth. The catch: the families are **hardware-specific** (BC desktop, ETC2/ASTC mobile). **Basis Universal** is a supercompressed intermediate (ETC1S or UASTC); a **transcoder** converts it at load to the family the current GPU has. **KTX2** is the container. So: one asset, every platform.

## Device-feature gating

Compressed formats are *optional* WebGPU features. Filter `adapter.features` to the supported compression families and pass them to `requestDevice({ requiredFeatures })` — **at device creation.** (No "optional features" knob exists; requiring an unsupported one *rejects*, so pre-filter. Using a `bc7-…` format without having enabled `texture-compression-bc` is a validation error.) `adapter.features` advertises everything; `device.features` is what you actually enabled — selection reads the latter.

## Format selection

`selectKtx2Target(device)` maps the enabled feature → `{ gpuFormat, basisFormat }`, preferring BC → ASTC → ETC2, with an **uncompressed `RGBA32` fallback** so KTX2 loads even where no compressed family exists (the optimization degrades, it never hard-fails). `basisFormat` is *our* tag, deliberately separate from the transcoder's enum — selection depends on WebGPU vocabulary, not the WASM module's (the boundary instinct again).

## Compressed upload

`fromCompressed` does `createTexture({ format, mipLevelCount })` then `writeTexture` per level — **no mip generation** (KTX2 ships its mips). The subtlety is the **row pitch**: compressed data is per-block, so `bytesPerRow = ceil(width / blockWidth) × blockBytes` (4×4 blocks of 16 bytes for BC7/ETC2/ASTC; 1×1×4 for the uncompressed fallback). Get this wrong and WebGPU rejects the write.

## Integrating an Emscripten WASM module

The transcoder is `basis_transcoder.js` (a classic Emscripten script that defines a global `BASIS` factory) + `.wasm`. Wiring it: inject the script, `await BASIS({ locateFile })` (how Emscripten finds the `.wasm`), `initializeBasis()`, cache the module (a lazy singleton — the async *acquisition* layer again). Then `new module.KTX2File(bytes)` → `startTranscoding()` → per level `getImageTranscodedSizeInBytes` + `transcodeImage(dst, …, formatEnum, …)`.

Two integration lessons:
- **The format enum wasn't exposed** under `module.TranscoderTextureFormat`. Fix (what three.js does): the `transcoder_texture_format` values are **stable integers** (BC7_RGBA=6, ETC2_RGBA=1, ASTC_4x4_RGBA=10, RGBA32=13) — hardcode them rather than reading an unexposed module member.
- **Couldn't verify headless.** No GPU/browser in the dev loop, so steps 3–4 were *pair-debugged*: I drafted, the user ran it in the browser and reported (`Cannot read properties of undefined (reading 'BC7_RGBA')` pinpointed the enum issue exactly), iterate. The thing that *can't* be checked statically gets checked by running it.

## Provenance gotchas

- The right transcoder source is Khronos (`KhronosGroup/basis_universal`'s `webgl/transcoder/build`), not a copy vendored by another project. (`KhronosGroup/Basis-Universal-Transcoders` exists too but is UASTC-only, low-level, experimental.)
- KTX-Software's test assets are **Git LFS** — a raw download yields a 130-byte *pointer*, not the file. Use the `media.githubusercontent.com/media/...` LFS endpoint.

## Scope / deferred

- **glTF KTX2 (`KHR_texture_basisu`)** — wiring KTX2 *through* the glTF loader (a texture's `extensions.KHR_texture_basisu.source`) is a follow-up; the demo renders a standalone quad, not a glTF-referenced KTX2.
- URI/data-URI images; the lower-level modular UASTC transcoders.

## What's next

- **#24 `AssetManager`** — caching + ref-counting, generalizing the indexed acquisition pass (`loadTextures` / `loadKtx2Texture`) across files.
- **#35 (Phase 4)** — PBR shading that uses these textures for real lighting.
