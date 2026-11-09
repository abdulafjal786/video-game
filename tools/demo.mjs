// Records a demo run of Level 1. A script drives the real keyboard and mouse controls,
// steers by setting the aim directly, and has player damage off so the take finishes.
// Run with the dev server up: npm run dev, then node tools/demo.mjs
import { chromium } from 'playwright-core'
import fs from 'fs'

const OUT = 'tools/shots/demo'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'],
})
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
})
const page = await context.newPage()
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 60000 })

await page.goto('http://localhost:5199/')
await page.waitForFunction(() => window.__g?.runtime.player.view, null, { timeout: 90000 })
await page.waitForTimeout(2500)
await shot('menu')
await page.click('button.primary')
await page.waitForTimeout(800)

// Put the gear in a fixed route so the take is short and repeatable.
await page.evaluate(() => {
  const g = __g.useGame
  g.setState({ damagePlayer: () => {} })
  const s = __g.runtime.spots
  const swap = (item, i) => {
    const from = s.find((x) => x.contents === item)
    const held = s[i].contents
    s[i].contents = item
    from.contents = held
  }
  swap('gun', 0)
  swap('belt', 2)
  swap('tools', 4)
})

const steer = (x, z, rate = 0.3) => page.evaluate(([tx, tz, k]) => {
  const p = __g.runtime.player
  const want = Math.atan2(-(tx - p.x), -(tz - p.z))
  const d = Math.atan2(Math.sin(want - p.view.yaw), Math.cos(want - p.view.yaw))
  p.view.yaw += d * k
  p.view.pitch += (-0.06 - p.view.pitch) * 0.2
  return Math.hypot(tx - p.x, tz - p.z)
}, [x, z, rate])

async function walkTo(x, z, stop) {
  await page.keyboard.down('KeyW')
  for (let i = 0; i < 300; i++) {
    if ((await steer(x, z)) < stop) break
    await page.waitForTimeout(40)
  }
  await page.keyboard.up('KeyW')
}

async function search(id, name) {
  await page.waitForTimeout(350)
  await shot(`${name}-prompt`)
  await page.keyboard.down('KeyE')
  await page.waitForTimeout(600)
  await shot(`${name}-searching`)
  await page.waitForFunction((i) => __g.runtime.spots[i].opened, id, { timeout: 8000 })
  await page.keyboard.up('KeyE')
  await page.waitForTimeout(450)
  await shot(`${name}-found`)
  await page.waitForTimeout(700)
}

await page.waitForTimeout(500)
await shot('start')
await walkTo(-22, 7, 1.7)
await search(0, 'gun')
await walkTo(-13, -5, 1.7)
await search(2, 'belt')
await walkTo(-8.5, -8.6, 1)
await walkTo(2, -8, 1.7)
await search(4, 'tools')

// Aim through the camera pivot, which sits off the shoulder.
const aim = () => page.evaluate(() => {
  const r = __g.runtime
  const p = r.player
  const v = p.view
  const list = [...r.hitboxes.values()].filter((e) => e.sees)
  if (!list.length) return null
  const e = list.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]
  const px = p.x + Math.cos(v.yaw) * 0.62
  const pz = p.z - Math.sin(v.yaw) * 0.62
  const dx = e.x - px
  const dz = e.z - pz
  const dist = Math.hypot(dx, dz)
  const want = Math.atan2(-dx, -dz)
  const d = Math.atan2(Math.sin(want - v.yaw), Math.cos(want - v.yaw))
  v.yaw += d * 0.45
  v.pitch = Math.atan2(1.25 - (p.y - 0.9 + 1.52), dist)
  return { off: Math.abs(d), dist }
})
const state = () => page.evaluate(() => {
  const s = __g.useGame.getState()
  return { phase: s.phase, kills: s.kills, mag: s.mag, res: s.reserve }
})

const started = Date.now()
let firing = false
let lastLure = 0
let shots = 0
let lastKills = 0
const setFire = async (on) => {
  if (on === firing) return
  firing = on
  if (on) await page.mouse.down()
  else await page.mouse.up()
}
while (Date.now() - started < 170000) {
  const s = await state()
  if (s.phase !== 'playing' || s.kills >= 10) break
  if (s.kills !== lastKills) {
    lastKills = s.kills
    if (s.kills === 1 || s.kills === 5) await shot(`fight-${s.kills}`)
  }
  if (s.mag <= 2) {
    await setFire(false)
    await page.keyboard.press('KeyR')
    await page.waitForTimeout(1950)
    continue
  }
  const a = await aim()
  if (a && a.off < 0.05 && a.dist < 26) {
    await setFire(true)
    if (shots++ === 12) await shot('fight')
  } else if (!a) {
    await setFire(false)
    // a short burst draws anyone still patrolling
    if (Date.now() - lastLure > 4000) {
      lastLure = Date.now()
      await page.mouse.down()
      await page.waitForTimeout(140)
      await page.mouse.up()
    }
  } else {
    await setFire(false)
  }
  await page.waitForTimeout(40)
}
await setFire(false)
console.log('fight ended', await state(), `${Math.round((Date.now() - started) / 1000)}s`)
await page.waitForFunction(() => __g.useGame.getState().phase === 'cleared', null, { timeout: 8000 }).catch(() => console.log('not cleared'))
await page.waitForTimeout(600)
await shot('cleared')
await page.waitForTimeout(1200)

const video = page.video()
await context.close()
const path = await video.path()
fs.renameSync(path, `${OUT}/demo.webm`)
console.log('video bytes', fs.statSync(`${OUT}/demo.webm`).size)
await browser.close()
