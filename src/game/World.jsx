import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Environment, Sparkles, useTexture } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { HALL } from './config'
import { runtime } from './store'

const pbr = (name) => ({
  map: `/tex/${name}_diff.jpg`,
  normalMap: `/tex/${name}_nor_gl.jpg`,
  roughnessMap: `/tex/${name}_rough.jpg`,
})

function useSurface(name) {
  const set = useTexture(pbr(name))
  return useMemo(() => {
    for (const [key, t] of Object.entries(set)) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = 8
      t.colorSpace = key === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace
      t.needsUpdate = true
    }
    return set
  }, [set])
}

// A box whose UVs are in world units, so every surface shares one texture scale.
function worldBox(w, h, d, unit) {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  faces.forEach(([u, v], f) => {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i
      uv.setXY(k, (uv.getX(k) * u) / unit, (uv.getY(k) * v) / unit)
    }
  })
  return g
}

const TONES = ['#8a3b2c', '#2d5068', '#6f6a55', '#3f5a43']

// Corner posts and rails make the boxes read as shipping containers.
function ContainerFrame({ o }) {
  const color = TONES[o.tone]
  const px = o.w / 2 - 0.08
  const pz = o.d / 2 - 0.08
  const stack = o.h > 3 ? [1.3, 3.9] : [1.3]
  return stack.map((y) => (
    <group key={y} position={[o.x, y, o.z]}>
      {[[-px, -pz], [px, -pz], [-px, pz], [px, pz]].map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 0, z]} castShadow>
          <boxGeometry args={[0.2, 2.6, 0.2]} />
          <meshStandardMaterial color={color} metalness={0.7} roughness={0.55} />
        </mesh>
      ))}
      {[1.24, -1.24].map((h) => (
        <mesh key={h} position={[0, h, 0]}>
          <boxGeometry args={[o.w + 0.03, 0.14, o.d + 0.03]} />
          <meshStandardMaterial color={color} metalness={0.7} roughness={0.6} />
        </mesh>
      ))}
    </group>
  ))
}

function Obstacle({ o, surfaces }) {
  const geo = useMemo(() => worldBox(o.w, o.h, o.d, o.kind === 'container' ? 2.2 : 1.4), [o])
  const props = {
    container: { ...surfaces.iron, color: TONES[o.tone], metalness: 0.75 },
    cover: { ...surfaces.wood },
    pillar: { ...surfaces.rust, metalness: 0.8 },
  }[o.kind]
  return (
    <mesh geometry={geo} position={[o.x, o.h / 2, o.z]} castShadow receiveShadow>
      <meshStandardMaterial {...props} />
    </mesh>
  )
}

function Truss({ x }) {
  return (
    <group position={[x, HALL.h - 0.9, 0]}>
      <mesh castShadow><boxGeometry args={[0.35, 0.5, HALL.d]} /><meshStandardMaterial color="#26282b" metalness={0.8} roughness={0.5} /></mesh>
      <mesh position={[0, 0.7, 0]}><boxGeometry args={[0.2, 0.2, HALL.d]} /><meshStandardMaterial color="#26282b" metalness={0.8} roughness={0.5} /></mesh>
    </group>
  )
}

function Lamp({ x, z, power }) {
  return (
    <group position={[x, HALL.h - 1.7, z]}>
      <mesh><boxGeometry args={[0.9, 0.08, 0.28]} /><meshStandardMaterial color="#000" emissive="#fff0d0" emissiveIntensity={5} toneMapped={false} /></mesh>
      <pointLight color="#ffdcae" intensity={power} distance={20} decay={1.6} position={[0, -0.25, 0]} />
    </group>
  )
}

function Alarm() {
  const light = useRef()
  useFrame(() => {
    if (light.current) light.current.intensity = 60 * Math.max(0, Math.sin(runtime.time * 2.4)) ** 2
  })
  return <pointLight ref={light} color="#ff2a12" position={[0, 7, 0]} distance={48} decay={1.1} />
}

// Painted aisle lines give the empty floor some scale.
function FloorMarks() {
  return [-8.5, 8.5].map((z) => (
    <mesh key={z} position={[0, 0.006, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[58, 0.14]} />
      <meshStandardMaterial color="#a8862a" roughness={0.8} />
    </mesh>
  ))
}

export default function World({ level }) {
  const { mood, layout } = level
  const surfaces = {
    concrete: useSurface('concrete_floor_02'),
    iron: useSurface('corrugated_iron'),
    rust: useSurface('rusty_metal_02'),
    wood: useSurface('wood_planks_grey'),
  }
  const floorGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(HALL.w, HALL.d)
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * HALL.w) / 5, (uv.getY(i) * HALL.d) / 5)
    return g
  }, [])
  const wallA = useMemo(() => worldBox(HALL.w, HALL.h, 0.4, 3), [])
  const wallB = useMemo(() => worldBox(0.4, HALL.h, HALL.d, 3), [])
  const roof = useMemo(() => worldBox(HALL.w, 0.3, HALL.d, 5), [])

  const lamps = []
  for (const x of [-22, 0, 22]) for (const z of [-11, 11]) lamps.push([x, z])

  return (
    <>
      <color attach="background" args={[mood.fog]} />
      <fog attach="fog" args={[mood.fog, 22, 75]} />
      <Environment files="/hdri/warehouse.hdr" environmentIntensity={mood.ambient} />

      <directionalLight
        position={[14, 26, 8]}
        intensity={mood.sun}
        color="#ffe5c4"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-38}
        shadow-camera-right={38}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-far={70}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      {lamps.map(([x, z]) => <Lamp key={`${x},${z}`} x={x} z={z} power={mood.lamp} />)}
      {mood.alarm && <Alarm />}
      <Sparkles count={160} scale={[HALL.w, 6, HALL.d]} position={[0, 3.2, 0]} size={2.2} speed={0.12} opacity={0.3} color="#d8cdb8" />

      <RigidBody type="fixed" colliders={false} friction={0}>
        <CuboidCollider args={[HALL.w / 2, 0.5, HALL.d / 2]} position={[0, -0.5, 0]} />
        <CuboidCollider args={[HALL.w / 2, HALL.h / 2, 0.2]} position={[0, HALL.h / 2, -HALL.d / 2]} />
        <CuboidCollider args={[HALL.w / 2, HALL.h / 2, 0.2]} position={[0, HALL.h / 2, HALL.d / 2]} />
        <CuboidCollider args={[0.2, HALL.h / 2, HALL.d / 2]} position={[-HALL.w / 2, HALL.h / 2, 0]} />
        <CuboidCollider args={[0.2, HALL.h / 2, HALL.d / 2]} position={[HALL.w / 2, HALL.h / 2, 0]} />
        <CuboidCollider args={[HALL.w / 2, 0.15, HALL.d / 2]} position={[0, HALL.h, 0]} />
        {layout.map((o, i) => (
          <CuboidCollider key={i} args={[o.w / 2, o.h / 2, o.d / 2]} position={[o.x, o.h / 2, o.z]} />
        ))}
      </RigidBody>

      <mesh geometry={floorGeo} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <meshStandardMaterial {...surfaces.concrete} color="#8f8e8a" />
      </mesh>
      <mesh geometry={wallA} position={[0, HALL.h / 2, -HALL.d / 2]} receiveShadow><meshStandardMaterial {...surfaces.iron} color="#6d7276" metalness={0.5} /></mesh>
      <mesh geometry={wallA} position={[0, HALL.h / 2, HALL.d / 2]} receiveShadow><meshStandardMaterial {...surfaces.iron} color="#6d7276" metalness={0.5} /></mesh>
      <mesh geometry={wallB} position={[-HALL.w / 2, HALL.h / 2, 0]} receiveShadow><meshStandardMaterial {...surfaces.iron} color="#6d7276" metalness={0.5} /></mesh>
      <mesh geometry={wallB} position={[HALL.w / 2, HALL.h / 2, 0]} receiveShadow><meshStandardMaterial {...surfaces.iron} color="#6d7276" metalness={0.5} /></mesh>
      <mesh geometry={roof} position={[0, HALL.h, 0]}><meshStandardMaterial {...surfaces.rust} color="#4a4744" metalness={0.5} /></mesh>

      {[-24, -12, 0, 12, 24].map((x) => <Truss key={x} x={x} />)}
      {layout.map((o, i) => <Obstacle key={i} o={o} surfaces={surfaces} />)}
      {layout.filter((o) => o.kind === 'container').map((o, i) => <ContainerFrame key={i} o={o} />)}
      <FloorMarks />
    </>
  )
}
