// Level 4 check: enemies must come one at a time, each hunter must reach the player and fight,
// and the next one must set out after the previous one dies. Also saves views of the marsh.
// Run with the dev server up: npm run dev, then node tools/marsh-check.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5199'
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.goto(`http://localhost:${port}/`)
await page.waitForFunction(() => window.__g?.runtime.player.view, null, { timeout: 90000 })
await page.click('button.primary')
await page.waitForTimeout(800)
await page.evaluate(() => {
  const g = __g.useGame
  g.setState({ level: 3 })
  g.getState().retry()
  window.__hits = 0
  g.setState({ damagePlayer: () => { window.__hits++ } })
  window.__toasts = []
  g.subscribe((s, prev) => { if (s.toast !== prev.toast && s.toast) window.__toasts.push(s.toast.text) })
})
await page.waitForFunction(() => __g.useGame.getState().target === 12 && __g.runtime.hitboxes.size === 12, null, { timeout: 90000 })
console.log('level', await page.evaluate(() => {
  const g = __g.useGame.getState()
  return { name: 'Level ' + (g.level + 1), target: g.target, water: __g.runtime.waterLevel }
}))

const sample = () => page.evaluate(() => {
  const r = __g.runtime
  const p = r.player
  const list = [...r.hitboxes.values()]
  const active = list.filter((e) => e.state !== 'patrol').length
  const seeing = list.filter((e) => e.sees).length
  const h = r.hunter
  return { active, seeing, hunterDist: h && !h.dead ? +Math.hypot(h.x - p.x, h.z - p.z).toFixed(0) : null }
})

// 1. watch the first hunter come in, standing still and not shooting
const track = []
let maxActive = 0
let maxSeeing = 0
for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(1000)
  const s = await sample()
  maxActive = Math.max(maxActive, s.active)
  maxSeeing = Math.max(maxSeeing, s.seeing)
  track.push(s.hunterDist ?? '-')
}
console.log('first hunter distance each second:', track.join(' '))
console.log('most enemies hunting at once:', maxActive, '| most that could see the player at once:', maxSeeing)
console.log('hits on player while it fought:', await page.evaluate(() => window.__hits))
await page.screenshot({ path: 'tools/shots/marsh-hunter.png', timeout: 60000 })

// 2. kill the hunter and time how long the next one takes to set out
const t0 = Date.now()
await page.evaluate(() => __g.runtime.hunter.damage(1000))
await page.waitForFunction(() => __g.runtime.hunter && !__g.runtime.hunter.dead, null, { timeout: 15000 })
console.log('next hunter set out after', ((Date.now() - t0) / 1000).toFixed(1), 's; kills', await page.evaluate(() => __g.useGame.getState().kills))
console.log('toasts', await page.evaluate(() => window.__toasts))

// 3. a splash: shoot the water just in front of the player
await page.evaluate(() => { const v = __g.runtime.player.view; v.pitch = -0.35 })
await page.waitForTimeout(300)
await page.mouse.down()
await page.waitForTimeout(250)
await page.screenshot({ path: 'tools/shots/marsh-splash.png', timeout: 60000 })
await page.mouse.up()

const fps = await page.evaluate(() => new Promise((r) => {
  let n = 0
  const t = performance.now()
  const f = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(f); else r(+(n / 3).toFixed(1)) }
  requestAnimationFrame(f)
}))
console.log('fps', fps)
await page.evaluate(() => { const v = __g.runtime.player.view; v.pitch = 0; v.yaw = -Math.PI / 2 + 0.4 })
await page.waitForTimeout(800)
await page.screenshot({ path: 'tools/shots/marsh-view.png', timeout: 60000 })
console.log('errors', errors)
await browser.close()
