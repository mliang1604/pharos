---
tags:
  - notes
phase: "2"
---
A cache that owns asset *lifetime*, not asset *decoding*. The through-line: **the manager is a reference-counting lifecycle owner — it dedups loads and disposes deterministically, while a single injected `load` function does the actual work.** It generalizes the per-file "load once, reference by index" pass (`loadTextures`, `loadKtx2Texture`) into one process-wide policy that any resource type can reuse.

## What we built

- [src/assets/assetManager.ts](../../../src/assets/assetManager.ts) — `AssetManager<T extends Disposable>` with `acquire(url)` / `release(url)`, a `Map<string, { asset: Promise<T>; refCount }>` cache, and a `Disposable` interface.
- [test/unit/assets/assetManager.test.ts](../../../test/unit/assets/assetManager.test.ts) — dedup, ref-count keep-alive, dispose-exactly-once, reload-after-release, failed-load eviction, release-of-unknown.

## Lifecycle owner, not loader

The manager is generic over `T extends Disposable` and takes the real loader by injection (`constructor(private readonly load)`). It knows *nothing* about textures, glTF, or KTX2 — only how to count references and call `dispose()`. That's the same boundary instinct from the loaders (#20–#23): the policy (caching, ref-counting) is separable from the mechanism (decode bytes → GPU resource), so it lives in its own reusable unit. The constraint `extends Disposable` is the entire contract it needs.

## Cache the promise, not the asset

The cache value is `Promise<T>`, not `T`. This is what makes **single-flight** work: two `acquire(url)` calls that arrive while the load is still in flight both get the *same pending promise* — `load` runs once, both await the one result. Caching the resolved asset instead would force `acquire` to be synchronous-or-not depending on timing, and a burst of concurrent acquires would each kick off a duplicate load. The promise *is* the dedup key for in-flight work.

## Reference counting + deterministic dispose

`acquire` ++ the count (or seeds it at 1 on a miss); `release` -- it, and at `<= 0` deletes the entry and disposes. The API is deliberately symmetric — every `acquire` is a borrow that must be paired with a `release`, like `malloc`/`free`. Disposal is **deterministic** (it happens the instant the last reference drops), not left to GC — GPU resources aren't memory the JS runtime tracks, so we can't wait for finalization.

Dispose is scheduled as `asset.then((a) => a.dispose()).catch(() => {})`:
- `.then` because the asset may **still be loading** when the last reference is released (acquire → release while in flight) — we dispose whatever it resolves to, whenever it arrives.
- the trailing `.catch(() => {})` because if that load *rejected*, there's nothing to dispose and we don't want an unhandled rejection from this side-chain.

## The failed-load trap (and the reload race)

The subtle bug: a rejected `load(url)` would otherwise sit in the cache as a **poisoned entry** — every future `acquire(url)` replays the same rejection, so a transient network failure makes the URL unloadable for the process lifetime. Fix: evict on failure with a side-chain `.catch` in the miss branch.

But a *bare* `cache.delete(url)` in that catch can delete the **wrong** entry. The race:

1. `acquire('a')` → entry **E1** (load pending)
2. `release('a')` → refCount 0 → E1 deleted
3. `acquire('a')` → entry **E2**, fresh load
4. E1's original load finally rejects → its catch fires → would nuke **E2**

So the catch is **identity-guarded** — `if (this.cache.get(url) === entry) this.cache.delete(url)` — delete only if the entry still in the map is the one whose load failed. The eviction is a *separate* chain from the promise returned to the caller, so the acquirer still sees the rejection; the catch only cleans the cache.

## Testing async lifecycle without a GPU

The loader is a `vi.fn` returning a fake `Disposable` whose `dispose` is itself a mock — `toHaveBeenCalledTimes` then asserts the lifecycle exactly (disposed once at zero; *not* disposed while a reference remains). The one infra wrinkle: dispose is scheduled on a microtask via `.then`, so tests need a `flush()` (`setTimeout(_, 0)`) to drain the queue before asserting. Two lint/type traps the strict config caught: bare `acquire(...)` calls are floating promises (prefix `void`), and `vi.fn()` must be parametrized `vi.fn<() => void>()` so the mock type satisfies `Disposable.dispose`.

## What's next

- **#26 Damaged Helmet / #27 Sponza** — real test assets whose textures route through the manager, so a scene sharing one texture across materials loads it once.
- **#112 `assetUrl` helper** — base-path-correct URLs; the manager keys on URL, so the two compose directly.
