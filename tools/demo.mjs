// Records a demo run of Level 1, from the Start click to the clear screen. A script drives the real keyboard and mouse controls,
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

await page.evaluate(() => __g.useGame.setState({ damagePlayer: () => {} }))

// With nobody in sight, turn toward the nearest live enemy and walk at it.
let walking = false
const setWalk = async (on) => {
  if (on === walking) return
  walking = on
  if (on) await page.keyboard.down('KeyW')
  else await page.keyboard.up('KeyW')
}
const approach = () => page.evaluate(() => {
  const r = __g.runtime
  const p = r.player
  const v = p.view
  const list = [...r.hitboxes.values()]
  if (!list.length) return
  const e = list.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]
  const want = Math.atan2(-(e.x - p.x), -(e.z - p.z))
  v.yaw += Math.atan2(Math.sin(want - v.yaw), Math.cos(want - v.yaw)) * 0.25
  v.pitch += (-0.04 - v.pitch) * 0.2
})

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
  }
  if (s.mag <= 2) {
    await setFire(false)
    await page.keyboard.press('KeyR')
    await page.waitForTimeout(1950)
    continue
  }
  const a = await aim()
  if (a && a.off < 0.05 && a.dist < 26) {
    await setWalk(false)
    await setFire(true)
  } else if (!a) {
    await setFire(false)
    await setWalk(true)
    await approach()
    // a short burst now and then draws anyone still patrolling
    if (Date.now() - lastLure > 6000) {
      lastLure = Date.now()
      await page.mouse.down()
      await page.waitForTimeout(140)
      await page.mouse.up()
    }
  } else {
    await setWalk(false)
    await setFire(false)
  }
  await page.waitForTimeout(40)
}
await setFire(false)
await setWalk(false)
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
