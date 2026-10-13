# Critic: Newcomer pass (fresh eyes, "make it simpler to the public's eye")

Played the frozen build (localhost:5191) at 1280×720 from a clean save, as a casual player who clicked a link. I didn't open
any docs or code until after playing. Run: Night 1 (Overgrown Market), Night 2 (Canopy Greenhouse), Night 3 (Collapsed
Residential Block). I died in the jungle on days 1 and 2, came home empty-handed on day 3 and never finished an objective.
The Relay fell on night 3 (26 kills, 2/6 nights). Screenshots: `.playwright-mcp/newcomer/01..65`.

## 1. First 60 seconds

**Title** (`02_fresh_title`): It looks great. "Scavenge by day. Hold the line by night." is a strong one-line pitch, and I
got the idea straight away: a survival game with tower defense at night. "New Run · Six nights. Hold the Relay." I don't know
what a Relay is yet, but I don't need to. The bottom-right box ("Research Data ◆0 / Best run / Runs 0 · wins 0 / Unlocks
0/7") is noise on a first visit: four stats that are all zero.

**Briefing** (`03_after_newrun`): This is where I first felt lost. My first screen after "New Run" has:
- a top bar with **Night 1/6**, six coloured progress boxes (one of them red, but why?), "Relay Core", "Your health", "Med
  kits 0/2" and "Banked resources" with four currencies (60 Scrap, 2 Circuits, 1 Biofiber, 0 Intel);
- two district cards, each with a description, WHERE, BONUS, ENEMIES, OBJECTIVE, a "Boon" line, TONIGHT and a "First visit:
  +10 Research Data" banner;
- a right panel with Loadout, "Skills · 0", "Night 1 wave" icons and Research Data;
- a yellow tutorial box sitting on top of the Market card's TONIGHT row, which hides the very "threat" it's explaining.

That's about 40 pieces of information before I've moved a single step. The tutorial text ("Its bonus boosts what you find,
but it also adds a threat to tonight's wave. Finish the objective for a skill point and a boon for the night") uses four
words I haven't learned yet. I picked card 1 because it was on the left.

**Expedition start** (`06_explore_start`): Good: a banner names the place and the job ("Overgrown Market: Salvage a Power
Cell") and a controls card appears. Bad: the controls card is a single long line ("WASD move · LMB slash (3-hit combo) ·
hold RMB heavy chop · Space roll · E interact · Q med kit · Tab map"). The first prompt on screen is **"E Hold · Return to
the Relay: objective not done 2.0s"**, so the game is offering me a way to quit before I've started. The bottom bar
objective says something else again: "Crack the guarded power-cell cache". So is it "Salvage" or "Crack"? Are those two
different things?

## 2. Timeline of confusions

| # | Screen | What confused me | What would have helped |
|---|---|---|---|
| 1 | Title | Stats box of zeros, "Unlocks 0/7" | Hide it until the first run ends |
| 2 | Briefing | Red last box in the night-progress strip | Label it "Final night" or put a skull icon in it |
| 3 | Briefing | Choosing a district before I know what any of the stats mean | On night 1, show one district (or both with only description + objective) |
| 4 | Briefing | Tutorial box covers the TONIGHT row it's talking about | Place it outside the cards |
| 5 | Briefing | "Bonus: Scrap ×1.3": ×1.3 of what? | "More Scrap here" |
| 6 | Briefing | "Boon: Power cell installed: towers fire 10% faster tonight" vs "TONIGHT: Market swarm" (one good thing and one bad thing, both labelled "tonight") | Use a green "Reward" line and a red "Danger" line |
| 7 | Explore start | "Return to the Relay" prompt shown at spawn | Hide the return prompt until I've left and come back, or until the objective is done |
| 8 | Explore | Objective wording differs between the banner, the bottom bar and the summary | Use the same sentence everywhere |
| 9 | Explore | Two arrows: an orange screen-edge triangle and a cyan "Relay 3 m". The orange one points straight into solid jungle | Draw one arrow toward the objective; mark the walkable trail or cuttable brush |
| 10 | Explore | "ST" bar drained to empty while I was hacking at plants, and then nothing happened when I clicked | Spell out "Stamina" and flash it (with a sound) when empty |
| 11 | Explore | Is the thick foliage a wall, or can I cut it? I slashed a lot of plants and couldn't tell which ones mattered | Mark cuttable brush clearly (outline on hover, or one consistent look) |
| 12 | Explore | Enemies blend into the foliage. I took 60+ damage from things I only half saw (orange dotted silhouettes, a hooded spearman standing in the water) | Brighter enemy outlines and a damage-direction indicator |
| 13 | Explore | HP dropped from 21 to 0 in about a second during a fight with 3+ enemies, my first fight ever | Make day 1 easy: a single weak enemy near the start |
| 14 | "You went down" | Clear and kind. But "cut trails and pylons are safe": what's a pylon? I've never seen one | Leave out terms I haven't met yet |
| 15 | Summary (`18`) | Three columns, several of them empty ("No optional objectives…", "No boons active", "Skills None yet", "No skill points earned") | Collapse to one card: "You got: +20 Scrap. Tonight: +Crawlers." |
| 16 | Summary | "Intel: spend it in night prep to Decrypt (+Research Data) or Sabotage the wave" when I have 0 Intel | Only show it when Intel > 0 |
| 17 | Night prep (`19`) | Lots to take in, see §5 | |
| 18 | Night prep | Scrap Turret cost 45 on night 1 and 50 on night 2 ("1 built: +5 Scrap") | Keep prices flat, or say "price rises with each one you build" |
| 19 | Wave HUD (`24`) | "WAVE 0% · 5 left" while the lanes add up to 12. Left of what? | "12 enemies to go" |
| 20 | Night survived | "+10 Research · resources carry over": I don't know what Research does | "+10 Research (spend it in Collection on new gear)" |
| 21 | Day 2 | A tooltip "A dead relay pylon: activate it to return from here" appeared over a spot I couldn't see anything at. I never found the pylon | Show the pylon icon pulsing and a "Hold E" prompt when it's close |
| 22 | Day 2 | Died again at the same kind of mixed fight, about 30 m out | Make the first two days gentler |
| 23 | Day 3 | Walked ~80 m in circles following the orange arrow, which kept moving between the right edge and the bottom; dense brush everywhere | A visible path to the objective on day 1, or a "trail" highlight on the minimap |
| 24 | Night 3 | Enemy health "+130% (night 3)" turned a 2-tower defense from "fine" into "lost in 30 s". It felt like a cliff, not a curve | Smooth the curve, or warn before the wave: "Your defense looks too weak" |
| 25 | Results | "You can afford Field Kit in Collection." What's Collection? | Make the Collection button the obvious next step and say what Field Kit does in one line |

## 3. Jargon list (term → plainer replacement)

| Term | Problem | Plainer |
|---|---|---|
| **Relay / Relay Core** | Fine once seen, but the title never shows what it is | "your base (the Relay)" the first time |
| **SCR / CIR / BIO / INT** | Four-letter codes on the defense HUD; the briefing spells them out, the night HUD doesn't | Write the full words, or show icons only (the icons are good) |
| **Scrap / Circuits / Biofiber / Intel** | Four currencies on day 1 is a lot. I only ever spent Scrap | Start with Scrap only; bring in the others as towers unlock them |
| **Research Data (◆)** | A fifth currency, permanent, shown everywhere | Call it "Stars" or "XP" and show it only on the title and results screens |
| **Banked resources** | Bank-speak | "Stored at base" |
| **District** | Fine | "Area" |
| **Boon** | Game-y and vague | "Reward" |
| **Threat / TONIGHT** | Fine, but sits next to the boon | "Danger tonight" |
| **Objective** | OK | "Goal" |
| **Skill points / Skills · 0** | Shown before I can earn any | Hide until the first one is earned |
| **Loadout** | Only shows "Machete" | Remove it on runs with one weapon |
| **ST** | Unknown abbreviation | "Stamina" |
| **HP** | OK for gamers | Fine |
| **Med kits 0/2** | OK | Fine |
| **Pylon (inactive / return)** | Shown on the map legend and the death screen before I ever met one | "Beacon", explained when first seen |
| **Extract / Expedition / EXTRACTED** | Military jargon | "Head home" / "Trip" / "Back home safe" |
| **Decrypt (+4 RD)** | "RD" appears nowhere else | "Read Intel: +4 Research" |
| **Sabotage (-10% wave)** | OK idea, unclear cost | "Spend 3 Intel: 10% fewer enemies tonight" |
| **Lead / Nearest / Toughest** | "Lead" is unclear | "First in line" |
| **DMG 10 · 1.4/s · RNG 4.5** | Stat soup | A three-pip bar for Damage / Speed / Range |
| **SINGLE TARGET / RAPID / CHAIN tags** | OK, but tiny | Fine |
| **Hits burrowed: No** | Meaningless before burrowers exist | Hide until a burrower is in the wave |
| **Bramble Crawler / Skitter / Razorback / Spitter / Rival Scavengers / Burrowers** | Six enemy names by night 3 | Fine, but show the sprite larger next to each name |
| **Modifiers** | "Enemy health +40% (night 2)" | "Enemies are tougher tonight" |
| **Market swarm / Pollen-drunk / You were followed** | Flavourful | Fine, keep them |
| **Lane / North ▸ 11** | OK | Fine |
| **Pad 15** | The number is internal | Drop it |

## 4. Visual noise

- **Foliage overlay**: big dark leaf silhouettes in the screen corners plus dithered shadow blotches. They look nice, but
  with them the jungle reads as one dark green-brown mass. I could rarely tell path from brush from wall
  (`32`, `46`, `52`).
- **Dithered checkerboard patches** (vision fog / shadow?) everywhere at the edges. They look like rendering artefacts.
- **Player outline**: the cyan outline is good, but it's the brightest thing on screen, and enemies are *dimmer* than the
  player. That's backwards for threat reading.
- **Enemy telegraphs**: dotted orange/red silhouettes (`14`, `34`) were hard to tell apart from hit flashes or ghosts. I
  didn't know they meant "about to attack here".
- **Red rings under enemies, red rings for spore pods, red damage numbers, red HP bar.** In combat almost everything is red.
- **Night**: the wave fight at the Relay (`63`) is a blob of sprites, red "−5" numbers and a red screen tint. I couldn't tell
  what was hurting the Relay.
- **Colour meanings shift**: cyan means the Relay, the player outline, the Circuits text and the range ring. Orange means
  the objective arrow, the Intel text, the hint boxes and the wave bar. Green means Biofiber, your health and "good".
- **Lane arrows** on the night map are nice, but they're the same orange as the hint box and the build-pad highlight.

## 5. The night / tower-defense prep screen, through newcomer eyes

First look (`19`): the map itself is clear. Two dirt lanes snake toward the Relay, "North ▸ 8" and "South ▸ 9" tags, dark
square pads beside the lanes. I understood "put towers on squares".

The right panel is the problem. Before I clicked anything, it showed: Wave preview, Night 1 · 17 enemies, a red **THREAT
TONIGHT** box, North lane (2 enemy types), South lane (2 types), two enemy descriptions, a "Tip" hidden under the scroll
fold, **Decrypt** (1 INT, +4 RD), **Sabotage** (3 INT, −10% wave), **Repair (Relay full)** and **Start Wave**. That's three
buttons I can't use (0 Intel, full health) taking about a third of the panel.

When I clicked a pad (`20`), the Build list had three towers with costs in two currencies, tag chips, a description line,
`DMG · rate · RNG` and (later) "Need 22 more Scrap, 1 more Biofiber" in red. The fourth tower was below the fold. I pressed
1 to build, which was fine. The selected-tower panel (`22`) shows Damage / Attacks / Range / Hits burrowed, three targeting
modes with an explanation, Upgrade with "+45% fire rate, +10% damage", Sell "70% of 45" and Repair. It's a full spreadsheet
for my first tower.

What I wanted on night 1:
- "Click a glowing square to build a tower" (the hint said roughly this, but in 4 lines in the bottom-left corner, away
  from the pads).
- A tower list with a picture, a name, one plain line and a price. Nothing else.
- A big Start Wave button. (It's good, and "Space" is shown.)
- No Decrypt / Sabotage / Repair until I can use them.

During the wave, the panel repeats the threat and says "Building, upgrades and repairs are locked during the wave. Targeting
can still be changed." That's a lot to read while things are happening. Night 3 showed 41 enemies and +130% enemy health.
I had 2 towers, 32 Scrap and no hint that this was hopeless. One sentence before Start Wave, along the lines of "41 enemies,
your defense: weak", would have made me spend my Scrap or rethink.

## 6. Top 15 simplifications (most impactful first)

1. **Make night 1 a guided tutorial day with one district.** No choice, one short trail with a visible path, one weak
   enemy, one crate, one objective about 30 m away. Bring in the district choice from night 2.
2. **Cut the briefing card to three lines:** name + picture, "Find: ___" (the goal), "Danger tonight: ___". Move WHERE /
   BONUS / ENEMIES / Boon details to a hover tooltip.
3. **Hide the Decrypt / Sabotage / Repair buttons until they can be used** (Intel > 0, Relay damaged). Hide "Skills" until
   the first point is earned and "Loadout" until a second weapon exists.
4. **Introduce one currency at a time.** Scrap only until night 2. Circuits appear when a tower needs them, Biofiber the
   same, Intel when the first terminal is found. Show Research Data only on the title and results screens.
5. **Replace HUD abbreviations with icons + numbers or full words:** no SCR/CIR/BIO/INT/ST/RD.
6. **One arrow, one objective sentence.** The same wording in the banner, the bottom bar and the summary ("Salvage a Power
   Cell" everywhere). Drop the second "Relay N m" arrow until the objective is done or HP is low.
7. **Don't show the "Return to the Relay" prompt at spawn.** Show it only once you're carrying loot, the objective is done,
   or HP < 30%.
8. **Make the walkable path readable:** lighten trail tiles, give cuttable brush a consistent look (with a hover outline),
   and cut the corner-leaf overlay's opacity by half during day 1–2.
9. **Enemies must out-contrast the player:** a red/white outline on hostiles, a slightly dimmer player outline, and a simple
   "!" above an enemy about to attack in place of the dotted-silhouette telegraph.
10. **Gentler day 1–2 combat:** fewer mixed packs within 50 m of the Relay. My first two days ended in death within about
    30 seconds of my first fight.
11. **Tower cards: one line + price.** Turn DMG/rate/RNG into three small bars. Hide "Hits burrowed" and the targeting modes
    until the second night; default to "First in line".
12. **Merge the summary into one card:** "You got X. Lost Y. Tonight: Z." Remove empty sections ("No optional objectives",
    "No boons active", "No skill points earned").
13. **Pre-wave readiness check:** before Start Wave, one line ("41 enemies tonight: your 2 towers probably won't hold") or
    a strength meter. The night 3 health jump (+130%) needs a warning or a softer curve.
14. **Rename jargon:** Boon → Reward, Threat → Danger tonight, Expedition/Extract → Trip/Head home, Banked → Stored, Lead →
    First in line, Pylon → Beacon (explained when first seen), Decrypt/Sabotage → plain sentences.
15. **Hints at the point of action, one at a time:** put the "click a glowing pad" hint next to the pads with an arrow, not
    as a paragraph in the corner. Never let a hint box cover the thing it explains (it covers the Market TONIGHT row on the
    first briefing). Split the controls card into "Move WASD" now, "Slash: click" at the first enemy, "Roll: Space" when hit.

### After-play check against DESIGN.md
- The return prompt being available any time, the death salvage and the escalating tower price all appear to be intended
  (DESIGN.md: return "allowed any time"; death keeps pylons and towers). They're still confusing to a newcomer when shown
  before they matter.
- Pylons are meant to be one per district and marked on the map. I saw the legend entry and one floating label but never the
  object, so the marking isn't reaching a newcomer.
- The night 1–2 wave sizes are deliberately softened (district threats are half size on night 1). The night 3 jump in my run
  (+130% enemy health, 41 enemies against 2 towers) is consistent with the doc's "two towers end at ~15 Relay HP" on
  night 2, so the design assumes 3–5 towers by night 3. Nothing on screen tells a newcomer that.
- Side note: a console error (`PostFx.js:44 Cannot read properties of undefined (reading 'x')`) came from a *different* dev
  server tab (port 5262) in the shared browser, not from this build.

---

**Summary**
1. It looks lovely and the "scavenge by day, defend by night" idea is clear in five seconds, but every screen after the title
   shows 3–4× more numbers, currencies and terms than a newcomer can use.
2. The jungle day is the real wall: unclear walkable paths, low-contrast enemies and a hard first fight meant I died twice
   and never finished an objective in three days.
3. Highest-value fixes: a guided one-district day 1, hiding unusable buttons and currencies until they matter, one consistent
   objective line and arrow, and plain words in place of SCR/CIR/BIO/INT, Boon, Pylon, Decrypt and Sabotage.
