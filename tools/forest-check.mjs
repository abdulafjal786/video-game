// Jumps to Level 3, checks it loads and plays, measures frame rate, and saves views of the forest.
// Run with the dev server up: npm run dev, then node tools/forest-check.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5199'
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
await page.goto(`http://localhost:${port}/`)
await page.waitForFunction(() => window.__g?.runtime.player.view, null, { timeout: 90000 })
await page.click('button.primary')
await page.waitForTimeout(800)

// skip to Level 3
await page.evaluate(() => {
  const g = __g.useGame
  g.setState({ level: 2 })
  g.getState().retry()
  g.setState({ damagePlayer: () => {} })
})
await page.waitForFunction(() => __g.useGame.getState().target === 20 && __g.runtime.hitboxes.size === 20, null, { timeout: 90000 })
await page.waitForTimeout(3000)
const s = await page.evaluate(() => {
  const g = __g.useGame.getState()
  const p = __g.runtime.player
  return { level: g.level + 1, target: g.target, enemies: __g.runtime.hitboxes.size, y: +p.y.toFixed(2), phase: g.phase }
})
console.log('level 3 state', s)

const fps = () => page.evaluate(() => new Promise((r) => {
  let n = 0
  const t = performance.now()
  const f = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(f); else r(+(n / 3).toFixed(1)) }
  requestAnimationFrame(f)
}))
console.log('fps', await fps())

const look = async (name, yaw, pitch, x, z) => {
  await page.evaluate(([a, b, px, pz]) => {
    const p = __g.runtime.player
    if (px != null) p.body.setTranslation({ x: px, y: 1, z: pz }, true)
    p.view.yaw = a
    p.view.pitch = b
  }, [yaw, pitch, x, z])
  await page.waitForTimeout(900)
  await page.screenshot({ path: `tools/shots/forest-${name}.png`, timeout: 60000 })
}
await look('spawn', -Math.PI / 2, -0.02)
await look('up', -Math.PI / 2 + 0.6, 0.55)
await look('mid', Math.PI * 0.75, 0.02, 4, 6)

// walk forward with the real key into whatever is ahead, to confirm the player stays on the ground
await page.evaluate(() => { __g.runtime.player.body.setTranslation({ x: -20, y: 1, z: 0 }, true); __g.runtime.player.view.yaw = -Math.PI / 2 })
await page.keyboard.down('KeyW')
await page.waitForTimeout(1500)
await page.keyboard.up('KeyW')
console.log('after walking', await page.evaluate(() => ({ x: +__g.runtime.player.x.toFixed(1), y: +__g.runtime.player.y.toFixed(2) })))
console.log('errors', errors.slice(0, 6))
await browser.close()
