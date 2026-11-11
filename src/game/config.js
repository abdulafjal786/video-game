export const HALL = { w: 64, d: 44, h: 10 }
export const PLAYER_SPAWN = [-28, 0]

export const PLAYER = {
  walk: 3.1,
  sprint: 5.6,
  maxHealth: 100,
  maxArmor: 100,
  beltAbsorb: 0.6, // share of incoming damage the belt takes while it holds
  toolCharges: 2, // each use: +25 health and a fully repaired belt
}

export const RIFLE = {
  magSize: 30,
  startReserve: 150,
  rpm: 600,
  damage: 34,
  headMultiplier: 3,
  range: 90,
  reloadTime: 1.9,
  killRounds: 12, // taken from each body
  scavengeDelay: 5, // seconds dry before a few rounds turn up, so a run can't softlock
  scavengeRounds: 15,
}

export const ENEMY = {
  health: 100,
  patrolSpeed: 1.6,
  chaseSpeed: 4.0,
  sightRange: 19, // spotting someone they didn't know about
  combatRange: 40, // seeing and shooting once they know where you are
  fov: 0.35, // dot product threshold: roughly 140 degrees total
  hearRange: 34,
  engageRange: 30, // closer than this they stop advancing and fight from where they are
}

const container = (x, z, w, d, h = 2.6, tone = 0) => ({ kind: 'container', x, z, w, d, h, tone })
const cover = (x, z, w, d, h = 1.25) => ({ kind: 'cover', x, z, w, d, h })
const pillar = (x, z) => ({ kind: 'pillar', x, z, w: 0.8, d: 0.8, h: HALL.h })

const baseLayout = [
  container(-18, -12, 6, 2.5, 5.2, 0),
  container(-18, 12, 6, 2.5, 2.6, 1),
  container(-6, -4, 2.5, 6, 2.6, 2),
  container(-6, 14, 2.5, 6, 2.6, 3),
  container(6, -14, 6, 2.5, 2.6, 1),
  container(6, 4, 6, 2.5, 2.6, 0),
  container(18, -4, 2.5, 6, 2.6, 3),
  container(20, 13, 6, 2.5, 2.6, 2),
  cover(-24, -6, 1.6, 1.6),
  cover(-12, 3, 3, 0.8),
  cover(0, -12, 0.8, 3),
  cover(0, 8, 3, 0.8),
  cover(12, -7, 1.6, 1.6),
  cover(12, 14, 3, 0.8),
  cover(25, -12, 1.6, 1.6),
  cover(26, 2, 0.8, 3),
  pillar(-12, -19), pillar(-12, 19), pillar(12, -19), pillar(12, 19),
]

const mirror = (o) => ({ ...o, x: -o.x })

// ---- Level 3: the forest -------------------------------------------------

// Small seeded random generator, so the forest is the same on every run.
export function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Footprints of the six pieces in the rock_moss_set_01 model, in metres at scale 1:
// [width (x), depth (z), height above ground]
export const ROCK_PIECES = [
  [2.23, 3.37, 0.82], [2.65, 3.26, 0.8], [2.11, 2.08, 0.69],
  [2.13, 1.97, 1.11], [1.82, 3.0, 0.63], [2.13, 2.76, 0.73],
]
// The fallen trunk model is 3 m long and thin; it is stretched into a 6 m, 1 m high log.
export const LOG_SCALE = [2, 3.5, 3.5]

// Scatters rocks, logs and trees across the play area from a fixed seed.
// `bare` gives dead, branchless trees (used in the marsh).
function forestLayout(seed, { rocks = 12, logs = 7, trees = 34, bare = false } = {}) {
  const rng = seeded(seed)
  const placed = []
  const clear = (o, gap) =>
    Math.abs(o.x) + o.w / 2 < HALL.w / 2 - 1.5 &&
    Math.abs(o.z) + o.d / 2 < HALL.d / 2 - 1.5 &&
    Math.hypot(o.x - PLAYER_SPAWN[0], o.z - PLAYER_SPAWN[1]) > 5 &&
    placed.every((p) =>
      Math.abs(p.x - o.x) > (p.w + o.w) / 2 + gap || Math.abs(p.z - o.z) > (p.d + o.d) / 2 + gap)
  const tryPlace = (make, count, gap) => {
    for (let n = 0, tries = 0; n < count && tries < 600; tries++) {
      const o = make()
      if (clear(o, gap)) { placed.push(o); n++ }
    }
  }
  const spot = () => [(rng() - 0.5) * (HALL.w - 6), (rng() - 0.5) * (HALL.d - 6)]

  tryPlace(() => {
    const [x, z] = spot()
    const piece = Math.floor(rng() * ROCK_PIECES.length)
    const s = 1.35 + rng() * 0.45
    const turn = rng() < 0.5 // a quarter turn swaps width and depth
    const [pw, pd, ph] = ROCK_PIECES[piece]
    const w = (turn ? pd : pw) * s * 0.85
    const d = (turn ? pw : pd) * s * 0.85
    return { kind: 'rock', x, z, w, d, h: ph * s, piece, s, turn }
  }, rocks, 2.5)
  tryPlace(() => {
    const [x, z] = spot()
    const turn = rng() < 0.5
    return { kind: 'log', x, z, w: turn ? 1 : 6, d: turn ? 6 : 1, h: 1, turn }
  }, logs, 2.5)
  tryPlace(() => {
    const [x, z] = spot()
    const h = bare ? 6 + rng() * 6 : 14 + rng() * 7
    return { kind: 'tree', x, z, w: 0.9, d: 0.9, h, r: 0.3 + rng() * 0.14, bare, seed: Math.floor(rng() * 1e9) }
  }, trees, 2.2)
  return placed
}

export const LEVELS = [
  {
    name: 'The Yard Shed',
    target: 10,
    layout: baseLayout,
    accuracy: 0.4,
    enemyDamage: 6,
    mood: { sun: 3.4, ambient: 0.32, lamp: 9, fog: '#23262a', alarm: false },
  },
  {
    name: 'Night Shift',
    target: 15,
    layout: [...baseLayout.map(mirror), cover(-4, -2, 3, 0.8), cover(8, -2, 0.8, 3), cover(16, 9, 1.6, 1.6)],
    accuracy: 0.48,
    enemyDamage: 7,
    mood: { sun: 0.5, ambient: 0.12, lamp: 22, fog: '#120e0d', alarm: true },
  },
  {
    name: 'Pine Ridge',
    target: 20,
    env: 'forest',
    intro: 'Level 3 is out in the forest, with 20 of them among the pines.',
    layout: forestLayout(31),
    accuracy: 0.5,
    enemyDamage: 7,
  },
  {
    name: 'Black Water',
    target: 12,
    env: 'marsh',
    intro: 'Level 4 is a flooded marsh. They come for you one at a time, 12 in all.',
    layout: forestLayout(77, { rocks: 10, logs: 8, trees: 18, bare: true }),
    oneAtATime: true, // a single enemy hunts you; the next sets out when it falls
    huntDelay: 2.5, // seconds between one hunter dying and the next setting out
    engageRange: 14, // the hunter closes in this far before it stops to fight
    accuracy: 0.52,
    enemyDamage: 8,
  },
]

LEVELS[1].intro = 'Level 2 has 15 of them, and the lights are off.'
