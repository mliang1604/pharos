# Pharos — working notes for Claude

A WebGPU game engine in TypeScript, built issue-by-issue as a learning project.
This file is the repo's shared workflow contract; keep it current.

## Project map

- **[PLAN.md](PLAN.md)** — phased milestones, one entry per GitHub issue. The roadmap.
- **`src/`** — engine code (`assets/`, `geometry/`, `materials/`, `gpu/`, `scene/`, `camera/`, `math/`, `debug/`).
- **`pharos-notes/`** — Obsidian vault of per-issue learning notes (see below).
- **`.claude/skills/`** — `git-conventions`, `copyright-headers`, `shell-multiline-messages`.

## Build & test

- `npm run dev` — Vite dev server. `npm run build` — production build.
- `npm run test` — Vitest (`--project unit`, Node env, GPU mocked).
- `npx tsc --noEmit` — typecheck. `npx eslint src test` — lint.
- **Strict TS gotchas that recur:** `noUncheckedIndexedAccess` (indexed access is `T | undefined` — guard or `?? default`) and `exactOptionalPropertyTypes` ("omitted" ≠ "present-but-undefined" — conditional-spread optionals).

## Conventions

- **Branches / PR titles / PR descriptions:** `.claude/skills/git-conventions`.
- **Copyright headers** on new first-party `src/` files: `.claude/skills/copyright-headers`.
- **Multiline commit/tag/PR bodies:** `.claude/skills/shell-multiline-messages`.
- **Markdown is in `.prettierignore`** — hand-formatted; do not reformat `.md`.
- **Dependencies:** toolchain majors (TS 6, ESLint 10, Vite 8) are intentionally held until native TypeScript 7 ships.
- **Tests:** keep comments minimal — good names + assertions self-document; only annotate non-obvious infra.

## PLAN.md ↔ GitHub

`PLAN.md` and GitHub issues/milestones are two views of one plan — **keep them in sync.** Each line carries `[#NN](url)` + a status marker (✅ merged · 🔲 todo · ⏳ in review). When work defers scope, **file a follow-up issue** and record it in the plan.

## How an issue lands

1. **Branch** per git-conventions (`feature|bug/NN_PascalCase`), off latest `main`.
2. **Implement**, and write a **per-issue learning note** on the branch (part of the PR): `pharos-notes/Learnings/PhaseN/Issue NN - Title.md`, then update that phase's landing page and `pharos-notes/Welcome.md`. Note conventions: YAML frontmatter + filename-as-title (no H1); concise, skimmable, with a bolded through-line.
3. **Open the PR** (`Closes #NN`), title/body per git-conventions.
4. **CI-gated merge sequence** — gate every step on green:
   1. Watch CI (`gh pr checks <pr> --watch`); only if green →
   2. flip the issue to ✅ merged in `PLAN.md`, commit, push;
   3. watch CI again; only if green →
   4. `gh pr merge <pr> --merge --delete-branch`.
5. **After merge:** annotated checkpoint tag `learn/NN-name` on the merge commit, message `Learning checkpoint NN: …`; push it.

## Working mode (context, not a hard rule)

Sessions are often run in **code-tutor mode**: the user writes the implementation in-file and Claude reviews; Claude owns the plumbing (branch, scaffold, PR, tag) and writes tests when the user opts out. This is a per-session choice — a non-learning task need not follow it, but the conventions above still apply.
