// Plays the game in real Chrome: start armed, fight, die, retry, finish both levels.
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
    hp: Math.round(s.health), armor: Math.round(s.armor), tools: s.toolCharges, mag: s.mag, res: s.reserve, y: +p.y.toFixed(2),
  }
})
const shot = (n) => page.screenshot({ path: `tools/shots/${n}.png`, timeout: 60000 })
const god = (on) => page.evaluate((v) => {
  const g = __g.useGame
  window.__orig ??= g.getState().damagePlayer
  g.setState({ damagePlayer: v ? () => {} : window.__orig })
}, on)

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

// the player starts armed: one real click should fire a round
const before = (await state()).mag
await page.mouse.down()
await page.waitForTimeout(150)
await page.mouse.up()
console.log('first click fired', before - (await state()).mag, 'rounds')
await god(true)

const fps = await page.evaluate(() => new Promise((r) => {
  let n = 0
  const t = performance.now()
  const f = () => { n++; if (performance.now() - t < 2500) requestAnimationFrame(f); else r(+(n / 2.5).toFixed(1)) }
  requestAnimationFrame(f)
}))
console.log('fps with', await page.evaluate(() => __g.runtime.hitboxes.size), 'enemies:', fps)

// fight: stand near the nearest live enemy, aim through the over-the-shoulder camera,
// and hold the real mouse button only while the crosshair is on target
async function fight(limit) {
  const start = Date.now()
  let n = 0
  let down = false
  const fire = async (on) => {
    if (on === down) return
    down = on
    if (on) await page.mouse.down()
    else await page.mouse.up()
  }
  while (Date.now() - start < limit) {
    const s = await state()
    if (s.phase !== 'playing' || s.kills >= s.target) break
    const off = await page.evaluate(() => {
      const r = __g.runtime
      const p = r.player
      const v = p.view
      const list = [...r.hitboxes.values()]
      if (!list.length) return 9
      const e = list.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]
      if (Math.hypot(e.x - p.x, e.z - p.z) > 6) {
        p.body.setTranslation({ x: e.x - 3, y: 1, z: e.z + 2 }, true)
        return 9
      }
      const px = p.x + Math.cos(v.yaw) * 0.62
      const pz = p.z - Math.sin(v.yaw) * 0.62
      const want = Math.atan2(-(e.x - px), -(e.z - pz))
      const d = Math.atan2(Math.sin(want - v.yaw), Math.cos(want - v.yaw))
      v.yaw += d * 0.6
      v.pitch = Math.atan2(1.25 - (p.y - 0.9 + 1.52), Math.hypot(e.x - px, e.z - pz))
      return Math.abs(d)
    })
    if (s.mag <= 2 && s.res > 0) {
      await fire(false)
      await page.keyboard.press('KeyR')
      await page.waitForTimeout(1950)
      continue
    }
    await fire(off < 0.06)
    if (n++ === 25) await shot('04-fight')
    await page.waitForTimeout(50)
  }
  await fire(false)
}

// every level in turn: fight to the target, then the clear screen (or the win screen after the last)
for (let level = 1; ; level++) {
  await fight(300000)
  console.log(`level${level} fought`, await state())
  await shot(`0${level}-fight-done`)
  const phase = await page.waitForFunction(
    () => ['cleared', 'won'].includes(__g.useGame.getState().phase) && __g.useGame.getState().phase,
    null, { timeout: 8000 },
  ).then((h) => h.jsonValue())
  await shot(`0${level}-${phase}`)
  if (phase === 'won') break
  await page.click('button.primary')
  await page.waitForTimeout(3000)
  console.log(`level${level + 1} start`, await state())
}
console.log('end', await state())

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
