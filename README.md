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

- **Day (exploration):** WASD move · mouse aim · LMB machete slash (3-hit combo; hold while walking to hack through brush) · hold RMB heavy chop (an RMB press just before a hit lands deflects it) · Space dodge roll · F throw the machete · E interact (hold) · Q med kit · Tab (or M) big map · Esc pause.
  Every key except Esc can be rebound in **Settings → Controls** (also from the pause menu); tips and prompts show the key you picked.
  Do the day's goal, grab loot, then head home (hold E at the Relay or a beacon you switched on). Loot is only kept if you get home.
  Carrying the generator core (a goal from day 2): you're slower and can't roll or swing; E sets it down so you can fight.
  From day 3 each area has an optional boss (☠ on the map); some days bring rain, fog or heat (shown on the briefing).
  The clock under the minimap is the daylight left (the ring around the minimap drains with it); after sunset the jungle hunts you.
- **Dialogs:** every dialog works from the keyboard: Enter / Space / E press the highlighted button, arrows or Tab move it, Esc cancels.
  F2 mutes everything anywhere; Settings has full screen (Game tab).
- **Night (defense):** click a glowing pad to build (or 1–6 then a pad), click a tower to upgrade (U), sell (S) or change targeting (T).
  Read the wave preview, spend Intel (Decrypt / Sabotage), repair (R), then Start Wave (Space; if the readiness line says
  "Too weak", the button turns into Start anyway: click it or press Shift+Space). A night comes in 2–3 pushes; in the
  lull between them you can build and repair again, and N calls the next push early for bonus Scrap. Relay Protocols
  during pushes and lulls: Q Vine Snare, W Arc Discharge, E Flare (press, aim the ring, click; right-click / Esc cancels).
  F cycles 1× / 2× / 3×; Space / Esc / P pause. After a night, pick a salvage reward (1–3 or click).
  Map: mouse wheel or + / − zooms (whole steps), right- or middle-drag or the arrow keys pan, Home re-frames the board.
- **Between trips:** at the briefing pick an area (1–3), R re-rolls the offer (with Second Look); on the summary pick a
  skill (1–6), R re-rolls the cards (with Fresh Ideas), L saves the point for later; at the Workbench 1–9 make a recipe,
  Esc goes back, Enter skips to night prep. In night prep, a selected tower's Mod row fits a mod you made.
- Survive 6 nights; the Canopy Colossus attacks on night 6. Research Data earned in every run buys permanent unlocks in
  the Collection's research tree (arrows move, Enter / click to select, U or a second click unlocks).
- After the first win: **Long Night** (endless, from the title, L) and **Overgrowth** 1–10 (title, Left / Right; each
  level adds a modifier and +10% Research). After the first run: the **Daily Run** (D; today's seed and two modifiers).
- **Relics and secrets:** cut into lost sites for old strongboxes, kneel at landmark shrines (pick 1 of 2: keys 1 / 2),
  and read the glowing data logs. A relic only works once you get it home (it's lost if you go down). Everything you've
  found and read is in the Collection's **Codex**.

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
`?debug=summary`, `?debug=briefing`, `?debug=results&victory=1`; add `&mode=long|daily` or `&og=3` for a Long Night,
Daily or Overgrowth run (`?debug=defense&night=6&mode=long`, win it, and night 7 follows). Night maps: `&map=twin|crossing|ford`,
`&beacons=2` (forward pads), `&variant=0|1|2` (tonight's wave A/B/C), `&relics=whetstone,storm_totem` (relics owned; with `?debug=summary`, `&found=a,b`). Debug runs never touch your
real save (add `&save=1` to test Continue).
