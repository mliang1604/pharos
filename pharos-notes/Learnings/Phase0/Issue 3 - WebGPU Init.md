# Issue 3 - WebGPU Init

Notes from PR #83 (`feature/3_WebGpuDeviceInit`). The transferable concepts, not a line-by-line file dump.

## WebGPU's three-step boot

```
navigator.gpu          ← feature detection
   ↓
.requestAdapter()      ← which GPU?
   ↓
.requestDevice()       ← open a session against it
   ↓
GPUDevice              ← the handle for every render command
```

Every later rendering issue assumes the device is in hand. Each step can fail for a different reason, and that's why the init code in `src/main.ts` has three separate error branches.

### The asymmetric failure modes

| Step | API | Failure mode |
| --- | --- | --- |
| Feature-detect | `navigator.gpu` | Undefined when unsupported |
| Adapter | `requestAdapter()` | **Resolves to `null`** on failure |
| Device | `requestDevice()` | **Rejects** on failure |

This is easy to get wrong. `requestAdapter` won't throw — it just hands back `null`, so a `try/catch` around it would never fire. `requestDevice` *will* throw, so it needs a `try/catch`. Don't paste the same pattern around both.

## Feature detection vs UA sniffing

Always check `if (!navigator.gpu)` — never look at the user-agent string. Browsers update independently; the API existence is the only honest signal.

## `void` for intentionally-floating promises

```ts
void device.lost.then((info) => { ... });
```

`device.lost` resolves only when the device dies (driver crash, GPU reset, tab backgrounded too long). I don't want to await it — that would block forever during normal operation. But the ESLint rule `@typescript-eslint/no-floating-promises` flags any unhandled promise as a bug.

The `void` operator is the lint-approved escape hatch: it says "I know this is a promise; I'm intentionally not chaining `.then`/`.catch`/`await`." Use it sparingly and only when the unawaited promise is genuinely intentional (long-lived listeners, fire-and-forget logging).

## Top-level `await`

```ts
const device = await initWebGpu();
```

`await` at module scope, no enclosing `async` function. Works because:

- ES2022 modules support it.
- `tsconfig.json` targets ES2022.
- Vite supports it natively.

If we ever target older runtimes, wrap in `async function main() { ... }; main();`.

## Vite's `import.meta.env.DEV` dead-code elimination

```ts
if (import.meta.env.DEV) {
  console.groupCollapsed('[pharos] WebGPU adapter');
  console.info('info:', adapter.info);
  ...
}
```

`import.meta.env.DEV` is **not** a runtime variable lookup. Vite statically replaces it at build time — `true` in dev, `false` in prod. Because it then becomes `if (false) { ... }`, the whole block is dead-code-eliminated by the minifier. Zero bytes shipped to production, no runtime gate needed.

Same trick for `import.meta.env.PROD`, `import.meta.env.MODE`, custom `import.meta.env.VITE_*` strings from `.env` files.

## TypeScript narrowing doesn't cross closure boundaries

The wrong way:

```ts
const statusEl = document.querySelector<HTMLElement>('#status');
if (!statusEl) throw new Error('...');

function setStatus(msg: string): void {
  statusEl.textContent = msg;  // ← TS error: statusEl is HTMLElement | null
}
```

TypeScript narrows `statusEl` to `HTMLElement` in the outer scope after the throw, but inside `setStatus` it widens back. The reasoning: the variable could be reassigned between the check and the function call. (`statusEl` is `const` here, so that's not actually possible, but TS uses the same rule regardless.)

Three ways to fix:

1. **Non-null assertion** — `statusEl!.textContent = msg`. Works but it's a smell; you're overriding the type system instead of helping it.
2. **Capture into a closure-local const** — `const safe = statusEl; function setStatus() { safe.textContent = ... }`. Verbose.
3. **Extract the check into a helper that returns non-null** — what we landed on:

```ts
function requireElement<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Expected element ${selector} in index.html`);
  return el;
}

const statusEl = requireElement<HTMLElement>('#status');
```

`statusEl` is typed `HTMLElement` (non-null) at its declaration. Closures see it that way directly.

## Generic helpers on `querySelector`

```ts
const canvas = document.querySelector<HTMLCanvasElement>('#app');
```

The `<HTMLCanvasElement>` generic tells TS what *kind* of element to expect. Without it you get `Element | null` and can't call `.getContext()`. This isn't a runtime check — TS doesn't verify that `#app` is actually a `<canvas>` — it's a type assertion. If the HTML doesn't match, runtime methods will throw.

## `@webgpu/types` for ambient types

The browser ships `GPUDevice` etc., but `@types/dom` doesn't include them. The package is **types-only** — zero runtime bytes — and it ships as ambient declarations. Land it via:

```json
// tsconfig.json
"types": ["vite/client", "@webgpu/types"]
```

The `types` array means "load these globally as if every file imported them" — the right shape for browser APIs that should feel built-in.

## ARIA live regions for status messages

```html
<div id="status" role="status" aria-live="polite">...</div>
```

- `role="status"` marks this as a status region for screen readers.
- `aria-live="polite"` means "announce changes when the user is idle." The alternative `aria-live="assertive"` interrupts immediately — reserve that for critical errors.

When text content of a live region changes, the screen reader speaks it. No JS hook needed; the browser handles it.

## `data-*` attributes + CSS attribute selectors

```html
<div id="status" data-tone="error">...</div>
```

```css
#status[data-tone='error'] { background: red; }
```

```ts
statusEl.dataset['tone'] = 'error';
```

Setting `dataset.tone` writes back to the `data-tone` attribute, which the CSS selector picks up. Clean separation: HTML carries the semantic state, CSS owns the visual response, JS only flips the flag. Beats `classList.add('error')` because the state is named, not boolean.
