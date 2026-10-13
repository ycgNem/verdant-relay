# Verdant Relay

Scavenge by day. Hold the line by night. A 3D pixel-rendered roguelite built with Three.js.

## Run it

Double-click `Play.bat`, or:

```bash
npm install
npm run dev
```

Then open http://localhost:5190.

## Docs

- `DESIGN.md`: what the game is (loop, modes, content, progression)
- `PLAN.md`: tech choices, folder map, build stages and what's done

## Art

Drop sprites into `public/sprites/` and register them in `public/sprites/manifest.json`. Anything not
registered is drawn as a placeholder model from `src/data/visuals.js`.
