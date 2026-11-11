// Measures whether enemies shoot back: one enemy at close range, then one hit from long range.
// Player damage is counted, not applied, so the player survives the test.
// Run with the dev server up: npm run dev, then node tools/enemy-fire.mjs
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:5199/')
await page.waitForFunction(() => window.__g?.runtime.player.view, null, { timeout: 90000 })
await page.click('button.primary')
await page.waitForTimeout(1500)

await page.evaluate(() => {
  window.__hits = 0
  window.__muzzles = 0
  __g.useGame.setState({ damagePlayer: () => { window.__hits++ } })
  const fx = __g.runtime.fx
  const muzzle = fx.muzzle
  fx.muzzle = (at) => { window.__muzzles++; muzzle(at) }
})

// Puts the player at a set distance from one enemy, somewhere that enemy can see.
async function standOff(dist) {
  return page.evaluate(async (d) => {
    const r = __g.runtime
    const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
    for (const e of r.hitboxes.values()) {
      for (let a = 0; a < 6.28; a += 0.785) {
        const x = e.x + Math.cos(a) * d
        const z = e.z + Math.sin(a) * d
        if (Math.abs(x) > 30 || Math.abs(z) > 20) continue
        r.player.body.setTranslation({ x, y: 1, z }, true)
        r.player.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        e.state = 'chase' // aware of the player, so sight ignores facing
        await sleep(450)
        const dx = e.x - r.player.x
        const dz = e.z - r.player.z
        if (e.sees || window.__losProbe?.(e)) return { found: true, dist: +Math.hypot(dx, dz).toFixed(1) }
      }
    }
    return { found: false }
  }, dist)
}

async function watch(label, seconds, pin) {
  await page.evaluate(() => { window.__hits = 0; window.__muzzles = 0 })
  const t0 = Date.now()
  while (Date.now() - t0 < seconds * 1000) {
    if (pin) await page.evaluate(([x, z]) => __g.runtime.player.body.setTranslation({ x, y: 1, z }, true), pin)
    await page.waitForTimeout(100)
  }
  const out = await page.evaluate(() => ({ enemyShots: window.__muzzles, hitsOnPlayer: window.__hits }))
  console.log(label, out)
}

const near = await standOff(12)
console.log('close setup', near)
const pinNear = await page.evaluate(() => [__g.runtime.player.x, __g.runtime.player.z])
await watch('close range, 6s:', 6, pinNear)

// Long range: alert every enemy as if shot from far away, keep the player still out in the hall.
await page.evaluate(() => {
  const r = __g.runtime
  r.player.body.setTranslation({ x: -28, y: 1, z: 0 }, true)
  for (const e of r.hitboxes.values()) e.state = 'patrol'
})
await page.waitForTimeout(500)
const far = await page.evaluate(() => {
  const r = __g.runtime
  const p = r.player
  const list = [...r.hitboxes.values()].map((e) => ({ e, d: Math.hypot(e.x - p.x, e.z - p.z) }))
  list.sort((a, b) => a.d - b.d)
  const pick = list.find((o) => o.d > 22) ?? list[list.length - 1]
  pick.e.damage(10) // a hit from the player's rifle
  window.__farOne = pick.e
  return +pick.d.toFixed(1)
})
console.log('long range: shot an enemy at', far, 'm')
const samples = []
await page.evaluate(() => { window.__hits = 0; window.__muzzles = 0 })
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => __g.runtime.player.body.setTranslation({ x: -28, y: 1, z: 0 }, true))
  await page.waitForTimeout(500)
  samples.push(await page.evaluate(() => {
    const e = window.__farOne
    const p = __g.runtime.player
    return `${Math.hypot(e.x - p.x, e.z - p.z).toFixed(0)}m${e.sees ? ' sees' : ''}`
  }))
}
console.log('  its distance every 0.5s:', samples.join(', '))
console.log('  ', await page.evaluate(() => ({ enemyShots: window.__muzzles, hitsOnPlayer: window.__hits })))
console.log('errors', errors)
await browser.close()
