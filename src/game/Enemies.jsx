import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { ENEMY, PLAYER_SPAWN } from './config'
import { runtime, useGame } from './store'
import { createSoldier } from './soldier'
import { useCast } from './assets'
import { sfx } from './audio'

const dir = new THREE.Vector3()
const eye = new THREE.Vector3()
const chest = new THREE.Vector3()
const hitPoint = new THREE.Vector3()

const squad = [] // live brains, used for spacing and shared alerts

function Enemy({ index, spawn, nav, level, playerField }) {
  const body = useRef()
  const collider = useRef()
  const cast = useCast()
  const soldier = useMemo(() => createSoldier(cast.enemies[index % cast.enemies.length], cast.clips), [cast, index])
  const { world, rapier } = useRapier()

  const brain = useRef({
    hp: ENEMY.health, dead: false, deadAt: 0,
    state: 'patrol', goal: null, goalField: null, idle: 0,
    sees: false, seeTimer: Math.random() * 0.2, reaction: 0, burst: 0, shotAt: 0, nextBurst: 0,
    strafe: 0, strafeUntil: 0, x: spawn.x, z: spawn.z, yaw: Math.random() * 6.28, moveYaw: 0, speed: 0,
    aimYaw: 0, aimPitch: 0, firing: 0, kick: 0, animDt: 0, tick: Math.floor(Math.random() * 3),
  })

  useEffect(() => {
    const b = brain.current
    const handle = collider.current.handle
    b.feet = () => body.current.translation().y - 0.9
    b.alert = () => { if (b.state === 'patrol') b.state = 'chase' }
    b.damage = (amount) => {
      if (b.dead) return
      b.hp -= amount
      b.alert()
      if (b.hp > 0) return
      b.dead = true
      b.deadAt = runtime.time
      runtime.hitboxes.delete(handle)
      collider.current.setEnabled(false)
      body.current.setEnabled(false)
      useGame.getState().addKill()
    }
    squad.push(b)
    runtime.hitboxes.set(handle, b)
    return () => {
      squad.splice(squad.indexOf(b), 1)
      runtime.hitboxes.delete(handle)
    }
  }, [])

  function lineOfSight(b) {
    const p = runtime.player
    eye.set(b.x, 1.55, b.z)
    chest.set(p.x, p.y + 0.35, p.z)
    dir.subVectors(chest, eye)
    const dist = dir.length()
    dir.normalize()
    const hit = world.castRay(new rapier.Ray(eye, dir), dist + 0.5, true, undefined, undefined, collider.current, body.current)
    return !!hit && hit.collider.handle === runtime.player.collider?.handle
  }

  function shoot(b, dist) {
    const p = runtime.player
    const moving = p.moving > 4 ? 0.14 : p.moving > 0 ? 0.06 : 0
    const chance = THREE.MathUtils.clamp(level.accuracy - dist * 0.008 - moving, 0.08, 0.7)
    const lands = Math.random() < chance

    eye.set(b.x, 1.5, b.z)
    chest.set(p.x, p.y + 0.25, p.z)
    if (!lands) {
      const miss = 0.6 + Math.random() * 0.9
      chest.x += (Math.random() - 0.5) * 2 * miss
      chest.y += (Math.random() - 0.3) * miss
      chest.z += (Math.random() - 0.5) * 2 * miss
    }
    dir.subVectors(chest, eye).normalize()
    const hit = world.castRayAndGetNormal(new rapier.Ray(eye, dir), 90, true, undefined, undefined, collider.current, body.current)

    const volume = THREE.MathUtils.clamp(1 - dist / 55, 0.12, 0.7)
    sfx.shot(volume)
    b.firing = 0.14
    b.kick = 1
    const from = soldier.muzzle.clone()
    runtime.fx?.muzzle(from)
    if (!hit) return

    const toi = hit.timeOfImpact ?? hit.toi
    hitPoint.copy(eye).addScaledVector(dir, toi)
    runtime.fx?.tracer(from, hitPoint)
    if (hit.collider.handle === p.collider?.handle) {
      useGame.getState().damagePlayer(level.enemyDamage)
      sfx.hurt()
    } else if (!runtime.hitboxes.has(hit.collider.handle)) {
      runtime.fx?.impact(hitPoint, new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z))
    }
  }

  useFrame((_, rawDt) => {
    const rb = body.current
    if (!rb) return
    const b = brain.current
    const dt = Math.min(rawDt, 0.05)
    const playing = useGame.getState().phase === 'playing'

    if (b.dead) {
      const since = runtime.time - b.deadAt
      soldier.update(dt, { x: b.x, y: 0, z: b.z, dead: true })
      if (since > 9) soldier.holder.visible = false
      return
    }

    const t = rb.translation()
    b.x = t.x
    b.z = t.z
    if (!playing) {
      rb.setLinvel({ x: 0, y: rb.linvel().y, z: 0 }, true)
      soldier.update(0.0001, {
        x: t.x, y: t.y - 0.9, z: t.z, speed: 0, moveYaw: b.moveYaw,
        aimYaw: b.yaw, aimPitch: b.aimPitch, armed: true, firing: false, kick: 0,
      })
      return
    }

    const p = runtime.player
    const dx = p.x - t.x
    const dz = p.z - t.z
    const dist = Math.hypot(dx, dz)
    const toPlayerYaw = Math.atan2(-dx, -dz)

    // Sight checks run a few times a second, not every frame.
    b.seeTimer -= dt
    if (b.seeTimer <= 0) {
      b.seeTimer = 0.2
      soldier.setShadow(dist < 15)
      const fx = -Math.sin(b.yaw)
      const fz = -Math.cos(b.yaw)
      const facing = dist > 0 ? (fx * dx + fz * dz) / dist : 1
      const canSee = dist < ENEMY.sightRange && (facing > ENEMY.fov || dist < 4 || b.state !== 'patrol')
      b.sees = canSee && lineOfSight(b)
      if (b.sees && b.state === 'patrol') {
        b.reaction += 0.2
        if (b.reaction >= 0.6) {
          b.state = 'chase'
          for (const o of squad) {
            if (Math.hypot(o.x - b.x, o.z - b.z) < 14) o.alert()
          }
        }
      } else if (!b.sees) {
        b.reaction = 0
      }
    }

    const n = runtime.noise
    if (b.state === 'patrol' && n && runtime.time - n.t < 0.3 && Math.hypot(n.x - b.x, n.z - b.z) < ENEMY.hearRange) {
      b.alert()
    }

    let goalX = t.x
    let goalZ = t.z
    let speed = 0

    if (b.state === 'patrol') {
      if (b.idle > 0) {
        b.idle -= dt
      } else {
        if (!b.goal || Math.hypot(b.goal.x - t.x, b.goal.z - t.z) < 1.6) {
          if (b.goal) b.idle = 1 + Math.random() * 3
          b.goal = nav.randomFree(PLAYER_SPAWN[0], PLAYER_SPAWN[1], 20)
          b.goalField = nav.field(b.goal.x, b.goal.z)
        }
        const w = nav.step(b.goalField, t.x, t.z)
        goalX = w.x
        goalZ = w.z
        speed = ENEMY.patrolSpeed
      }
    } else {
      const holding = b.sees && dist < ENEMY.engageRange
      if (holding) {
        if (runtime.time > b.strafeUntil) {
          b.strafe = Math.random() < 0.35 ? 0 : Math.random() < 0.5 ? -1 : 1
          b.strafeUntil = runtime.time + 0.7 + Math.random() * 1.1
        }
        if (b.strafe) {
          goalX = t.x + (-dz / (dist || 1)) * b.strafe
          goalZ = t.z + (dx / (dist || 1)) * b.strafe
          speed = 1.7
        }
      } else if (playerField.current) {
        const w = nav.step(playerField.current, t.x, t.z)
        goalX = w.x
        goalZ = w.z
        speed = ENEMY.chaseSpeed
      }

      // Bursts are rationed across the squad so a crowd can't melt the player instantly.
      if (b.sees && dist < ENEMY.sightRange && runtime.time >= b.nextBurst) {
        if (b.burst <= 0 && runtime.time >= runtime.nextEnemyShot) {
          b.burst = 3
          runtime.nextEnemyShot = runtime.time + 0.55
        }
        if (b.burst > 0 && runtime.time >= b.shotAt) {
          shoot(b, dist)
          b.burst -= 1
          b.shotAt = runtime.time + 0.11
          if (b.burst === 0) b.nextBurst = runtime.time + 1.3 + Math.random() * 1.5
        }
      }
    }

    // Steering, with a little push away from neighbours.
    let vx = goalX - t.x
    let vz = goalZ - t.z
    const len = Math.hypot(vx, vz)
    if (len > 0.02 && speed > 0) {
      vx = (vx / len) * speed
      vz = (vz / len) * speed
      for (const o of squad) {
        if (o === b || o.dead) continue
        const ox = t.x - o.x
        const oz = t.z - o.z
        const d = Math.hypot(ox, oz)
        if (d > 0 && d < 1.5) {
          vx += (ox / d) * (1.5 - d) * 2
          vz += (oz / d) * (1.5 - d) * 2
        }
      }
      b.moveYaw = Math.atan2(-vx, -vz)
    } else {
      vx = vz = 0
      speed = 0
    }
    rb.setLinvel({ x: vx, y: rb.linvel().y, z: vz }, true)

    const engaged = b.state !== 'patrol' && b.sees
    const wantYaw = engaged ? toPlayerYaw : speed > 0 ? b.moveYaw : b.yaw
    const delta = Math.atan2(Math.sin(wantYaw - b.yaw), Math.cos(wantYaw - b.yaw))
    b.yaw += delta * Math.min(1, dt * 7)
    b.aimPitch = engaged ? Math.atan2((p.y + 0.3) - 1.5, Math.max(dist, 1)) : -0.25

    b.firing = Math.max(0, b.firing - dt)

    // Enemies far from the player animate at a third of the rate; nobody can tell at that range.
    b.animDt += dt
    b.tick += 1
    if (dist < 18 || b.firing > 0 || b.tick % 3 === 0) {
      soldier.update(b.animDt, {
        x: t.x, y: t.y - 0.9, z: t.z, speed, moveYaw: b.moveYaw,
        aimYaw: b.yaw, aimPitch: b.aimPitch, armed: true, firing: b.firing > 0, kick: b.kick,
      })
      b.animDt = 0
      b.kick = 0
    }
  })

  return (
    <>
      <RigidBody
        ref={body}
        colliders={false}
        type="dynamic"
        position={[spawn.x, 1.0, spawn.z]}
        enabledRotations={[false, false, false]}
        friction={0}
        canSleep={false}
      >
        <CapsuleCollider ref={collider} args={[0.55, 0.34]} />
      </RigidBody>
      <primitive object={soldier.holder} />
    </>
  )
}

export default function Enemies({ level, nav }) {
  const playerField = useRef(null)
  const lastCell = useRef(-1)
  const timer = useRef(0)

  const spawns = useMemo(() => {
    const out = []
    while (out.length < level.target) {
      const s = nav.randomFree(PLAYER_SPAWN[0], PLAYER_SPAWN[1], 30)
      if (out.every((o) => Math.hypot(o.x - s.x, o.z - s.z) > 2.5)) out.push(s)
    }
    return out
  }, [level, nav])

  useFrame((_, dt) => {
    timer.current -= dt
    if (timer.current > 0) return
    timer.current = 0.3
    const p = runtime.player
    const cell = nav.cell(p.x, p.z)
    if (cell !== lastCell.current || !playerField.current) {
      lastCell.current = cell
      playerField.current = nav.field(p.x, p.z)
    }
  })

  return spawns.map((s, i) => <Enemy key={i} index={i} spawn={s} nav={nav} level={level} playerField={playerField} />)
}
