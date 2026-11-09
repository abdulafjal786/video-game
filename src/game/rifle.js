import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Rifle frame: origin at the pistol grip, barrel along -Z, +Y up. Units are metres.
const S = 0.86
export const MUZZLE = new THREE.Vector3(0, 0.09, -0.74).multiplyScalar(S)
export const RIGHT_GRIP = new THREE.Vector3(0.016, -0.045, 0.085).multiplyScalar(S)
export const LEFT_GRIP = new THREE.Vector3(-0.012, 0.0, -0.34).multiplyScalar(S)

// A side-on outline, given as [z, y] points, extruded across the rifle's width.
function profile(points, width, bevel = 0.003) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)))
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1,
  })
  g.translate(0, 0, -(width - bevel * 2) / 2)
  g.rotateY(-Math.PI / 2)
  return g
}

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z)
const tube = (r, len, y, z, seg = 12) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2).translate(0, y, z)

function clean(g) {
  const out = g.index ? g.toNonIndexed() : g
  out.deleteAttribute('uv')
  return out
}

let parts = null

function buildParts() {
  const steel = [
    profile([[-0.16, 0.03], [0.14, 0.03], [0.15, 0.085], [0.165, 0.128], [-0.16, 0.128]], 0.05),
    tube(0.011, 0.3, 0.09, -0.57),
    tube(0.015, 0.2, 0.094, 0.24),
    box(0.02, 0.014, 0.05, 0.03, 0.105, 0.11), // charging handle
    box(0.006, 0.05, 0.1, 0.026, 0.085, -0.04), // ejection cover
  ]
  const dark = [
    box(0.03, 0.012, 0.46, 0, 0.136, -0.08), // top rail
    tube(0.017, 0.08, 0.09, -0.72, 8), // muzzle brake
    profile([[-0.13, 0.03], [-0.055, 0.03], [-0.03, -0.125], [-0.105, -0.15]], 0.026), // magazine
    box(0.008, 0.045, 0.012, 0, 0.16, -0.43), // front sight
    box(0.03, 0.014, 0.05, 0, 0.148, 0.02), // optic mount
    tube(0.021, 0.12, 0.178, 0.02, 14), // optic
    profile([[-0.04, 0.0], [0.04, 0.0], [0.045, 0.03], [-0.04, 0.03]], 0.012, 0.001), // trigger guard
  ]
  for (let i = 0; i < 7; i++) dark.push(box(0.064, 0.024, 0.016, 0, 0.09, -0.19 - i * 0.04)) // vents
  const polymer = [
    profile([[-0.47, 0.055], [-0.16, 0.05], [-0.16, 0.128], [-0.47, 0.128]], 0.058, 0.005), // handguard
    profile([[0.17, 0.125], [0.17, 0.07], [0.24, 0.075], [0.37, 0.008], [0.415, 0.0], [0.415, 0.135], [0.25, 0.122]], 0.034, 0.005), // stock
    profile([[0.0, 0.032], [0.055, 0.032], [0.09, -0.09], [0.035, -0.1]], 0.036, 0.005), // grip
  ]
  const merge = (list) => {
    const g = mergeGeometries(list.map(clean))
    g.scale(S, S, S)
    return g
  }
  const lens = tube(0.016, 0.003, 0.178, 0.081, 14).scale(S, S, S)
  return {
    steel: { geo: merge(steel), mat: new THREE.MeshStandardMaterial({ color: '#4a4d50', metalness: 0.9, roughness: 0.42 }) },
    dark: { geo: merge(dark), mat: new THREE.MeshStandardMaterial({ color: '#232527', metalness: 0.7, roughness: 0.5 }) },
    polymer: { geo: merge(polymer), mat: new THREE.MeshStandardMaterial({ color: '#35332d', metalness: 0.05, roughness: 0.68 }) },
    lens: { geo: lens, mat: new THREE.MeshStandardMaterial({ color: '#120808', emissive: '#a01808', emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.15 }) },
  }
}

// One rifle is four draw calls however detailed it gets, and every soldier shares the buffers.
export function buildRifle() {
  parts ??= buildParts()
  const g = new THREE.Group()
  for (const { geo, mat } of Object.values(parts)) {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = true
    g.add(mesh)
  }
  return g
}

export function buildBelt() {
  const webbing = [
    new THREE.CylinderGeometry(0.2, 0.2, 0.055, 28, 1, true).scale(1, 1, 0.74),
  ]
  const pouches = []
  const place = (w, h, d, angle, radius, y) => {
    const g = new THREE.BoxGeometry(w, h, d)
    g.rotateY(angle)
    g.translate(Math.sin(angle) * radius, y, Math.cos(angle) * radius * 0.74)
    return g
  }
  for (const a of [1.2, 1.75, 2.3, -1.2, -1.75, -2.3]) pouches.push(place(0.08, 0.1, 0.05, a, 0.205, -0.02))
  const metal = [place(0.065, 0.052, 0.014, Math.PI, 0.203, 0)]

  const group = new THREE.Group()
  const add = (list, mat) => {
    const mesh = new THREE.Mesh(mergeGeometries(list.map(clean)), mat)
    mesh.castShadow = true
    group.add(mesh)
  }
  add(webbing, new THREE.MeshStandardMaterial({ color: '#3b3a2e', roughness: 0.9, side: THREE.DoubleSide }))
  add(pouches, new THREE.MeshStandardMaterial({ color: '#4d4935', roughness: 0.85 }))
  add(metal, new THREE.MeshStandardMaterial({ color: '#8c8f93', metalness: 0.9, roughness: 0.35 }))
  return group
}
