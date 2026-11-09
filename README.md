# Dead Freight

A third-person shooter that runs in the browser, built with React Three Fiber and Rapier physics.

You start unarmed in a freight shed. Search the crates for a rifle, a safety belt and tools, then kill 10 enemies to clear Level 1 and 15 to win Level 2.

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
| E (hold) | Search crate |
| R | Reload |
| Q | Use tools (+25 health, repairs the belt, 2 charges) |
| Esc | Pause |

## Change the game

Balance lives in [src/game/config.js](src/game/config.js): enemy counts, damage, accuracy, sight range, ammo, crate loot and each level's lighting.

## Test it

With the dev server running, `node tools/smoke.mjs` plays the whole game in Chrome and saves screenshots to `tools/shots`. It turns off player damage while fighting, so it proves the game works, not that the difficulty is right.

## Asset credits

| Asset | Source | License |
| --- | --- | --- |
| Soldiers and motion capture | [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) | MIT |
| Warehouse HDRI and PBR textures | [Poly Haven](https://polyhaven.com) | CC0 |

The rifle, safety belt and all sound effects are generated in code.
"# video-game" 
