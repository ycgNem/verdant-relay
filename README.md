# Verdant Relay

Scavenge by day. Hold the line by night. A 3D pixel-rendered roguelite built with Three.js.

**Play it in your browser: https://ycgnem.github.io/verdant-relay/** (desktop, keyboard + mouse)

## Run it

Double-click `Play.bat`, or:

```bash
npm install
npm run dev
```

Then open http://localhost:5190. `npm run playtest` builds and serves a frozen copy on port 5191 (no hot reload).

Every push to `main` rebuilds and redeploys the live site through GitHub Actions (`.github/workflows/deploy.yml`).

## How to play

- **Day (exploration):** WASD move · mouse aim · LMB fire · RMB Pulse Cutter (melee, cuts brambles) · Space dodge · E interact (hold) · Q med kit · Tab big map · Esc pause.
  Finish the district objective, grab loot, then hold E in the extraction zone. Loot is only kept if you extract.
- **Night (defense):** click a glowing pad to build (or 1–6 then a pad), click a tower to upgrade (U), sell (S) or change targeting (T).
  Read the wave preview, spend Intel (Decrypt / Sabotage), repair (R), then Start Wave (Space). F toggles 1×/2×.
- Survive 6 nights; the Canopy Colossus attacks on night 6. Research Data earned in every run buys permanent unlocks in the Collection.

## Docs

- `DESIGN.md`: what the game is (loop, modes, content, progression, numbers)
- `PLAN.md`: tech choices, folder map, build stages and what's done
- `ARCH.md`: core engine APIs (scenes, visuals, effects, run state, debug URLs)
- `STYLE.md`: art direction and the sprite contract
- `critique/`: playtest/critic reports from development rounds

## Art

All sprites are hand-built pixel art (pixel-art-studio): each has a deterministic build script in `pixel-art/<key>/`
that exports to `public/sprites/`. Fragments `pixel-art/manifest.<group>.json` merge into `public/sprites/manifest.json`
via `python pixel-art/merge_manifest.py`. Anything not registered falls back to a placeholder model from `src/data/visuals.js`.

## Debug URLs

`?debug=explore&district=flooded_transit&night=2`, `?debug=defense&night=6&scrap=600&circuits=12&biofiber=12`,
`?debug=summary`, `?debug=briefing`, `?debug=results&victory=1`. Debug runs never touch your real save (add `&save=1` to test Continue).
