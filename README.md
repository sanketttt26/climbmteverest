# Everest: Summit Expedition

A third-person 3D browser climb of Mount Everest's South Col route, from Base Camp (5,364 m) to the summit (8,849 m).
Three.js (WebGL2), vanilla JavaScript and Vite. There are no model, texture or audio files: the terrain, climber, textures and sound are all generated in code.

## Run

Requires Node.js 20.19+ and a WebGL2 browser.

```sh
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # production build in dist/
```

Useful URL parameters:
- `?q=low|med|high` sets graphics quality (otherwise it comes from Settings).
- `?shot=<name>` renders a deterministic scene for screenshots; add `&hud=0` for a clean frame.

## Controls

| Keyboard / mouse | Gamepad | Action |
| --- | --- | --- |
| WASD + mouse | Left / right stick | Move (camera-relative) and look |
| Shift / Space | RT / A | Sprint / jump |
| E | X | Rest in a tent, resupply at a cache, take gear/oxygen, clip into or out of a fixed rope |
| Q (hold) | LT | Ice-axe self-arrest while sliding |
| O | Y | Oxygen flow on/off |
| 1 / 2 | LB / RB | Eat / drink |
| C | B | Sit and catch your breath |
| L / V | D-pad up / View | Headlamp / first- or third-person |
| H / M / Esc | D-pad down / Menu | Controls / mute / pause |

## The climb

Base Camp → Khumbu Icefall → Camp I → Western Cwm → Camp II → Lhotse Face → Camp III → Yellow Band →
Geneva Spur → Camp IV (South Col) → Balcony → South Summit → Hillary Step → Summit.

- **Gear**: collect crampons, ice axe, harness and down suit at the Base Camp depot. Without crampons and an axe, slopes over 24° send you sliding.
- **Fixed ropes** cover the steep ground (upper Icefall, Lhotse Face, summit ridge). Clipped in, you can climb up to 70°, you can't slide, and wind and avalanches barely move you.
- **Ladders** bridge the crevasses. Step off one and you fall in.
- **Camps** are checkpoints. Resting in a tent (4 h) restores you, acclimatizes you to that altitude and saves. Caches restock food and water, plus oxygen at Camp III and Camp IV.
- **Survival**: blood oxygen (SpO₂) falls with altitude; acclimatization and bottled oxygen push it back up. Warmth depends on temperature, wind chill, effort and your suit. Food and water drain faster when you work hard.
- **Hazards**: collapsing seracs (watch for growing shadows), avalanches, crevasses, falls, slides, storms, cold and the Death Zone above 8,000 m. If you die, your team brings you back to your last camp.
- **Weather** cycles through clear, overcast, high winds, snowfall, whiteout and blizzard, with storms likelier higher up. A full day/night cycle takes 24 real minutes.

The world is a 1:5 miniature (1 unit = 5 m) so the climb takes minutes rather than weeks. The HUD shows real altitudes.

## Code

Modules are factories (`createX(...)` returning an object with `update`) wired together by `src/main.js` through a shared `ctx` (open `window.__ctx` in devtools).

| Path | What it does |
| --- | --- |
| `index.html` | Loading screen (staged progress over in-game stills) and all screens |
| `src/main.js` | Boot stages, render loop, module contracts |
| `src/render/` | `quality.js` presets · `lighting.js` sun/moon, cascaded shadows (the terrain casts) · `sky.js` dome and stars · `pipeline.js` N8AO ambient occlusion, bloom, ACES tone mapping, vignette, SMAA |
| `src/world/` | `terrain.js` route and procedural heightfield · `mountain.js` camps, ladders, crevasses, ropes, seracs, flags · `weather.js` weather states, wind, GPU snow |
| `src/player/` | `input.js` keyboard/mouse/gamepad with edge flags · `traversal.js` climbing state machine and physics · `rig.js` procedural articulated climber and poses · `camera.js` spring-smoothed chase camera · `player.js` wiring |
| `src/game/systems/` | `expedition.js` camps, interactions, rest, rescue, summit · `survival.js` body model · `hazards.js` seracs and avalanches · `audio.js` synthesized sound · `save.js`, `flow.js`, `events.js`, `markers.js` |
| `src/ui/` | `hud.js` compass, relief minimap, vitals, route progress · `menus.js` title, pause and settings · `style.css` |
| `src/shots.js` | Named scenes for `?shot=` |

## Test

With the dev server running, open `http://127.0.0.1:5173/test.html`. It checks that:
- the terrain matches real altitudes, and physics height matches the rendered mesh;
- every stretch of trail can be climbed with the gear or ropes available there, and crevasses can't be walked around;
- the oxygen model behaves at the summit;
- a bot driving the real traversal controller climbs from Base Camp to the summit, crossing every ladder without falling.
