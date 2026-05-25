---
name: copyright-headers
description: Pharos repo convention for copyright headers on first-party source files. Use whenever creating a new source file under `src/`, or when reviewing a file for missing/incorrect headers.
---

# Pharos copyright-header convention

Every first-party source file in this repo must begin with a two-line SPDX-style copyright header.

## Header format

```ts
// Copyright (c) <year> Michael Liang
// SPDX-License-Identifier: MIT
```

- `<year>` is the **year the file was first created**. Do not bump it on later edits. Do not use a year range (e.g. `2026-2028`).
- Two lines, no leading blank line, no trailing blank inside the header.
- Followed by exactly one blank line, then code/imports begin.

Example for a brand-new file created in 2026:

```ts
// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

import { foo } from './foo';

export function bar() {
  // ...
}
```

## Scope

**In scope** — header is required:

- `src/**/*.ts`
- `src/**/*.tsx`
- `src/**/*.js` / `*.mjs` / `*.cjs`
- `src/**/*.wgsl`
- Any future first-party source file under `src/`.

**Out of scope** — do not add a header:

- Config files at repo root: `vite.config.ts`, `eslint.config.js`, `tsconfig.json`, `package.json`, `.prettierrc.json`, etc.
- CI workflows under `.github/`.
- Claude Code skills and settings under `.claude/`.
- Documentation: `*.md`, `LICENSE`, `README`.
- Data: `*.json`, fixtures, generated code under `src/generated/`.
- Third-party vendored files (preserve their existing headers).
- `index.html` and CSS (kept consistent with the "source code only" rule).

## Per-syntax comment style

| File type | Comment style |
| --- | --- |
| `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.wgsl` | `//` line comments |

If a new in-scope file type is introduced later (e.g. `.glsl`, `.hlsl`), use `//` line comments — every WebGPU-adjacent language we'd reasonably add supports them.

## When to apply

- **New file** — write the header before anything else. Never land a new in-scope file without one.
- **Moving / renaming a file** — keep the original year. Don't reset to the move date.
- **Splitting a file** — both halves keep the original file's year.
- **Reviewing a PR** — flag any in-scope file that's missing or has a malformed header.

## What NOT to do

- Do not append `All rights reserved.` (redundant under MIT).
- Do not paste the full MIT license text — that's what `LICENSE` is for. The SPDX identifier is the machine-readable pointer back to it.
- Do not auto-update years on existing files in bulk. Year of creation is what matters; annual sweeps add noise to git blame.
- Do not write multi-paragraph header comments. Two lines, no exceptions.
