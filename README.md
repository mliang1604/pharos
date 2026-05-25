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

- A WebGPU-capable browser (Chrome / Edge 113+, Firefox Nightly with the flag, Safari 18+ on Tahoma).
- Node.js 20+ and npm.

A graceful fallback message is shown when WebGPU is unavailable.

## Local development

Local dev setup will be documented here once Phase 0 lands — see issue *"Document local dev setup in README"* in the Phase 0 milestone.

```bash
# planned, not yet wired up
npm install
npm run dev      # Vite dev server with HMR
npm run build    # production build
npm run lint     # eslint
npm run typecheck
```

## Project layout

```
pharos/
├── PLAN.md          # Phased roadmap — source of truth for milestones/issues
├── README.md
├── LICENSE
└── src/             # (coming in Phase 0)
```

## Contributing

Pharos is a personal learning project, but issues, ideas, and discussion are welcome. Start with the open milestone — the issues there describe the current scope of work.

## License

See [LICENSE](LICENSE).
