import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Environment, Sparkles, useGLTF, useTexture } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HALL, LOG_SCALE, seeded } from './config'
import { runtime } from './store'

const F = '/forest'
const M = '/marsh'

// What each outdoor level looks like. The marsh reuses the forest's trees, rocks and logs.
const LOOKS = {
  forest: {
    sky: '/hdri/forest.hdr', skyLight: 0.85, fog: ['#8f9a8c', 30, 115],
    sun: 3.2, sunColor: '#fff1d6', hemi: 0.35,
    ground: { map: `${F}/ground_diff.jpg`, normalMap: `${F}/ground_nor_gl.jpg`, roughnessMap: `${F}/ground_rough.jpg` },
    groundTint: '#b8b2a4', water: null, ferns: true, reeds: false, motes: '#f3e7b0',
  },
  marsh: {
    sky: '/hdri/marsh.hdr', skyLight: 0.75, fog: ['#7f8883', 16, 85],
    sun: 1.5, sunColor: '#e9eef0', hemi: 0.45,
    ground: { map: `${M}/mud_diff.jpg`, normalMap: `${M}/mud_nor_gl.jpg`, roughnessMap: `${M}/mud_rough.jpg` },
    groundTint: '#7d7466', water: 0.32, ferns: false, reeds: true, motes: '#dfe8e4',
  },
}

// Two sprigs from the fir_tree_01 atlas: [u0, v0, u1, v1], stem at v0, tip at v1.
const SPRIGS = [
  [0.31, 0.22, 0.645, 0.6],
  [0.635, 0.17, 0.957, 0.55],
]

// A branch is two crossed sprig cards, one upright and one flat, growing along +X from the trunk.
function branchGeometry([u0, v0, u1, v1]) {
  const card = () => {
    const g = new THREE.PlaneGeometry(1, 1)
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0))
    g.translate(0, 0.5, 0)
    g.rotateZ(-Math.PI / 2) // stem at the trunk, tip pointing out along +X
    return g
  }
  const flat = card().rotateX(Math.PI / 2)
  return mergeGeometries([card(), flat])
}

// Places every branch of every tree, so all foliage draws in two batches.
// `detail` sets how many branches a tree gets: distant trees get fewer, larger ones.
function growTrees(trees, detail) {
  const branches = [[], []]
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const p = new THREE.Vector3()
  const s = new THREE.Vector3()
  const tint = new THREE.Color()
  for (const t of trees) {
    const rng = seeded(t.seed)
    const base = t.h * (0.22 + rng() * 0.08) // bare lower trunk, so the forest floor stays readable
    if (t.bare) continue // dead trees: trunk only
    for (let y = base; y < t.h; y += detail.spacing + rng() * 0.18) {
      const k = (y - base) / (t.h - base)
      const reach = (0.5 + 3.1 * Math.pow(1 - k, 0.85) * (t.h / 18)) * detail.reach
      const count = detail.count + Math.floor(rng() * 2)
      const turn = rng() * Math.PI * 2
      for (let i = 0; i < count; i++) {
        const yaw = turn + (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.5
        e.set(0, yaw, -0.18 - rng() * 0.3 - (1 - k) * 0.15, 'YXZ')
        q.setFromEuler(e)
        p.set(t.x, y, t.z)
        s.set(reach, reach * 0.8, reach * 0.8)
        m.compose(p, q, s)
        const shade = 0.72 + rng() * 0.3 - (1 - k) * 0.12
        branches[i % 2].push({ m: m.clone(), c: tint.setRGB(shade, shade, shade * 0.95).clone() })
      }
    }
  }
  return branches
}

// Trees beyond the invisible boundary, so the play area sits inside a forest.
function boundaryTrees() {
  const rng = seeded(902)
  const out = []
  for (let i = 0; i < 2000 && out.length < 150; i++) {
    const x = (rng() - 0.5) * 96
    const z = (rng() - 0.5) * 76
    const inside = Math.abs(x) < HALL.w / 2 + 1 && Math.abs(z) < HALL.d / 2 + 1
    if (inside || out.some((o) => Math.hypot(o.x - x, o.z - z) < 4)) continue
    out.push({ x, z, h: 15 + rng() * 9, r: 0.35 + rng() * 0.18, seed: Math.floor(rng() * 1e9) })
  }
  return out
}

const NEAR = { spacing: 0.55, count: 5, reach: 1.05 }
const FAR = { spacing: 1.0, count: 4, reach: 1.3 }

function Trees({ trees, far }) {
  const tex = useTexture({
    bark: `${F}/bark_diff.jpg`, barkNor: `${F}/bark_nor.jpg`,
    twig: `${F}/twig_diff.png`, twigAlpha: `${F}/twig_alpha.jpg`, twigNor: `${F}/twig_nor.jpg`,
  })
  const trunkMesh = useRef()
  const foliage = [useRef(), useRef(), useRef(), useRef()]
  const all = useMemo(() => [...trees, ...far], [trees, far])

  const { trunkGeo, branchGeos, branches, barkMat, leafMat } = useMemo(() => {
    tex.bark.colorSpace = THREE.SRGBColorSpace
    tex.twig.colorSpace = THREE.SRGBColorSpace
    for (const t of [tex.bark, tex.barkNor]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(2, 5)
    }
    return {
      trunkGeo: new THREE.CylinderGeometry(0.35, 1, 1, 10, 1, true).translate(0, 0.5, 0),
      branchGeos: SPRIGS.map(branchGeometry),
      // near trees first (these cast shadows), then the boundary trees
      branches: [...growTrees(trees, NEAR), ...growTrees(far, FAR)],
      barkMat: new THREE.MeshStandardMaterial({ map: tex.bark, normalMap: tex.barkNor, roughness: 0.95 }),
      leafMat: new THREE.MeshStandardMaterial({
        map: tex.twig, alphaMap: tex.twigAlpha, normalMap: tex.twigNor,
        alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85,
      }),
    }
  }, [tex, trees, far])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    all.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, 0, t.z), new THREE.Quaternion(), new THREE.Vector3(t.r, t.h * 0.97, t.r))
      trunkMesh.current.setMatrixAt(i, m)
    })
    trunkMesh.current.instanceMatrix.needsUpdate = true
    branches.forEach((list, k) => {
      const mesh = foliage[k].current
      list.forEach((b, i) => {
        mesh.setMatrixAt(i, b.m)
        mesh.setColorAt(i, b.c)
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })
  }, [all, branches])

  return (
    <>
      <instancedMesh ref={trunkMesh} args={[trunkGeo, barkMat, all.length]} castShadow receiveShadow />
      {branches.map((list, k) => (
        <instancedMesh
          key={k}
          ref={foliage[k]}
          args={[branchGeos[k % 2], leafMat, list.length]}
          castShadow={k < 2}
          receiveShadow
        />
      ))}
    </>
  )
}

function Rocks({ rocks }) {
  const { scene } = useGLTF(`${F}/rock_moss_set_01/rock_moss_set_01.gltf`)
  const pieces = useMemo(() => scene.children.filter((c) => c.isMesh), [scene])
  return rocks.map((r, i) => {
    const src = pieces[r.piece % pieces.length]
    return (
      <mesh
        key={i}
        geometry={src.geometry}
        material={src.material}
        position={[r.x, 0, r.z]}
        rotation={[0, r.turn ? Math.PI / 2 : 0, 0]}
        scale={r.s}
        castShadow
        receiveShadow
      />
    )
  })
}

function Logs({ logs }) {
  const { scene } = useGLTF(`${F}/dead_tree_trunk/dead_tree_trunk.gltf`)
  const src = useMemo(() => scene.getObjectByProperty('isMesh', true), [scene])
  return logs.map((l, i) => (
    <mesh
      key={i}
      geometry={src.geometry}
      material={src.material}
      position={[l.x, 0.05, l.z]}
      rotation={[0, l.turn ? Math.PI / 2 : 0, 0]}
      scale={LOG_SCALE}
      castShadow
      receiveShadow
    />
  ))
}

// Ferns are decoration only: no collision, scattered away from the cover.
function Ferns({ layout }) {
  const { scene } = useGLTF(`${F}/fern_02/fern_02.gltf`)
  const kinds = useMemo(() => scene.children.filter((c) => c.isMesh), [scene])
  const refs = useRef([])
  const spots = useMemo(() => {
    const rng = seeded(55)
    const out = kinds.map(() => [])
    for (let i = 0; i < 700 && out.flat().length < 240; i++) {
      const x = (rng() - 0.5) * 80
      const z = (rng() - 0.5) * 60
      const nearCover = layout.some((o) => Math.abs(o.x - x) < o.w / 2 + 0.6 && Math.abs(o.z - z) < o.d / 2 + 0.6)
      if (nearCover) continue
      out[i % kinds.length].push([x, z, rng() * Math.PI * 2, 1.2 + rng() * 1.3])
    }
    return out
  }, [kinds, layout])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    spots.forEach((list, k) => {
      list.forEach(([x, z, yaw, s], i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
        m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s))
        refs.current[k].setMatrixAt(i, m)
      })
      refs.current[k].instanceMatrix.needsUpdate = true
    })
  }, [spots])

  return kinds.map((k, i) => (
    <instancedMesh
      key={i}
      ref={(el) => { refs.current[i] = el }}
      args={[k.geometry, k.material, spots[i].length]}
      receiveShadow
    />
  ))
}

// Reeds stand in clumps out of the water; like the ferns they have no collision.
function Reeds({ layout }) {
  const { scene } = useGLTF(`${M}/grass_medium_02/grass_medium_02.gltf`)
  const refs = useRef([])
  const { kinds, spots } = useMemo(() => {
    const meshes = scene.children.filter((c) => c.isMesh)
    // The model's blended leaves sort badly in a crowd; cut them out with alpha testing instead.
    const material = meshes[0].material.clone()
    material.transparent = false
    material.alphaTest = 0.5
    material.depthWrite = true
    material.side = THREE.DoubleSide
    const rng = seeded(81)
    const out = meshes.map(() => [])
    for (let i = 0; i < 1500 && out.flat().length < 420; i++) {
      const cx = (rng() - 0.5) * 90
      const cz = (rng() - 0.5) * 70
      const blocked = layout.some((o) => Math.abs(o.x - cx) < o.w / 2 + 1 && Math.abs(o.z - cz) < o.d / 2 + 1)
      if (blocked) continue
      for (let k = 0; k < 6; k++) {
        const x = cx + (rng() - 0.5) * 2.4
        const z = cz + (rng() - 0.5) * 2.4
        out[(i + k) % meshes.length].push([x, z, rng() * Math.PI * 2, 3 + rng() * 2, 5 + rng() * 4])
      }
    }
    return { kinds: meshes.map((m) => ({ geometry: m.geometry, material })), spots: out }
  }, [scene, layout])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    spots.forEach((list, k) => {
      list.forEach(([x, z, yaw, wide, tall], i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
        m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(wide, tall, wide))
        refs.current[k].setMatrixAt(i, m)
      })
      refs.current[k].instanceMatrix.needsUpdate = true
    })
  }, [spots])

  return kinds.map((k, i) => (
    <instancedMesh
      key={i}
      ref={(el) => { refs.current[i] = el }}
      args={[k.geometry, k.material, spots[i].length]}
      receiveShadow
    />
  ))
}

// Shallow standing water: a glossy sheet with ripples drifting across it.
// It reflects the sky through the environment map, which costs nothing extra per frame.
function Water({ level }) {
  const normals = useTexture(`${M}/waternormals.jpg`)
  const tex = useMemo(() => {
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping
    normals.repeat.set(18, 18)
    return normals
  }, [normals])

  useFrame((_, dt) => {
    tex.offset.x += dt * 0.011
    tex.offset.y += dt * 0.006
  })

  return (
    <mesh position={[0, level, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[180, 180]} />
      <meshStandardMaterial
        color="#1a2421"
        roughness={0.12}
        metalness={0.1}
        normalMap={tex}
        normalScale={[0.3, 0.3]}
        transparent
        opacity={0.9}
        envMapIntensity={0.75}
      />
    </mesh>
  )
}

function Ground({ look }) {
  const tex = useTexture(look.ground)
  const geo = useMemo(() => {
    for (const [k, t] of Object.entries(tex)) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = 8
      t.colorSpace = k === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace
    }
    const size = 180
    const g = new THREE.PlaneGeometry(size, size)
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * size) / 3.5, (uv.getY(i) * size) / 3.5)
    return g
  }, [tex])
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <meshStandardMaterial {...tex} color={look.groundTint} />
    </mesh>
  )
}

export default function Forest({ level }) {
  const { layout } = level
  const look = LOOKS[level.env]

  // Effects read this to turn bullet impacts below the surface into splashes.
  useEffect(() => {
    runtime.waterLevel = look.water
    return () => { runtime.waterLevel = null }
  }, [look])

  const parts = useMemo(() => {
    const trees = layout.filter((o) => o.kind === 'tree')
    return {
      trees,
      far: boundaryTrees(),
      rocks: layout.filter((o) => o.kind === 'rock'),
      logs: layout.filter((o) => o.kind === 'log'),
    }
  }, [layout])

  return (
    <>
      <Environment files={look.sky} background environmentIntensity={look.skyLight} />
      <fog attach="fog" args={look.fog} />
      <directionalLight
        position={[22, 34, 12]}
        intensity={look.sun}
        color={look.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-42}
        shadow-camera-right={42}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
        shadow-camera-far={90}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <hemisphereLight args={['#cfe0ff', '#4a3f2c', look.hemi]} />
      <Sparkles count={120} scale={[HALL.w, 7, HALL.d]} position={[0, 3, 0]} size={2} speed={0.15} opacity={0.35} color={look.motes} />

      <RigidBody type="fixed" colliders={false} friction={0}>
        <CuboidCollider args={[90, 0.5, 90]} position={[0, -0.5, 0]} />
        {/* invisible boundary, hidden behind the outer trees */}
        <CuboidCollider args={[HALL.w / 2, 6, 0.3]} position={[0, 6, -HALL.d / 2]} />
        <CuboidCollider args={[HALL.w / 2, 6, 0.3]} position={[0, 6, HALL.d / 2]} />
        <CuboidCollider args={[0.3, 6, HALL.d / 2]} position={[-HALL.w / 2, 6, 0]} />
        <CuboidCollider args={[0.3, 6, HALL.d / 2]} position={[HALL.w / 2, 6, 0]} />
        {layout.map((o, i) => (
          <CuboidCollider
            key={i}
            args={o.kind === 'tree' ? [o.r, o.h / 2, o.r] : [o.w / 2, o.h / 2, o.d / 2]}
            position={[o.x, o.h / 2, o.z]}
          />
        ))}
      </RigidBody>

      <Ground look={look} />
      {look.water != null && <Water level={look.water} />}
      <Trees trees={parts.trees} far={parts.far} />
      <Rocks rocks={parts.rocks} />
      <Logs logs={parts.logs} />
      {look.ferns && <Ferns layout={layout} />}
      {look.reeds && <Reeds layout={layout} />}
    </>
  )
}

useGLTF.preload(`${F}/rock_moss_set_01/rock_moss_set_01.gltf`)
useGLTF.preload(`${F}/dead_tree_trunk/dead_tree_trunk.gltf`)
useGLTF.preload(`${F}/fern_02/fern_02.gltf`)
useGLTF.preload(`${M}/grass_medium_02/grass_medium_02.gltf`)
