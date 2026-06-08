---
tags:
  - notes
phase: "2"
---
One function owns the deploy-base prefix so call sites can't forget it. The through-line: **a bug that only appears in production is a centralization smell — make the correct path the only path.** Absolute `/asset` URLs work in dev and 404 on GitHub Pages; the fix isn't "remember the prefix everywhere," it's "have exactly one place that knows the prefix exists."

## What we built

- [src/assets/assetUrl.ts](../../../src/assets/assetUrl.ts) — `assetUrl(path, base = import.meta.env.BASE_URL)`: strip a leading slash off `path`, prefix `base`.
- [test/unit/assets/assetUrl.test.ts](../../../test/unit/assets/assetUrl.test.ts) — dev base `/`, prod base `/pharos/`, leading-slash tolerance, default-from-env.
- Migrated all six call sites ([src/main.ts](../../../src/main.ts) ×4, [src/gpu/ktx2.ts](../../../src/gpu/ktx2.ts) ×2) off hand-written `` `${import.meta.env.BASE_URL}…` `` template strings.

## The production-only bug class

`vite.config.ts` sets `base: '/pharos/'` in prod but `/` in dev. A fetch of `/textures/uv-grid.png` resolves to `github.io/textures/…` → **404**, but `github.io/pharos/textures/…` is where the file actually is. It works locally and breaks only when deployed (#110). Manually prefixing `import.meta.env.BASE_URL` at each call site (#111) fixes the instance, not the class — every *future* asset fetch is one forgotten prefix away from the same 404. The durable fix is to delete the opportunity to forget: one helper, and nothing else references `BASE_URL`. The test that this holds is a grep — after migration, the only `import.meta.env.BASE_URL` left in `src/` is inside `assetUrl.ts`.

## Injected base — DI for a free unit test

`base` is a **defaulted parameter**, not a bare read of `import.meta.env.BASE_URL` inside the body. Same dependency-injection move as the `AssetManager`'s injected `load`: normal callers still write `assetUrl(path)`, but the test drives both environments by *passing* the base — `assetUrl(p, '/')` and `assetUrl(p, '/pharos/')` — with zero env mocking. The alternative (read env in the body, `vi.stubEnv('BASE_URL', …)` in the test) works too, but injection keeps the seam in the signature where it's visible. One test still exercises the real default path to confirm the wiring to `import.meta.env`.

## The join detail

`base` always ends in `/` (Vite guarantees it), so the helper must *not* assume the path is slash-prefixed — otherwise `/pharos/` + `/textures` → `/pharos//textures`. `path.replace(/^\/+/, '')` strips one-or-more leading slashes so both `'textures/x'` and `'/textures/x'` join to a single clean URL.

## `tsc` clean ≠ correct (again)

First draft returned `` `${base}strippedPath` `` — `strippedPath` as **literal text**, missing its `${…}`. Every call would have returned `"/strippedPath"`. It typechecks perfectly: a template with no interpolation is just a valid string, so the compiler sees nothing wrong. Caught by reading it, not by the type system — the same lesson the glTF note keeps logging. (The unit tests would have caught it too, which is the argument for writing them.)

## Bundled vs runtime assets

The issue floated importing assets as modules (`import url from '…?url'`) so Vite rewrites base + content-hash and an absolute-root URL becomes impossible to *write*. That's stronger where it applies — but `public/` assets (our textures, models, Basis WASM) are served verbatim and **can't** be module-imported, so their URLs are resolved at runtime and still need the helper. So: helper for `public/`/runtime paths; module imports remain the better tool for bundled source assets later.

## What's next

- **#26 Damaged Helmet / #27 Sponza** — the first real consumers; their runtime loads go through `assetUrl`, and (once wired) the `AssetManager`, which keys on the URL the helper produces.
