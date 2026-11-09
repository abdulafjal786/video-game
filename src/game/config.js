export const HALL = { w: 64, d: 44, h: 10 }
export const PLAYER_SPAWN = [-28, 0]

export const PLAYER = {
  walk: 3.1,
  sprint: 5.6,
  maxHealth: 100,
  maxArmor: 100,
  beltAbsorb: 0.6, // share of incoming damage the belt takes while it holds
  searchTime: 1.1,
  searchRange: 2.3,
}

export const RIFLE = {
  magSize: 30,
  startReserve: 90,
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
  sightRange: 19,
  fov: 0.35, // dot product threshold: roughly 140 degrees total
  hearRange: 34,
  engageRange: 20,
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

const baseSpots = [
  [-22, 7], [-27, -16], [-13, -5], [-3, 10], [2, -8], [11, 10], [15, -16], [24, 6], [28, -18],
]

const mirror = (o) => ({ ...o, x: -o.x })

export const LEVELS = [
  {
    name: 'The Yard Shed',
    target: 10,
    layout: baseLayout,
    spots: baseSpots,
    // The three crates nearest the spawn share the rifle, so the opening stays fair.
    guaranteed: ['gun'],
    required: ['belt', 'tools'],
    loot: ['ammo', 'ammo', 'med', 'empty', 'empty', 'empty'],
    accuracy: 0.4,
    enemyDamage: 6,
    mood: { sun: 3.4, ambient: 0.32, lamp: 9, fog: '#23262a', alarm: false },
  },
  {
    name: 'Night Shift',
    target: 15,
    layout: [...baseLayout.map(mirror), cover(-4, -2, 3, 0.8), cover(8, -2, 0.8, 3), cover(16, 9, 1.6, 1.6)],
    spots: baseSpots.map(([x, z]) => [-x, z]).concat([[-27, 16]]),
    guaranteed: [],
    required: [],
    loot: ['ammo', 'ammo', 'ammo', 'med', 'med', 'tools', 'empty', 'empty', 'empty', 'empty'],
    accuracy: 0.48,
    enemyDamage: 7,
    mood: { sun: 0.5, ambient: 0.12, lamp: 22, fog: '#120e0d', alarm: true },
  },
]
