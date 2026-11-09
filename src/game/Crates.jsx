import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { PLAYER_SPAWN } from './config'
import { runtime } from './store'

const CRATE = { w: 1.1, h: 0.75, d: 0.8 }

export function rollLoot(level) {
  const near = [...level.spots]
    .map(([x, z], i) => ({ i, dist: Math.hypot(x - PLAYER_SPAWN[0], z - PLAYER_SPAWN[1]) }))
    .sort((a, b) => a.dist - b.dist)
    .map((s) => s.i)
  const contents = new Array(level.spots.length).fill(null)

  for (const item of level.guaranteed) {
    const pick = near.slice(0, 3).filter((i) => !contents[i])
    contents[pick[Math.floor(Math.random() * pick.length)]] = item
  }
  const free = () => contents.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0)
  for (const item of [...level.required, ...[...level.loot].sort(() => Math.random() - 0.5)]) {
    const f = free()
    if (!f.length) break
    contents[f[Math.floor(Math.random() * f.length)]] = item
  }
  return level.spots.map(([x, z], i) => ({
    id: i, x, z, contents: contents[i] ?? 'empty', opened: false, yaw: (i * 1.9) % Math.PI,
  }))
}

function Crate({ spot, wood }) {
  const lid = useRef()
  const marker = useRef()
  const open = useRef(0)

  useFrame((_, dt) => {
    const goal = spot.opened ? 1 : 0
    open.current += (goal - open.current) * Math.min(1, dt * 8)
    lid.current.rotation.x = -open.current * 1.9
    const pulse = spot.opened ? 0.06 : 3 + Math.sin(runtime.time * 3 + spot.id) * 2
    marker.current.color.setRGB(pulse, pulse * 0.55, pulse * 0.1)
  })

  return (
    <group position={[spot.x, 0, spot.z]} rotation={[0, spot.yaw, 0]}>
      <mesh position={[0, CRATE.h / 2 - 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[CRATE.w, CRATE.h - 0.06, CRATE.d]} />
        <meshStandardMaterial {...wood} color="#a58a64" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * CRATE.w) / 2.05, CRATE.h / 2 - 0.03, 0]} castShadow>
          <boxGeometry args={[0.07, CRATE.h - 0.02, CRATE.d + 0.05]} />
          <meshStandardMaterial color="#3a3026" roughness={0.8} />
        </mesh>
      ))}
      <group ref={lid} position={[0, CRATE.h - 0.05, -CRATE.d / 2]}>
        <mesh position={[0, 0.03, CRATE.d / 2]} castShadow>
          <boxGeometry args={[CRATE.w + 0.04, 0.06, CRATE.d + 0.04]} />
          <meshStandardMaterial {...wood} color="#8a7050" />
        </mesh>
      </group>
      {/* a small amber lamp marks crates that have not been searched */}
      <mesh position={[0, CRATE.h - 0.2, CRATE.d / 2 + 0.015]}>
        <planeGeometry args={[0.12, 0.12]} />
        <meshBasicMaterial ref={marker} toneMapped={false} />
      </mesh>
    </group>
  )
}

export default function Crates({ spots }) {
  const wood = useTexture({
    map: '/tex/wood_planks_grey_diff.jpg',
    normalMap: '/tex/wood_planks_grey_nor_gl.jpg',
    roughnessMap: '/tex/wood_planks_grey_rough.jpg',
  })
  useMemo(() => {
    wood.map.colorSpace = THREE.SRGBColorSpace
    wood.map.wrapS = wood.map.wrapT = THREE.RepeatWrapping
  }, [wood])

  return (
    <>
      <RigidBody type="fixed" colliders={false} friction={0}>
        {spots.map((s) => (
          <CuboidCollider
            key={s.id}
            args={[CRATE.w / 2, CRATE.h / 2, CRATE.d / 2]}
            position={[s.x, CRATE.h / 2, s.z]}
            rotation={[0, s.yaw, 0]}
          />
        ))}
      </RigidBody>
      {spots.map((s) => <Crate key={s.id} spot={s} wood={wood} />)}
    </>
  )
}
