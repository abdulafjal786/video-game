import { suspend } from 'suspend-react'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

// FBX files name the original .tga textures; ours are converted, so skip those requests.
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
const manager = new THREE.LoadingManager()
manager.setURLModifier((url) => (/\.(tga|dds|png|jpe?g)$/i.test(url) ? BLANK : url))

const SOLDIERS = [
  { file: 'Military_Male_01', id: 'sm002' },
  { file: 'Military_Male_03', id: 'sm004' },
  { file: 'Military_Male_04', id: 'sm005' },
]
const CLIPS = { Idle: 'm_idle_neutral_01', Walk: 'm_walk_neutral_01', Run: 'm_run_neutral_01' }

// Enemies wear blacked-out kit so they read as hostile at a glance.
const ENEMY_TINT = new THREE.Color(0.3, 0.27, 0.25)

const textureLoader = new THREE.TextureLoader()

async function surface(base, tint) {
  const [map, normalMap, roughnessMap] = await Promise.all([
    textureLoader.loadAsync(`/characters/tex/${base}_color${/head/.test(base) ? '' : '_acu'}.jpg`),
    textureLoader.loadAsync(`/characters/tex/${base}_normal.jpg`),
    textureLoader.loadAsync(`/characters/tex/${base}_specular.jpg`),
  ])
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  return new THREE.MeshStandardMaterial({
    map, normalMap, roughnessMap, normalScale: new THREE.Vector2(1, 1), color: tint ?? '#ffffff',
  })
}

async function dress(entry, enemy) {
  const tint = enemy ? ENEMY_TINT : null
  const [body, head, helmet, equipment] = await Promise.all([
    surface(`${entry.id}_body`, tint),
    surface(`${entry.id}_head`),
    surface(`${entry.id}_helmet`, tint),
    surface(`${entry.id}_equipment`, tint),
  ])
  const steel = new THREE.MeshStandardMaterial({ color: '#1c1e20', metalness: 0.8, roughness: 0.45 })
  return (name) => {
    if (/body/.test(name)) return body
    if (/head/.test(name)) return head
    if (/helmet/.test(name)) return helmet
    if (/equipment/.test(name)) return equipment
    return steel
  }
}

// FBX meshes arrive with many small material runs; sorting them cuts each soldier
// from about fifteen draw calls to one per material.
function compactGroups(geometry) {
  const byMaterial = new Map()
  for (const g of geometry.groups) {
    if (!byMaterial.has(g.materialIndex)) byMaterial.set(g.materialIndex, [])
    byMaterial.get(g.materialIndex).push(g)
  }
  const index = []
  const groups = []
  for (const [materialIndex, runs] of byMaterial) {
    const start = index.length
    for (const run of runs) {
      for (let i = 0; i < run.count; i++) {
        index.push(geometry.index ? geometry.index.getX(run.start + i) : run.start + i)
      }
    }
    groups.push({ start, count: index.length - start, materialIndex })
  }
  geometry.setIndex(index)
  geometry.clearGroups()
  for (const g of groups) geometry.addGroup(g.start, g.count, g.materialIndex)
}

// Faces stay in their bind pose, so the 34 facial bones only add matrix work.
// Their vertices are handed to the head bone and the bones are removed.
const BODY_BONE = /^Bip01(_Pelvis|_Spine\d?|_Neck|_Head|_[LR]_(Clavicle|UpperArm|Forearm|Hand|Finger\d+|Thigh|Calf|Foot|Toe0))?$/

function stripFaceBones(mesh) {
  const { bones, boneInverses } = mesh.skeleton
  const head = bones.findIndex((b) => b.name === 'Bip01_Head')
  const kept = []
  const inverses = []
  const remap = new Int32Array(bones.length)
  bones.forEach((b, i) => {
    if (BODY_BONE.test(b.name)) {
      remap[i] = kept.length
      kept.push(b)
      inverses.push(boneInverses[i])
    } else {
      remap[i] = -1
    }
  })
  const headIndex = remap[head]
  const skin = mesh.geometry.attributes.skinIndex
  for (let i = 0; i < skin.count; i++) {
    for (let c = 0; c < 4; c++) {
      const to = remap[skin.getComponent(i, c)]
      skin.setComponent(i, c, to < 0 ? headIndex : to)
    }
  }
  bones.forEach((b, i) => { if (remap[i] < 0) b.removeFromParent() })
  mesh.bind(new THREE.Skeleton(kept, inverses), mesh.bindMatrix)
}

const KEEP = /^Bip01(_Pelvis|_Spine\d?|_Neck|_Head|_[LR]_(Clavicle|UpperArm|Forearm|Hand|Finger\d+|Thigh|Calf|Foot|Toe0))?\.(position|quaternion)$/

// Face tracks and scale are dropped, and root drift is pinned so clips stay in place.
function cleanClip(clip, name) {
  const tracks = clip.tracks.filter((t) => KEEP.test(t.name)).map((t) => t.clone())
  for (const t of tracks) {
    if (t.name !== 'Bip01.position') continue
    const [x0, , z0] = t.values
    for (let i = 0; i < t.values.length; i += 3) {
      t.values[i] = x0
      t.values[i + 2] = z0
    }
  }
  return new THREE.AnimationClip(name, clip.duration, tracks)
}

async function loadCast() {
  const loader = new FBXLoader(manager)
  const [animFiles, models] = await Promise.all([
    Promise.all(Object.entries(CLIPS).map(async ([name, f]) => {
      const fbx = await loader.loadAsync(`/anims/${f}.fbx`)
      return cleanClip(fbx.animations[0], name)
    })),
    Promise.all(SOLDIERS.map((s) => loader.loadAsync(`/characters/${s.file}.fbx`))),
  ])

  const wear = async (model, entry, enemy) => {
    const pick = await dress(entry, enemy)
    model.traverse((o) => {
      if (!o.isMesh) return
      compactGroups(o.geometry)
      stripFaceBones(o)
      o.material = [].concat(o.material).map((m) => pick(m.name))
    })
    return model
  }
  const clips = Object.fromEntries(animFiles.map((c) => [c.name, c]))
  return {
    clips,
    player: await wear(models[0], SOLDIERS[0], false),
    enemies: [await wear(models[1], SOLDIERS[1], true), await wear(models[2], SOLDIERS[2], true)],
  }
}

export const useCast = () => suspend(loadCast, ['cast'])
