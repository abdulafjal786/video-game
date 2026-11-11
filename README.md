# Dead Freight

A third-person shooter that runs in the browser, built with React Three Fiber and Rapier physics.

You start with a rifle, a safety belt and tools. Clear four levels: 10 enemies in the freight shed, 15 in the shed at night, 20 in a pine forest, then 12 in a flooded marsh where they come for you one at a time. Click **Demo** on the menu to watch a recorded run.

## Run it

```
npm install
npm run dev
```

Then open http://localhost:5199. Use `npm run build` and `npm run preview` for the faster production version.

| Key | Action |
| --- | --- |
| W A S D | Move |
| Shift | Sprint |
| Mouse | Aim |
| Left click | Fire |
| R | Reload |
| Q | Use tools (+25 health, repairs the belt, 2 uses per level) |
| Esc | Pause |

## Change the game

Balance lives in [src/game/config.js](src/game/config.js): enemy counts, damage, accuracy, sight range, ammo, tool uses and each level's lighting. Set `oneAtATime: true` on any level to make its enemies come for you one by one, with `huntDelay` seconds between them. The forest and marsh layouts are generated from fixed seeds in `forestLayout()`, so they are the same on every run; change a seed to get a different layout.

## Test it

With the dev server running, `node tools/smoke.mjs` plays the whole game in Chrome and saves screenshots to `tools/shots`. It turns off player damage while fighting, so it proves the game works, not that the difficulty is right.

To re-record the menu's demo video, run `node tools/demo.mjs`, then `python tools/trim-demo.py` (needs `pip install imageio-ffmpeg`).

## Asset credits

| Asset | Source | License |
| --- | --- | --- |
| Soldiers and motion capture | [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) | MIT |
| Warehouse HDRI and PBR textures | [Poly Haven](https://polyhaven.com) | CC0 |
| Forest sky, forest floor, fir bark and twig textures, mossy rocks, fallen trunk, ferns | [Poly Haven](https://polyhaven.com) | CC0 |
| Marsh sky (misty_pines), mud texture, reeds (grass_medium_02) | [Poly Haven](https://polyhaven.com) | CC0 |
| Water ripple normal map (waternormals.jpg) | [three.js examples](https://github.com/mrdoob/three.js) | MIT |

The rifle, safety belt, pine trees and all sound effects are generated in code. The trees are built from Poly Haven's fir bark and twig textures.
"# video-game" 
