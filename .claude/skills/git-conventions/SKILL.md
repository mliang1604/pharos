---
name: git-conventions
description: Pharos repo conventions for branch names, PR titles, and PR descriptions. Use whenever creating a branch, opening a pull request, or writing/editing a PR title or body in this repo.
---

# Pharos git conventions

Apply these rules whenever you create a branch or open a PR in this repo.

## Branch names

Format:

```
<type>/<issue-number>_<PascalCaseShortDescription>
```

Rules:

- `<type>` is exactly one of:
  - `feature` — new functionality, scaffolding, or enhancements
  - `bug` — fixes for incorrect behavior
- `<issue-number>` is the GitHub issue number this branch addresses (no `#` prefix).
- `<PascalCaseShortDescription>` is a short summary in PascalCase (no spaces, hyphens, or underscores inside it). Keep it under ~5 words.
- Use exactly one underscore between the issue number and the description. Use a slash between the type and the issue number.

Examples:

- `feature/1_ProjectSkeleton`
- `feature/7_WebGpuContext`
- `bug/42_CanvasResizeFlicker`

Counter-examples (do not produce these):

- `feat/1-project-skeleton` — wrong type, wrong separators, wrong case
- `feature/1/ProjectSkeleton` — slash instead of underscore between number and description
- `feature_1_ProjectSkeleton` — underscore instead of slash between type and number
- `feature/ProjectSkeleton` — missing issue number

If no issue exists yet for the work, stop and ask the user whether to create one before branching.

## PR titles

Rules:

- Short — aim for under 70 characters.
- Imperative mood (e.g., "Add", "Fix", "Refactor", not "Added", "Adding", "Fixes").
- Specific — name the actual thing being changed, not a vague area.
- First letter capitalized.
- No period at the end.
- Focus on the **why** when possible. The diff will show what changed; the title should explain the reason or outcome the change exists for. Phrase the change in terms of the user-visible effect or the problem it solves, not the file edited.

Good examples:

- `Scaffold TypeScript + Vite project so Phase 0 work can start`
- `Fix canvas flicker on window resize`
- `Drop unused EventBus to simplify scene-graph teardown`

Bad examples:

- `update files` — vague, lowercase, not imperative
- `Added vite config.` — past tense, trailing period
- `Changes to package.json and tsconfig.json` — describes what (the diff shows that), not why

## PR descriptions (long form)

The title says **why** in one line. The description expands on it. Keep it skimmable.

Use this structure:

```markdown
## Why
<1–3 sentences on the problem, motivation, or goal. Link the issue: "Closes #N".>

## What changed
<Bulleted, high-level. One bullet per meaningful change. Skip trivial mechanical edits.>

## How to verify
<Concrete steps a reviewer can run locally to confirm the change works. Commands, URLs, expected output.>

## Notes
<Optional. Anything reviewers should know: known limitations, follow-ups deferred to other issues, design tradeoffs, decisions worth flagging.>
```

Rules of thumb:

- **Why** is required. **What changed** and **How to verify** are required unless the change is genuinely trivial (e.g., a one-line typo fix).
- Always link the issue with `Closes #N` (or `Refs #N` for partial work) so it auto-closes on merge.
- Prefer prose over screenshots for engine/internals work; use screenshots for visible rendering output.
- Do not narrate the commit history. Describe the end state.
- Do not paste the diff into the description.
- If the PR defers work to a follow-up, file a follow-up issue and reference it in **Notes**, rather than leaving a TODO in the code.
