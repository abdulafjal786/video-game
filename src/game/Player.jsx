import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { PLAYER, PLAYER_SPAWN, RIFLE } from './config'
import { mouse, pressed } from './input'
import { runtime, useGame } from './store'
import { createSoldier } from './soldier'
import { useCast } from './assets'
import { buildBelt } from './rifle'
import { sfx } from './audio'

const SENS = 0.0022
const PIVOT_H = 1.52
const CAM_DIST = 2.6
const CAM_SIDE = 0.62

const forward = new THREE.Vector3()
const side = new THREE.Vector3()
const desired = new THREE.Vector3()
const pivot = new THREE.Vector3()
const look = new THREE.Vector3()
const spread = new THREE.Vector3()
const impactAt = new THREE.Vector3()
const normal = new THREE.Vector3()

export default function Player() {
  const body = useRef()
  const collider = useRef()
  const cast = useCast()
  const belt = useMemo(buildBelt, [])
  const soldier = useMemo(() => createSoldier(cast.player, cast.clips, { belt }), [cast, belt])
  const { camera } = useThree()
  const { world, rapier } = useRapier()

  const view = useRef({
    yaw: -Math.PI / 2, pitch: -0.05, camDist: CAM_DIST,
    nextShot: 0, reloadEnd: 0, kick: 0, firing: 0, searching: null, searchT: 0,
    moveYaw: 0, speed: 0, heldQ: false, heldR: false, dry: 0,
  })

  useEffect(() => {
    runtime.player.body = body.current
    runtime.player.collider = collider.current
    runtime.player.view = view.current
    return () => { runtime.player.body = null; runtime.player.collider = null }
  }, [])

  function fire(now, v) {
    const g = useGame.getState()
    if (now < v.nextShot) return
    v.nextShot = now + 60 / RIFLE.rpm
    if (g.mag <= 0) {
      sfx.click()
      v.nextShot = now + 0.25
      return
    }
    useGame.setState({ mag: g.mag - 1 })
    sfx.shot(1)
    v.kick = 1
    v.firing = 0.14
    v.pitch = Math.min(1.1, v.pitch + 0.0065)
    v.yaw += (Math.random() - 0.5) * 0.005

    camera.getWorldDirection(forward)
    const inaccuracy = 0.004 + v.speed * 0.0028
    spread.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(inaccuracy)
    forward.add(spread).normalize()

    // Start past the player so the camera can't shoot something behind him.
    const skip = camera.position.distanceTo(body.current.translation()) + 0.5
    const origin = camera.position.clone().addScaledVector(forward, skip)
    const ray = new rapier.Ray(origin, forward)
    const hit = world.castRayAndGetNormal(ray, RIFLE.range, true, undefined, undefined, collider.current, body.current)

    const from = soldier.muzzle.clone()
    runtime.fx?.muzzle(from)
    runtime.noise = { x: runtime.player.x, z: runtime.player.z, t: runtime.time }

    if (!hit) {
      runtime.fx?.tracer(from, origin.addScaledVector(forward, RIFLE.range))
      return
    }
    const toi = hit.timeOfImpact ?? hit.toi
    impactAt.copy(origin).addScaledVector(forward, toi)
    normal.set(hit.normal.x, hit.normal.y, hit.normal.z)
    runtime.fx?.tracer(from, impactAt)

    const enemy = runtime.hitboxes.get(hit.collider.handle)
    if (enemy) {
      const head = impactAt.y - enemy.feet() > 1.48
      enemy.damage(head ? RIFLE.damage * RIFLE.headMultiplier : RIFLE.damage, impactAt)
      runtime.fx?.blood(impactAt, normal)
      useGame.getState().markHit(head)
      sfx.hit()
    } else {
      runtime.fx?.impact(impactAt, normal)
    }
  }

  function startReload(now, v) {
    const g = useGame.getState()
    if (g.reloading || g.mag >= RIFLE.magSize || g.reserve <= 0) return
    useGame.setState({ reloading: true })
    v.reloadEnd = now + RIFLE.reloadTime
    sfx.reload()
  }

  function finishReload() {
    const g = useGame.getState()
    const n = Math.min(RIFLE.magSize - g.mag, g.reserve)
    useGame.setState({ mag: g.mag + n, reserve: g.reserve - n, reloading: false })
  }

  function handleSearch(dt, v, x, z) {
    let best = null
    let bestD = PLAYER.searchRange
    for (const s of runtime.spots) {
      if (s.opened) continue
      const d = Math.hypot(s.x - x, s.z - z)
      if (d < bestD) { bestD = d; best = s }
    }
    const g = useGame.getState()
    if (!best) {
      v.searching = null
      v.searchT = 0
      g.setPrompt(null)
      return
    }
    if (pressed('KeyE')) {
      if (v.searching !== best) { v.searching = best; v.searchT = 0 }
      v.searchT += dt
      if (v.searchT >= PLAYER.searchTime) {
        best.opened = true
        v.searching = null
        v.searchT = 0
        g.takeLoot(best.contents)
        sfx.loot()
        g.setPrompt(null)
        return
      }
      g.setPrompt('Searching', Math.round((v.searchT / PLAYER.searchTime) * 20) / 20)
    } else {
      v.searching = null
      v.searchT = 0
      g.setPrompt('Hold E to search crate')
    }
  }

  useFrame((state, rawDt) => {
    const b = body.current
    if (!b) return
    const dt = Math.min(rawDt, 0.05)
    const g = useGame.getState()
    const v = view.current
    const t = b.translation()
    const playing = g.phase === 'playing'

    if (playing) {
      runtime.time += dt
      v.yaw -= mouse.dx * SENS
      v.pitch = THREE.MathUtils.clamp(v.pitch - mouse.dy * SENS, -0.75, 1.1)
    }
    mouse.dx = mouse.dy = 0

    // movement
    const f = (pressed('KeyW') ? 1 : 0) - (pressed('KeyS') ? 1 : 0)
    const r = (pressed('KeyD') ? 1 : 0) - (pressed('KeyA') ? 1 : 0)
    const dead = g.phase === 'dead'
    let vx = 0
    let vz = 0
    let speed = 0
    if (playing && (f || r)) {
      const sprint = pressed('ShiftLeft') && f > 0 && !mouse.down && !g.reloading
      speed = sprint ? PLAYER.sprint : PLAYER.walk
      if (v.searching) speed *= 0.3
      const fx = -Math.sin(v.yaw)
      const fz = -Math.cos(v.yaw)
      const len = Math.hypot(f, r)
      vx = ((fx * f - fz * r) / len) * speed
      vz = ((fz * f + fx * r) / len) * speed
      v.moveYaw = Math.atan2(-vx, -vz)
    }
    v.speed = speed
    if (playing) {
      b.setLinvel({ x: vx, y: b.linvel().y, z: vz }, true)
    } else {
      b.setLinvel({ x: 0, y: b.linvel().y, z: 0 }, true)
    }
    runtime.player.x = t.x
    runtime.player.y = t.y
    runtime.player.z = t.z
    runtime.player.moving = speed

    if (playing) {
      if (g.hasGun) {
        const now = runtime.time
        if (g.mag + g.reserve === 0) {
          v.dry += dt
          if (v.dry >= RIFLE.scavengeDelay) {
            v.dry = 0
            useGame.setState({ reserve: RIFLE.scavengeRounds })
            g.showToast('Found a few loose rounds')
          }
        } else v.dry = 0
        if (g.reloading && now >= v.reloadEnd) finishReload()
        if (pressed('KeyR')) {
          if (!v.heldR) startReload(now, v)
          v.heldR = true
        } else v.heldR = false
        if (mouse.down && !g.reloading) {
          if (g.mag > 0 || now >= v.nextShot) fire(now, v)
          if (useGame.getState().mag === 0 && useGame.getState().reserve > 0) startReload(now, v)
        }
      }
      if (pressed('KeyQ')) {
        if (!v.heldQ && g.useTools()) sfx.loot()
        v.heldQ = true
      } else v.heldQ = false
      handleSearch(dt, v, t.x, t.z)
    }

    v.firing = Math.max(0, v.firing - dt)
    belt.visible = g.hasBelt

    soldier.update(dt, {
      x: t.x, y: t.y - 0.9, z: t.z,
      speed, moveYaw: v.moveYaw, aimYaw: v.yaw, aimPitch: v.pitch,
      armed: g.hasGun, firing: v.firing > 0, kick: v.kick, reloading: g.reloading, dead,
    })
    v.kick = 0

    // over-the-shoulder camera, pulled in when something is in the way
    pivot.set(t.x, t.y - 0.9 + PIVOT_H, t.z)
    const cp = Math.cos(v.pitch)
    look.set(-Math.sin(v.yaw) * cp, Math.sin(v.pitch), -Math.cos(v.yaw) * cp)
    side.set(Math.cos(v.yaw), 0, -Math.sin(v.yaw))
    pivot.addScaledVector(side, CAM_SIDE)
    desired.copy(pivot).addScaledVector(look, -CAM_DIST)

    const back = desired.clone().sub(pivot)
    const maxD = back.length()
    back.normalize()
    const hit = world.castRay(new rapier.Ray(pivot, back), maxD, true, undefined, undefined, collider.current, b)
    const free = hit ? Math.max(0.35, (hit.timeOfImpact ?? hit.toi) - 0.2) : maxD
    v.camDist += (free - v.camDist) * Math.min(1, dt * (free < v.camDist ? 30 : 6))

    camera.position.copy(pivot).addScaledVector(back, v.camDist)
    camera.lookAt(look.multiplyScalar(40).add(pivot))
  })

  return (
    <>
      <RigidBody
        ref={body}
        colliders={false}
        type="dynamic"
        position={[PLAYER_SPAWN[0], 1.0, PLAYER_SPAWN[1]]}
        enabledRotations={[false, false, false]}
        linearDamping={0}
        friction={0}
        canSleep={false}
      >
        <CapsuleCollider ref={collider} args={[0.55, 0.34]} />
      </RigidBody>
      <primitive object={soldier.holder} />
    </>
  )
}
