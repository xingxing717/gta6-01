# Neon Harbor — Aurelia Bay

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/xingxing717/gta6-01/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/xingxing717/gta6-01/reward.svg)](https://make.fun/c/gta6-01)

An original open-world crime game built for the make.fun **Make GTA 6** competition
(`gta6-01`). No names, places, characters, art or music from any commercial game —
Aurelia Bay, Reyes and Marisol are entirely fictional.

## The game

Sun, salt air and bad decisions. You are **Reyes**, a wheelman fresh out of the harbor
lockup. **Marisol**, the fixer who runs the bay, has four jobs for you: a harbor pickup,
a hot car, a police chase, and one last score on the beach. Steal what you need, lose
the heat when it finds you, and get paid.

- **A procedural city** — 6×6 blocks of towers with lit windows, a central plaza with
  Marisol's neon office, a boardwalk, palms, a beach and a living sea, all generated
  in code. No image files: every texture is painted on canvas at runtime.
- **On foot and by car** — walk the sidewalks (WASD, Shift to sprint), steal any
  parked or traffic car with E, drive with arcade handling and a handbrake (Space).
- **Traffic and pedestrians** — cars cruise the street grid and brake for each other;
  pedestrians stroll the sidewalks and scatter when shots ring out.
- **Wanted level** — 0 to 5 stars. Police cruisers pursue, ram and set roadblocks;
  lay low out of sight and the heat decays.
- **Combat** — a revolver with hitscan shooting, reload (R), ammo counter and health.
- **Story missions** — four jobs from Marisol with dialogue, a mission banner, a
  pulsing 3D beacon and a live minimap marker. Each pays cash.
- **HUD** — health bar and cash, wanted stars, weapon and ammo, a 2D canvas minimap
  with a player arrow and north indicator, and a speedometer when driving.
- **Menus and save** — start screen, pause (Esc/P), a "busted" screen, mute (M), and
  automatic localStorage saves with Continue.
- **Sound** — fully procedural WebAudio: engine hum that follows your speed, gunshots,
  police sirens, pickup chimes and a quiet bass groove. No audio files.

## How to play

Serve `game/` with any static file server and open `game/index.html` in desktop Chrome:

```sh
node serve.ts
# then open http://localhost:8080
```

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse drag | Orbit camera (scroll zooms) |
| Shift | Sprint on foot |
| E | Enter / exit car, interact with mission objectives |
| Click | Shoot the revolver |
| R | Reload |
| Space | Handbrake |
| Esc / P | Pause |
| M | Mute |

Screenshot poses are available with `?shot=start|play|chase|mission`.

## How it is built

- `game/index.html` — page shell, HUD DOM and styling.
- `game/js/main.js` — bootstrap, game loop, camera, wanted level, car enter/exit, menus, save flow.
- `game/js/world.js` — procedural city, beach, sea, palms, lamps and props; collision data.
- `game/js/vehicles.js` — car meshes, arcade driving, traffic AI, police pursuit and roadblocks.
- `game/js/people.js` — Reyes, pedestrians, on-foot movement and revolver shooting.
- `game/js/missions.js` — the four-job story chain and its step machine.
- `game/js/hud.js` — HUD widgets and the 2D minimap.
- `game/js/audio.js` — procedural WebAudio sound effects and music.
- `game/js/state.js` — shared game state, save/load and the seeded city RNG.
- `game/vendor/three.min.js` — vendored three.js r160 (minified build).
- `main.ts` — the make.fun entry program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json`.

## License

MIT — see `LICENSE`.
