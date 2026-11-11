import { create } from 'zustand'
import { LEVELS, PLAYER, RIFLE } from './config'

// Every level starts fully equipped: rifle loaded, belt on, tools ready.
const levelStart = (level) => ({
  level,
  kills: 0,
  target: LEVELS[level].target,
  health: PLAYER.maxHealth,
  armor: PLAYER.maxArmor,
  toolCharges: PLAYER.toolCharges,
  mag: RIFLE.magSize,
  reserve: RIFLE.startReserve,
  reloading: false,
  toast: null,
  hurt: 0,
  hit: 0,
})

export const useGame = create((set, get) => ({
  phase: 'menu', // menu | playing | paused | cleared | dead | won
  runId: 0,
  ...levelStart(0),

  start: () => set({ phase: 'playing', runId: get().runId + 1, ...levelStart(0) }),
  retry: () => set({ phase: 'playing', runId: get().runId + 1, ...levelStart(get().level) }),
  nextLevel: () => set({ phase: 'playing', runId: get().runId + 1, ...levelStart(get().level + 1) }),
  demoOpen: false,
  setDemoOpen: (demoOpen) => set({ demoOpen }),
  setPhase: (phase) => set({ phase }),
  resume: () => set({ phase: 'playing' }),
  showToast: (text) => set({ toast: { text, id: performance.now() } }),

  useTools: () => {
    const s = get()
    if (s.toolCharges <= 0) return false
    if (s.health >= PLAYER.maxHealth && s.armor >= PLAYER.maxArmor) return false
    set({
      toolCharges: s.toolCharges - 1,
      health: Math.min(PLAYER.maxHealth, s.health + 25),
      armor: PLAYER.maxArmor,
    })
    s.showToast('Patched up')
    return true
  },

  damagePlayer: (amount) => {
    const s = get()
    if (s.phase !== 'playing') return
    const toArmor = s.armor > 0 ? amount * PLAYER.beltAbsorb : 0
    const armor = Math.max(0, s.armor - toArmor)
    const health = Math.max(0, s.health - (amount - toArmor))
    set({ armor, health, hurt: performance.now(), phase: health <= 0 ? 'dead' : s.phase })
    if (health <= 0) document.exitPointerLock?.()
  },

  addKill: () => {
    const s = get()
    const kills = s.kills + 1
    set({ kills, reserve: s.reserve + RIFLE.killRounds })
    if (kills < s.target) return
    setTimeout(() => {
      if (get().phase !== 'playing' || get().kills < get().target) return
      set({ phase: get().level + 1 >= LEVELS.length ? 'won' : 'cleared' })
      document.exitPointerLock?.()
    }, 1400)
  },

  markHit: (head) => set({ hit: head ? -performance.now() : performance.now() }),
}))

// Per-frame values that must not trigger React renders.
export const runtime = {
  player: { x: 0, y: 1, z: 0, moving: 0, body: null, collider: null },
  hitboxes: new Map(), // collider handle -> enemy
  noise: null, // { x, z, t } last gunshot heard
  nextEnemyShot: 0,
  time: 0,
  fx: null,
  waterLevel: null, // set by water levels; impacts below it splash
  hunter: null, // one-at-a-time levels: the enemy currently coming for the player
  nextHunterAt: 0,
}

if (import.meta.env.DEV) window.__g = { useGame, runtime }
