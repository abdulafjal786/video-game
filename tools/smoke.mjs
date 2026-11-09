// Plays the game in real Chrome: start, search crates, fight, die, retry, finish both levels.
// Run with the dev server up: npm run dev, then node tools/smoke.mjs
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text().slice(0, 200))
})

const state = () => page.evaluate(() => {
  const s = __g.useGame.getState()
  const p = __g.runtime.player
  return {
    phase: s.phase, level: s.level, kills: s.kills, target: s.target,
    hp: Math.round(s.health), armor: Math.round(s.armor), gun: s.hasGun, belt: s.hasBelt,
    tools: s.toolCharges, mag: s.mag, res: s.reserve, y: +p.y.toFixed(2),
  }
})
const shot = (n) => page.screenshot({ path: `tools/shots/${n}.png`, timeout: 60000 })
const god = (on) => page.evaluate((v) => {
  const g = __g.useGame
  window.__orig ??= g.getState().damagePlayer
  g.setState({ damagePlayer: v ? () => {} : window.__orig })
}, on)
const teleport = (x, z) => page.evaluate(([a, b]) => __g.runtime.player.body.setTranslation({ x: a, y: 1, z: b }, true), [x, z])

await page.goto('http://localhost:5199/')
await page.waitForFunction(() => window.__g?.runtime.player.view, null, { timeout: 90000 })
await page.waitForTimeout(2000)
await shot('01-menu')
await page.click('button.primary')
await page.waitForTimeout(1200)

// real movement input
const x0 = await page.evaluate(() => __g.runtime.player.x)
await page.keyboard.down('KeyW')
await page.waitForTimeout(900)
await page.keyboard.up('KeyW')
console.log('moved', +((await page.evaluate(() => __g.runtime.player.x)) - x0).toFixed(2), await state())
await shot('02-start')

// search every crate with the real E key
const spots = await page.evaluate(() => __g.runtime.spots.map((s) => ({ id: s.id, x: s.x, z: s.z, c: s.contents })))
console.log('loot', spots.map((s) => s.c).join(' '))
await god(true)
for (const s of spots) {
  await teleport(s.x - 1.1, s.z + 0.9)
  await page.waitForTimeout(120)
  if (s.c === 'gun') {
    await page.waitForTimeout(250)
    await shot('03-prompt')
  }
  await page.keyboard.down('KeyE')
  await page.waitForFunction((id) => __g.runtime.spots[id].opened, s.id, { timeout: 8000 })
  await page.keyboard.up('KeyE')
}
console.log('searched', await state())

const fps = await page.evaluate(() => new Promise((r) => {
  let n = 0
  const t = performance.now()
  const f = () => { n++; if (performance.now() - t < 2500) requestAnimationFrame(f); else r(+(n / 2.5).toFixed(1)) }
  requestAnimationFrame(f)
}))
console.log('fps with', await page.evaluate(() => __g.runtime.hitboxes.size), 'enemies:', fps)

// fight: aim at the nearest live enemy from close range, firing with the real mouse button
async function fight(limit) {
  await page.mouse.down()
  const start = Date.now()
  let n = 0
  while (Date.now() - start < limit) {
    const s = await state()
    if (s.phase !== 'playing' || s.kills >= s.target) break
    await page.evaluate(() => {
      const r = __g.runtime
      const p = r.player
      const list = [...r.hitboxes.values()]
      if (!list.length) return
      const e = list.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]
      if (Math.hypot(e.x - p.x, e.z - p.z) > 6) {
        p.body.setTranslation({ x: e.x - 3, y: 1, z: e.z + 2 }, true)
      }
      const nx = e.x - p.x
      const nz = e.z - p.z
      p.view.yaw = Math.atan2(-nx, -nz)
      p.view.pitch = -0.02
    })
    if (s.mag <= 3) await page.keyboard.press('KeyR')
    if (n++ === 25) await shot('04-fight')
    await page.waitForTimeout(60)
  }
  await page.mouse.up()
}

await fight(90000)
console.log('fought', await state())
await shot('05-after-fight')
await page.waitForFunction(() => __g.useGame.getState().phase === 'cleared', null, { timeout: 8000 })
await shot('06-cleared')
await page.click('button.primary')
await page.waitForTimeout(2500)
console.log('level2', await state())
await shot('07-level2')
await fight(120000)
await page.waitForFunction(() => __g.useGame.getState().phase === 'won', null, { timeout: 8000 }).catch(() => {})
console.log('end', await state())
await shot('08-end')

// death and retry path
await god(false)
await page.click('button.primary')
await page.waitForTimeout(1500)
await page.evaluate(() => __g.useGame.getState().damagePlayer(1000))
await page.waitForTimeout(600)
console.log('dead', await state())
await shot('09-dead')
await page.click('button.primary')
await page.waitForTimeout(1200)
console.log('retry', await state())
console.log('errors', errors.slice(0, 8))
await browser.close()
