import { create } from 'zustand'
import { LEVELS, PLAYER, RIFLE } from './config'

const levelStart = (level, carry) => ({
  level,
  kills: 0,
  target: LEVELS[level].target,
  health: PLAYER.maxHealth,
  armor: carry.hasBelt ? PLAYER.maxArmor : 0,
  hasGun: carry.hasGun,
  hasBelt: carry.hasBelt,
  hasTools: carry.hasTools,
  toolCharges: carry.toolCharges,
  mag: carry.hasGun ? RIFLE.magSize : 0,
  reserve: carry.hasGun ? RIFLE.startReserve : 0,
  reloading: false,
  prompt: null,
  search: 0,
  toast: null,
  hurt: 0,
  hit: 0,
})

const NO_GEAR = { hasGun: false, hasBelt: false, hasTools: false, toolCharges: 0 }

export const useGame = create((set, get) => ({
  phase: 'menu', // menu | playing | paused | cleared | dead | won
  runId: 0,
  checkpoint: NO_GEAR,
  ...levelStart(0, NO_GEAR),

  start: () => set({ phase: 'playing', runId: get().runId + 1, checkpoint: NO_GEAR, ...levelStart(0, NO_GEAR) }),
  retry: () => set({ phase: 'playing', runId: get().runId + 1, ...levelStart(get().level, get().checkpoint) }),
  nextLevel: () => {
    const { hasGun, hasBelt, hasTools, toolCharges, level, runId } = get()
    const carry = { hasGun, hasBelt, hasTools, toolCharges }
    set({ phase: 'playing', runId: runId + 1, checkpoint: carry, ...levelStart(level + 1, carry) })
  },
  demoOpen: false,
  setDemoOpen: (demoOpen) => set({ demoOpen }),
  setPhase: (phase) => set({ phase }),
  resume: () => set({ phase: 'playing' }),
  setPrompt: (prompt, search = 0) => {
    if (get().prompt !== prompt || get().search !== search) set({ prompt, search })
  },
  showToast: (text) => set({ toast: { text, id: performance.now() } }),

  takeLoot: (item) => {
    const s = get()
    if (item === 'gun') {
      set({ hasGun: true, mag: RIFLE.magSize, reserve: RIFLE.startReserve })
      s.showToast('Rifle found. Left mouse to fire')
    } else if (item === 'belt') {
      set({ hasBelt: true, armor: PLAYER.maxArmor })
      s.showToast('Safety belt on. Armor up')
    } else if (item === 'tools') {
      set({ hasTools: true, toolCharges: s.toolCharges + 2 })
      s.showToast('Tools found. Q to patch up')
    } else if (item === 'ammo') {
      set({ reserve: s.reserve + RIFLE.magSize * 2 })
      s.showToast(`+${RIFLE.magSize * 2} rounds`)
    } else if (item === 'med') {
      set({ health: Math.min(PLAYER.maxHealth, s.health + 40) })
      s.showToast('+40 health')
    } else {
      s.showToast('Nothing in here')
    }
  },

  useTools: () => {
    const s = get()
    if (!s.hasTools || s.toolCharges <= 0) return false
    if (s.health >= PLAYER.maxHealth && (!s.hasBelt || s.armor >= PLAYER.maxArmor)) return false
    set({
      toolCharges: s.toolCharges - 1,
      health: Math.min(PLAYER.maxHealth, s.health + 25),
      armor: s.hasBelt ? PLAYER.maxArmor : 0,
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
  spots: [],
  noise: null, // { x, z, t } last gunshot heard
  nextEnemyShot: 0,
  time: 0,
  fx: null,
}

if (import.meta.env.DEV) window.__g = { useGame, runtime }
