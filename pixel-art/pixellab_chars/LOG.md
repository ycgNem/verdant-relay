# PixelLab character jobs (budget 120 generations)

| # | job / id | tool | what | cost | running total |
|---|---|---|---|---|---|
| 1 | char 899e0614-98d2-4310-be5e-ea8ba760d88b | create_character v3 64 | player base | 2 | 2 |
| 2 | char b92ad48f-9b1a-4d56-8a5e-beb78610da24 | create_character v3 64 | feral base | 2 | 4 |
| 3 | char 9823d64a-f431-4a90-be24-d3fbfd3714e4 | create_character standard quadruped dog 48 (68 canvas) | crawler base | 1 | 5 |
| 4 | char fa5fc1c5-9f32-40ef-9988-88ea1493e477 | create_character standard quadruped bear 56 (80 canvas) | razorback base | 1 | 6 |
| 5 | img de9d2be4-6e74-4cec-9b32-548e5553d7e4 | create_image_pixen 64 | crawler south reference | 1 | 7 |
| 6 | img 3f02bc26-4248-461c-b676-07612708915a | create_image_pixen 80 | razorback south reference | 1 | 8 |
| 7 | img 10721143-6a52-497d-92a5-082ac3f226ff | create_image_pixen 40 | skitter base (faces right) | 1 | 9 |
| 8 | img 3cbd8393-8fd9-4f60-b1aa-1b8733c32587 | create_image_pixen 48 | spitter base (faces right) | 1 | 10 |
| 9 | anim grp a078a29a (player idle) s,se | animate_character template breathing-idle | player idle s,se | 2 | 12 |
| 10 | anim grp a078a29a (player idle) e,ne,n | animate_character template breathing-idle | player idle e,ne,n | 3 | 15 |
| 11 | img a8d809e6-db8d-425a-8f12-054502688828 | create_image_pixflux img2img 80 | razorback south ref (from std rotation) | 1 | 16 |
| 12 | img 1c02de7d-a180-4e68-a86d-63541ec6142a | animate_image 64x64x4 | spitter idle | 1 | 17 |
| 13 | img 65361426-e3de-482b-b59a-b53dc7517097 | animate_image 64x64x8 | spitter windup+attack | 1 | 18 |
| 14 | char 9a1b211f-218a-4ddc-aba4-59fcf95eb923 | create_character v3 quadruped bear + reference 80 | razorback v3 | 1 | 19 |
| 15 | img 2fc03aac-3442-46ca-8a54-862933ca08ba | create_image_pixflux img2img 68 | crawler south ref (from std rotation) | 1 | 20 |
| 16 | char 328d1f18-f615-44e1-af09-8081b94aa4ba | create_character v3 quadruped dog + reference 68 | crawler v3 | 1 | 21 |
| 17 | anim grp e4dcb0a9 (player walk) s,se,e | animate_character template walking-6-frames | player walk s,se,e | 3 | 24 |
| 18 | img 28720e64-a4a1-480c-9128-070e78a5d32c | animate_image 48x48x8 | skitter walk | 1 | 25 |
| 19 | anim grp e4dcb0a9 (player walk) ne,n | animate_character template walking-6-frames | player walk ne,n | 2 | 27 |
| 20 | img 3a687f5e-50e2-42a5-b6b5-9a6a057fe11d | animate_image 48x48x4 | skitter idle | 1 | 28 |
| 21 | img bb0cf323-3f18-4710-9d8e-3512396c4072 | animate_image 48x48x6 | skitter attack | 1 | 29 |
| 22 | anim grp 28e49ce0 (player slash) 5 dirs | animate_character v3 custom 6f | player slash | 5 | 34 |
| 23 | anim grp 61c94c64 (crawler v3 walk) e | animate_character template walk-6-frames | crawler v3 walk test, east | 1 | 35 |
| 24 | anim grp 48183e83 (feral idle) s,se,e,ne | animate_character template breathing-idle | feral idle | 4 | 39 |
| 25 | img 3b59c38e-c941-48c1-b7e9-a8f1ca0fb225 | animate_image 48x48x6 | skitter attack re-roll | 1 | 40 |
| 26 | anim grp e0d2d91e (crawler std idle) 5 dirs | animate_character template idle | crawler idle (standard char 9823d64a; v3 crawler rejected: blobby legs) | 5 | 45 |
| 27 | anim grp 48183e83 (feral idle) n | animate_character template breathing-idle | feral idle n | 1 | 46 |
| 28 | anim grp e6a52bfa (player chop) s,se | animate_character v3 custom 6f | player chop s,se | 2 | 48 |
| 29 | anim grp c0dd0b93 (player walk2 v3) e | animate_character v3 custom 6f | player walk re-roll test east (template walk drops the machete) | 1 | 49 |
| 30 | anim grp f28fb8fc (razorback walk) 5 dirs | animate_character template walk-6-frames | razorback walk | 5 | 54 |
| 31 | anim grp e6a52bfa (player chop) e,ne,n | animate_character v3 custom 6f | player chop e,ne,n | 3 | 57 |
| 32 | anim grp c0dd0b93 (player walk2 v3) s,se,ne,n | animate_character v3 custom 6f | player walk (v3, keeps machete) remaining dirs | 4 | 61 |
| 33 | anim grp 3df66d85 (crawler walk) 5 dirs | animate_character template walk-6-frames | crawler walk | 5 | 66 |
| 34 | anim grp 97d64981 (feral attack) s,se | animate_character v3 custom 6f | feral spear thrust s,se | 2 | 68 |
| 35 | anim grp d1e5bfb8 (crawler attack) s,se,e | animate_character v3 custom 6f | crawler lunge bite s,se,e | 3 | 71 |
| 36 | anim grp 27587d8e (razorback attack=charge) s,se,e,ne | animate_character template running-6-frames | razorback charge | 4 | 75 |
| 37 | anim grp 895ebe99 (player roll) s,se,e | animate_character v3 custom 6f | player roll s,se,e | 3 | 78 |
| 38 | anim grp d1e5bfb8 (crawler attack) ne,n | animate_character v3 custom 6f | crawler lunge bite ne,n | 2 | 80 |
| 39 | anim grp 895ebe99 (player roll) ne,n | animate_character v3 custom 6f | player roll ne,n | 2 | 82 |
| 40 | anim grp 2618d9db (feral attack2) e,ne,n | animate_character v3 custom 6f | feral spear stab (reworded; first s/se thrust swung sideways) | 3 | 85 |
| 41 | anim grp 27587d8e (razorback charge) n | animate_character template running-6-frames | razorback charge n | 1 | 86 |
| 42 | anim grp ed46bef2 (feral walk v3) s,se,e | animate_character v3 custom 6f | feral walk s,se,e | 3 | 89 |
| 43 | anim grp 2ce535fc (crawler attack_n) n | animate_character v3 custom 6f | crawler attack north re-roll (first one turned to face camera) | 1 | 90 |
| 44 | anim grp 6693d575 (razorback windup=angry) s,se,e | animate_character template angry | razorback windup s,se,e | 3 | 93 |
| 45 | anim grp ed46bef2 (feral walk v3) ne,n | animate_character v3 custom 6f | feral walk ne,n | 2 | 95 |
| 46 | anim grp 2618d9db (feral attack2) s,se | animate_character v3 custom 6f | feral spear stab s,se (re-roll of first attack) | 2 | 97 |
| 47 | anim grp 6693d575 (razorback angry) ne,n | animate_character template angry | razorback angry ne,n (subtle; used as idle) | 2 | 99 |
| 48 | anim grp 308d48d6 (razorback paw) e | animate_character v3 custom 6f | razorback windup test (paw ground) east | 1 | 100 |
| 49 | anim grp 1d30df78 (player hurt) 5 dirs | animate_character template taking-punch | player hurt | 5 | 105 |
| 50 | anim grp 308d48d6 (razorback paw) s,se,ne,n | animate_character v3 custom 6f | razorback windup (paw ground) remaining dirs | 4 | 109 |
| 51 | anim grp 386b1cec (player roll2) e | animate_character v3 custom 6f | player somersault roll test, east (task: real dodge roll) | 1 | 110 |
| 52 | char e03fb9dd-37e0-412e-a875-a1b526838a5f | create_character standard quadruped dog 48 (68 canvas) | bramble crawler redesign base (thorn/bark beast) | 1 | 111 |
| 53 | anim grp 509473f1 (player crouch) s,se,ne,n | animate_character template crouching | tuck poses for the hand-rotated roll (roll2 east test stayed upright: crouch only, no tumble) | 4 | 115 |
| 54 | anim grp 6a34958b (crawler2 walk) 5 dirs | animate_character template walk-6-frames | bramble crawler v2 walk | 5 | 120 |
| 55 | anim grp a2315df3 (crawler2 attack) e | animate_character v3 custom 6f | bramble crawler v2 lunge bite, east test | 1 | 121 |
| 56 | anim grp a2315df3 (crawler2 attack) s,se,ne,n | animate_character v3 custom 6f | bramble crawler v2 lunge bite remaining dirs | 4 | 125 |

**Total: 125 generations** (this task's budget: 25 starting at 109). (Failed/rejected calls not charged: v3 quadruped without reference, one truncated base64 call.)

### Critic G art pass (2026-10-13): roll + Bramble Crawler redesign, 16 generations (109 -> 125)
- **Player roll** (`make_roll.py` -> `raw/player/zip/Idle/animations/roll3`): the v3 "somersault" test (#51) came back as an
  upright crouch again, so the tumble is hand-built: crouch poses from the `crouching` template (#53, s/se/ne/n) and the
  roll2 east test, turned in exact 90 degree steps (transposes, no resampling) and set on the feet line.
  Side rows spin clockwise; s/n rows flip about the screen x axis (mid-tumble shows the opposite facing upside down).
  7 frames: tuck, 3 tumble, land, rise x2. Downloads of the new player groups live in `raw/player_new/` (the old
  `raw/player/zip` was kept so `hurt_mix` survives).
- **Bramble Crawler v2** (char e03fb9dd, `raw/crawler2`): standard quadruped dog with a thorn/bark description (#52),
  template walk (#54), v3 lunge bite (#55-56). `make_crawler2.py` hand-finishes every frame: red thorn tips (tip, mid red,
  dark red walking back along each exposed spine), the mane's mid-browns shifted to a red-purple bramble-cane ramp
  (head around the eyes kept bark), walk rows ground-aligned to the rotation (template lifted the body 0-3 texels),
  idle = rotation pose + 1-texel breathing bob, windup = attack frames 0-2, attack = 3-6 (hit 1).
  The old dog crawler (char 9823d64a) is no longer used by the sheet.
