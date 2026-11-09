import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { buildRifle, MUZZLE, RIGHT_GRIP, LEFT_GRIP } from './rifle'

const SCALE = 0.01 // the rig is authored in centimetres

const v1 = new THREE.Vector3()
const v2 = new THREE.Vector3()
const v3 = new THREE.Vector3()
const v4 = new THREE.Vector3()
const v5 = new THREE.Vector3()
const elbow = new THREE.Vector3()
const wrist = new THREE.Vector3()
const dirA = new THREE.Vector3()
const dirB = new THREE.Vector3()
const q1 = new THREE.Quaternion()
const q2 = new THREE.Quaternion()
const q3 = new THREE.Quaternion()
const UP = new THREE.Vector3(0, 1, 0)

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const worldPos = (bone, out) => out.setFromMatrixPosition(bone.matrixWorld)

const tmpP = new THREE.Vector3()
const tmpS = new THREE.Vector3()
const parentQuat = (bone, out) => bone.parent.matrixWorld.decompose(tmpP, out, tmpS)

// Recomputes just the bones IK is about to read. The renderer redoes the
// whole skeleton before drawing, so walking every subtree here would be wasted work.
function refresh(...chain) {
  for (const bone of chain) {
    bone.updateMatrix()
    bone.matrixWorld.multiplyMatrices(bone.parent.matrixWorld, bone.matrix)
  }
}

// Rotates a bone by a world-space rotation, keeping its parent where it is.
function applyWorldRotation(bone, q) {
  parentQuat(bone, q2)
  q3.copy(q2).invert().multiply(q).multiply(q2)
  bone.quaternion.premultiply(q3)
}

function setWorldQuaternion(bone, q) {
  parentQuat(bone, q2)
  bone.quaternion.copy(q2.invert().multiply(q))
}

// Analytic two-bone IK: swings the upper arm and forearm so the wrist lands on target.
function solveArm(upper, lower, hand, target, pole) {
  const a = worldPos(upper, v1)
  const b = worldPos(lower, v2)
  const c = worldPos(hand, v3)
  const la = a.distanceTo(b)
  const lb = b.distanceTo(c)
  const toTarget = v4.copy(target).sub(a)
  const dist = Math.min(Math.max(toTarget.length(), Math.abs(la - lb) + 0.01), la + lb - 0.005)
  toTarget.normalize()
  const cosA = (la * la + dist * dist - lb * lb) / (2 * la * dist)
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA))
  const perp = v5.copy(pole).sub(a)
  perp.addScaledVector(toTarget, -perp.dot(toTarget)).normalize()
  elbow.copy(a).addScaledVector(toTarget, la * cosA).addScaledVector(perp, la * sinA)

  q1.setFromUnitVectors(dirA.subVectors(b, a).normalize(), dirB.subVectors(elbow, a).normalize())
  applyWorldRotation(upper, q1)
  refresh(upper, lower, hand)

  worldPos(lower, v2)
  worldPos(hand, v3)
  wrist.copy(a).addScaledVector(toTarget, dist)
  q1.setFromUnitVectors(dirA.subVectors(v3, v2).normalize(), dirB.subVectors(wrist, v2).normalize())
  applyWorldRotation(lower, q1)
  refresh(lower, hand)
}

function frame(finger, palm) {
  const x = finger.clone().normalize()
  const z = new THREE.Vector3().crossVectors(x, palm).normalize()
  const y = new THREE.Vector3().crossVectors(z, x)
  return new THREE.Matrix4().makeBasis(x, y, z)
}

// Rifle-frame hand targets: barrel is -Z, the shooter's right is +X.
const RIGHT_AXES = { finger: new THREE.Vector3(-0.25, -0.3, -0.9), palm: new THREE.Vector3(-1, 0, 0.1) }
const LEFT_AXES = { finger: new THREE.Vector3(0.6, 0.05, -0.8), palm: new THREE.Vector3(0, 1, 0) }

// Everything about a hand is read off the skeleton's bind pose, so no axis is assumed.
function measureHand(bone, side) {
  const p = (n) => bone(`${side}_${n}`).getWorldPosition(new THREE.Vector3())
  const hand = p('Hand')
  const finger = p('Finger2').sub(hand).normalize()
  const across = p('Finger4').sub(p('Finger1')).normalize() // index toward pinky
  const palm = side === 'R'
    ? new THREE.Vector3().crossVectors(finger, across).normalize()
    : new THREE.Vector3().crossVectors(across, finger).normalize()
  const rest = bone(`${side}_Hand`).getWorldQuaternion(new THREE.Quaternion())
  const axes = side === 'R' ? RIGHT_AXES : LEFT_AXES
  const toGrip = new THREE.Quaternion().setFromRotationMatrix(
    frame(axes.finger, axes.palm).multiply(frame(finger, palm).invert()),
  )
  // Fingers curl about the knuckle line, toward the palm.
  const curlWorld = new THREE.Vector3().crossVectors(finger, palm).normalize()
  const curl = []
  for (let f = 0; f < 5; f++) {
    for (const seg of ['', '1', '2']) {
      const b = bone(`${side}_Finger${f}${seg}`)
      const inv = b.getWorldQuaternion(new THREE.Quaternion()).invert()
      curl.push({ bone: b, axis: curlWorld.clone().applyQuaternion(inv), angle: f === 0 ? 0.3 : 0.95 })
    }
  }
  return { rest, toGrip, curl }
}

export function createSoldier(source, clips, { belt = null } = {}) {
  const root = cloneSkinned(source)
  root.scale.setScalar(SCALE)
  const holder = new THREE.Group()
  holder.add(root)

  root.traverse((o) => {
    if (!o.isMesh) return
    o.castShadow = true
    o.receiveShadow = true
    o.frustumCulled = false
  })

  const bone = (n) => root.getObjectByName(`Bip01_${n}`)
  const b = {
    pelvis: bone('Pelvis'),
    spine: [bone('Spine'), bone('Spine1'), bone('Spine2')],
    head: bone('Head'),
    rClav: bone('R_Clavicle'), rUp: bone('R_UpperArm'), rLo: bone('R_Forearm'), rHand: bone('R_Hand'),
    lClav: bone('L_Clavicle'), lUp: bone('L_UpperArm'), lLo: bone('L_Forearm'), lHand: bone('L_Hand'),
  }

  root.updateWorldMatrix(true, true)
  const hands = { r: measureHand(bone, 'R'), l: measureHand(bone, 'L') }
  const foot = bone('R_Foot').getWorldPosition(new THREE.Vector3())
  const toe = bone('R_Toe0').getWorldPosition(new THREE.Vector3())
  const modelYaw = Math.atan2(-(toe.x - foot.x), -(toe.z - foot.z))

  const mixer = new THREE.AnimationMixer(root)
  const actions = {}
  for (const name of Object.keys(clips)) {
    actions[name] = mixer.clipAction(clips[name])
    actions[name].play()
    actions[name].setEffectiveWeight(0)
  }
  actions.Idle.setEffectiveWeight(1)
  actions.Idle.time = Math.random() * clips.Idle.duration
  const weights = { Idle: 1, Walk: 0, Run: 0 }

  const rifle = buildRifle()
  rifle.visible = false
  holder.add(rifle)
  if (belt) {
    belt.visible = false
    holder.add(belt)
  }

  const muzzle = new THREE.Vector3()
  const state = { bodyYaw: 0, recoil: 0, ready: 0, dead: 0 }
  const rifleQ = new THREE.Quaternion()
  const aimQ = new THREE.Quaternion()
  const euler = new THREE.Euler(0, 0, 0, 'YXZ')
  const right = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const target = new THREE.Vector3()
  const pole = new THREE.Vector3()

  function blend(dt, speed, backwards) {
    const want = speed < 0.15 ? 'Idle' : speed < 3.6 ? 'Walk' : 'Run'
    for (const name of Object.keys(actions)) {
      weights[name] += ((name === want ? 1 : 0) - weights[name]) * Math.min(1, dt * 10)
      actions[name].setEffectiveWeight(weights[name])
    }
    const dir = backwards ? -1 : 1
    actions.Walk.timeScale = dir * Math.max(0.6, speed / 1.5)
    actions.Run.timeScale = dir * Math.max(0.7, speed / 4.2)
    mixer.update(dt)
  }

  function placeBelt() {
    if (!belt?.visible) return
    worldPos(b.pelvis, belt.position)
    belt.position.y += 0.03
    belt.rotation.set(0, state.bodyYaw, 0)
  }

  // p: { x, y, z, speed, moveYaw, aimYaw, aimPitch, armed, firing, kick, reloading, dead }
  function update(dt, p) {
    root.position.set(p.x, p.y, p.z)

    if (p.dead) {
      state.dead = Math.min(1, state.dead + dt / 0.7)
      const t = state.dead * state.dead
      root.rotation.set(0, 0, 0)
      root.rotateY(state.bodyYaw - modelYaw)
      root.rotateX(-t * Math.PI * 0.49)
      root.position.y = p.y + t * 0.2
      if (rifle.visible) {
        rifle.position.y += (0.05 - rifle.position.y) * Math.min(1, dt * 7)
        rifle.rotateZ(dt * 2.5 * (1 - t))
      }
      return
    }

    const moving = p.speed > 0.15
    let bodyGoal = p.aimYaw
    let backwards = false
    if (moving) {
      const off = wrap(p.moveYaw - p.aimYaw)
      if (!p.armed || Math.abs(off) < 2.0) bodyGoal = p.moveYaw
      else { bodyGoal = wrap(p.moveYaw + Math.PI); backwards = true }
      if (p.armed && Math.abs(wrap(bodyGoal - p.aimYaw)) > 1.1) {
        bodyGoal = p.aimYaw + Math.sign(wrap(bodyGoal - p.aimYaw)) * 1.1
      }
    }
    state.bodyYaw = wrap(state.bodyYaw + wrap(bodyGoal - state.bodyYaw) * Math.min(1, dt * 11))

    blend(dt, p.speed, backwards)
    root.rotation.set(0, state.bodyYaw - modelYaw, 0)
    root.updateWorldMatrix(true, true)

    rifle.visible = p.armed
    placeBelt()
    if (!p.armed) return

    // Twist the torso back toward the aim, and bend it with the pitch.
    euler.set(p.aimPitch, p.aimYaw, 0)
    aimQ.setFromEuler(euler)
    forward.set(0, 0, -1).applyQuaternion(aimQ)
    right.set(1, 0, 0).applyQuaternion(aimQ)
    const twist = wrap(p.aimYaw - state.bodyYaw) / 3
    for (const s of b.spine) {
      q1.setFromAxisAngle(UP, twist)
      applyWorldRotation(s, q1)
      q1.setFromAxisAngle(right, p.aimPitch * 0.28)
      applyWorldRotation(s, q1)
      refresh(s)
    }
    refresh(b.rClav, b.rUp, b.rLo, b.rHand, b.lClav, b.lUp, b.lLo, b.lHand)

    const relaxed = p.speed > 4.6 && !p.firing
    state.ready += ((relaxed ? 0 : 1) - state.ready) * Math.min(1, dt * 9)
    const r = state.ready
    const dip = p.reloading ? 0.55 : (1 - r) * 0.75

    state.recoil = Math.max(0, state.recoil - dt * 9)
    if (p.kick) state.recoil = 1

    euler.set(p.aimPitch - dip, p.aimYaw - (1 - r) * 0.5, 0)
    rifleQ.setFromEuler(euler)
    worldPos(b.spine[2], v4)
    rifle.position.copy(v4)
      .addScaledVector(right, 0.14 + (1 - r) * 0.04)
      .addScaledVector(forward, 0.3 - state.recoil * 0.05)
    rifle.position.y += 0.1 - (1 - r) * 0.22 - (p.reloading ? 0.1 : 0)
    rifle.quaternion.copy(rifleQ)
    rifle.updateWorldMatrix(true, false)
    muzzle.copy(MUZZLE).applyMatrix4(rifle.matrixWorld)

    // Hands follow the rifle's grips.
    worldPos(b.rUp, pole).addScaledVector(right, 0.5).addScaledVector(forward, -0.35)
    pole.y -= 0.9
    target.copy(RIGHT_GRIP).applyMatrix4(rifle.matrixWorld)
    solveArm(b.rUp, b.rLo, b.rHand, target, pole)
    q1.copy(rifleQ).multiply(hands.r.toGrip).multiply(hands.r.rest)
    setWorldQuaternion(b.rHand, q1)

    worldPos(b.lUp, pole).addScaledVector(right, -0.3)
    pole.y -= 0.9
    target.copy(LEFT_GRIP).applyMatrix4(rifle.matrixWorld)
    solveArm(b.lUp, b.lLo, b.lHand, target, pole)
    q1.copy(rifleQ).multiply(hands.l.toGrip).multiply(hands.l.rest)
    setWorldQuaternion(b.lHand, q1)

    for (const f of hands.r.curl) f.bone.rotateOnAxis(f.axis, f.angle)
    for (const f of hands.l.curl) f.bone.rotateOnAxis(f.axis, f.angle)
  }

  const skinned = []
  root.traverse((o) => { if (o.isMesh) skinned.push(o) })
  const setShadow = (on) => {
    if (skinned[0].castShadow === on) return
    for (const m of skinned) m.castShadow = on
    for (const m of rifle.children) m.castShadow = on
  }

  return { holder, muzzle, update, setShadow }
}
