# Verdant Relay

Three.js + Vite, plain JavaScript. Read `DESIGN.md` (the game), `PLAN.md` (tech, folder map, stages), `ARCH.md` (engine APIs)
and `STYLE.md` (art contract) before working.

- Run with `npm run dev` (port 5190) or `Play.bat`. `npm run playtest` serves a frozen build on 5191 (no hot reload) for playtests.
- Live build: https://ycgnem.github.io/verdant-relay/ — every push to `main` redeploys via `.github/workflows/deploy.yml`.
- All tuning lives in `src/data/`. Don't hardcode numbers in gameplay code.
- Run state in `src/core/Run.js` is the single source of truth.
- Art: hand-made pixel sprites (pixel-art-studio). Each has a build script in `pixel-art/<key>/`; exports go to `public/sprites/`,
  registered via `pixel-art/manifest.<group>.json` → `python pixel-art/merge_manifest.py`. Unlisted keys fall back to `src/data/visuals.js`.
- Rendering is pixel-exact (ortho `PixelCamera`, 32 px/tile, whole-number sprite scales); keep it that way.
- Test with debug URLs (`?debug=explore|defense|summary|briefing|results`, see ARCH.md); debug runs never touch the real save.
- Playtest reports live in `critique/`. Tick the checkboxes in `PLAN.md` as stages land.
