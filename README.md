# Pharos

A WebGPU game engine built in TypeScript.

Pharos is a from-scratch exploration of what a modern, web-native game engine looks like when WebGPU is the only graphics target. The goal is a small, readable, hackable engine — not a Unity competitor — that's complete enough to ship a real game from end to end.

## Status

Early development. See [PLAN.md](PLAN.md) for the full roadmap and [the GitHub milestones](https://github.com/mliang1604/pharos/milestones) for what's currently in flight.

## Roadmap at a glance

| Phase | Theme | Outcome |
| --- | --- | --- |
| 0 | Foundations | Project scaffolding, WebGPU context, textured spinning cube with depth |
| 1 | Rendering Core | Meshes, materials, cameras, scene graph, basic lighting |
| 2 | Asset Pipeline | glTF 2.0 scenes with KTX2 textures through a managed loader |
| 3 | Scene & Entity System | ECS with serialization |
| 4 | Lighting & Shadows | PBR, multi-light, shadow mapping, IBL |
| 5 | Animation & Physics | Skeletal animation + Rapier rigid bodies |
| 6 | Post-Processing & Render Graph | Render graph executor, bloom, tone mapping, AA, SSAO |
| 7 | Audio, Input, UI | The non-rendering parts of being a game engine |
| 8 | Editor | Viewport, hierarchy, inspector, gizmos, hot reload |
| 9 | Reference Game | Ship one small, complete game using only Pharos |

Each phase maps to a GitHub Milestone, and each bullet in [PLAN.md](PLAN.md) maps to an Issue.

## Requirements

- **Node.js 20+** and **npm** (the version CI builds against).
- A **WebGPU-capable browser** to view the output.

### Browser support matrix

WebGPU is still rolling out across browsers. Pharos targets browsers where it ships enabled by default:

| Browser | Minimum version | Notes |
| --- | --- | --- |
| Chrome (desktop) | 113+ | Default on Windows, macOS, ChromeOS. |
| Edge | 113+ | Same Chromium engine as Chrome. |
| Chrome (Android) | 121+ | Default. |
| Safari (macOS / iOS) | 26+ | Default. On Safari 18 it works only behind the *Develop → Feature Flags → WebGPU* toggle. |
| Firefox | 141+ | Default on Windows; still rolling out elsewhere — Nightly enables it via `dom.webgpu.enabled`. |

Not sure if your browser qualifies? Check [caniuse.com/webgpu](https://caniuse.com/webgpu), or just open the app — Pharos detects WebGPU at startup and shows a clear fallback message when it (or a suitable GPU adapter) is unavailable.

## Local development

```bash
npm install      # install dependencies
npm run dev      # Vite dev server with HMR, opens http://localhost:5173
```

The dev server auto-opens a browser and hot-reloads on save. You should see a textured cube spinning against a shifting background, with an FPS/frame-time HUD in the top-right corner.

### All scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server with HMR on port 5173. |
| `npm run build` | Type-check (`tsc -b`) then produce a production build in `dist/`. |
| `npm run preview` | Serve the production build locally to sanity-check it. |
| `npm run typecheck` | Type-check only, no emit. |
| `npm run lint` | Run ESLint over the project. |
| `npm run format` | Format with Prettier (writes changes). |
| `npm run format:check` | Check formatting without writing (useful in a pre-commit hook). |

CI (`.github/workflows/ci.yml`) runs typecheck, lint, and build on every push and PR. Pushes to `main` are deployed to GitHub Pages at **[mliang1604.github.io/pharos](https://mliang1604.github.io/pharos/)**.

## Project layout

```
pharos/
├── PLAN.md          # Phased roadmap — source of truth for milestones/issues
├── README.md
├── LICENSE
├── index.html       # Canvas host + status/HUD overlays; Vite entry point
├── vite.config.ts   # Dev server + build config (base path for GitHub Pages)
├── tsconfig.json    # Strict TypeScript config
├── eslint.config.js
├── pharos-notes/    # Obsidian learning vault (per-phase notes)
└── src/
    ├── main.ts      # WebGPU init, scene setup, delta-time render loop
    └── debug/
        └── hud.ts   # FPS / frame-time / draw-call overlay
```

## Contributing

Pharos is a personal learning project, but issues, ideas, and discussion are welcome. Start with the open milestone — the issues there describe the current scope of work.

## License

See [LICENSE](LICENSE).
