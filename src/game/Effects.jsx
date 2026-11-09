import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { runtime } from './store'

const MAX_TRACERS = 24
const MAX_SPARKS = 240
const MAX_HOLES = 80

const mat = new THREE.Matrix4()
const pos = new THREE.Vector3()
const scale = new THREE.Vector3()
const quat = new THREE.Quaternion()
const color = new THREE.Color()
const UP = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)

function flashTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,245,210,1)')
  grad.addColorStop(0.25, 'rgba(255,190,90,0.9)')
  grad.addColorStop(1, 'rgba(255,120,20,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

export default function Effects() {
  const tracerMesh = useRef()
  const sparkMesh = useRef()
  const holeMesh = useRef()
  const flash = useRef()
  const flashLight = useRef()

  const pool = useMemo(() => ({
    tracers: Array.from({ length: MAX_TRACERS }, () => ({ life: 0, a: new THREE.Vector3(), b: new THREE.Vector3() })),
    tracerI: 0,
    sparks: Array.from({ length: MAX_SPARKS }, () => ({
      life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), size: 0.02,
    })),
    sparkI: 0,
    holeI: 0,
    flashLife: 0,
  }), [])

  const texture = useMemo(flashTexture, [])

  useEffect(() => {
    const hide = new THREE.Matrix4().makeScale(0, 0, 0)
    for (const m of [tracerMesh, sparkMesh, holeMesh]) {
      for (let i = 0; i < m.current.count; i++) m.current.setMatrixAt(i, hide)
      m.current.instanceMatrix.needsUpdate = true
    }

    const spray = (point, normal, count, tint, speed, size) => {
      for (let i = 0; i < count; i++) {
        const index = pool.sparkI++ % MAX_SPARKS
        const s = pool.sparks[index]
        s.life = s.max = 0.25 + Math.random() * 0.35
        s.size = size * (0.6 + Math.random() * 0.8)
        s.p.copy(point)
        s.v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5)
          .multiplyScalar(speed * 0.9).addScaledVector(normal, speed * Math.random())
        sparkMesh.current.setColorAt(index, color.set(tint))
      }
      sparkMesh.current.instanceColor.needsUpdate = true
    }

    runtime.fx = {
      tracer(from, to) {
        const t = pool.tracers[pool.tracerI++ % MAX_TRACERS]
        t.life = 0.055
        t.a.copy(from)
        t.b.copy(to)
      },
      muzzle(at) {
        pool.flashLife = 0.05
        flash.current.position.copy(at)
        flashLight.current.position.copy(at)
      },
      impact(point, normal) {
        spray(point, normal, 7, '#ffcf8a', 5, 0.016)
        spray(point, normal, 5, '#807a70', 2.5, 0.03)
        pos.copy(point).addScaledVector(normal, 0.012)
        quat.setFromUnitVectors(Z, normal)
        scale.setScalar(0.5 + Math.random() * 0.7)
        mat.compose(pos, quat, scale)
        holeMesh.current.setMatrixAt(pool.holeI++ % MAX_HOLES, mat)
        holeMesh.current.instanceMatrix.needsUpdate = true
      },
      blood(point, normal) {
        spray(point, normal, 12, '#5e0805', 3, 0.028)
      },
    }
    // the first call creates instanceColor, so the buffer exists from the start
    sparkMesh.current.setColorAt(0, color.set('#fff'))
    return () => { runtime.fx = null }
  }, [pool])

  useFrame((_, dt) => {
    pool.flashLife -= dt
    const on = pool.flashLife > 0
    flash.current.visible = on
    flashLight.current.intensity = on ? 30 : 0
    if (on) flash.current.scale.setScalar(0.3 + Math.random() * 0.25)

    pool.tracers.forEach((t, i) => {
      if (t.life <= 0) return
      t.life -= dt
      if (t.life <= 0) {
        tracerMesh.current.setMatrixAt(i, mat.makeScale(0, 0, 0))
      } else {
        pos.addVectors(t.a, t.b).multiplyScalar(0.5)
        const len = t.a.distanceTo(t.b)
        quat.setFromUnitVectors(UP, scale.subVectors(t.b, t.a).normalize())
        mat.compose(pos, quat, scale.set(1, len, 1))
        tracerMesh.current.setMatrixAt(i, mat)
      }
      tracerMesh.current.instanceMatrix.needsUpdate = true
    })

    let anySpark = false
    pool.sparks.forEach((s, i) => {
      if (s.life <= 0) return
      anySpark = true
      s.life -= dt
      s.v.y -= 9 * dt
      s.p.addScaledVector(s.v, dt)
      const k = Math.max(0, s.life / s.max)
      mat.makeScale(s.size * k, s.size * k, s.size * k).setPosition(s.p)
      sparkMesh.current.setMatrixAt(i, mat)
    })
    if (anySpark) sparkMesh.current.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={tracerMesh} args={[null, null, MAX_TRACERS]} frustumCulled={false}>
        <cylinderGeometry args={[0.012, 0.012, 1, 5]} />
        <meshBasicMaterial color={[9, 6.5, 3]} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={sparkMesh} args={[null, null, MAX_SPARKS]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh ref={holeMesh} args={[null, null, MAX_HOLES]} frustumCulled={false}>
        <circleGeometry args={[0.035, 10]} />
        <meshStandardMaterial color="#0b0a09" roughness={1} polygonOffset polygonOffsetFactor={-2} />
      </instancedMesh>
      <sprite ref={flash} visible={false}>
        <spriteMaterial map={texture} blending={THREE.AdditiveBlending} depthWrite={false} color={[6, 5, 4]} toneMapped={false} />
      </sprite>
      <pointLight ref={flashLight} color="#ffb060" intensity={0} distance={10} decay={2} />
    </>
  )
}
