# Verdant Relay

Three.js + Vite, plain JavaScript. Read `DESIGN.md` (the game) and `PLAN.md` (architecture, folder map, stages) before working.

- Run with `npm run dev` (port 5190) or `Play.bat`.
- All tuning lives in `src/data/`. Don't hardcode numbers in gameplay code.
- Run state in `src/core/Run.js` is the single source of truth.
- Art comes from detailed sprites registered in `public/sprites/manifest.json`. Until then, placeholders come from `src/data/visuals.js`.
- Tick the checkboxes in `PLAN.md` as stages land.
