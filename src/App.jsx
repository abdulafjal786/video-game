import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import World from './game/World'
import Player from './game/Player'
import Enemies from './game/Enemies'
import Effects from './game/Effects'
import { HALL, LEVELS } from './game/config'
import { NavGrid } from './game/nav'
import { runtime, useGame } from './game/store'
import { bindInput } from './game/input'
import Hud from './ui/Hud'

function Stage({ runId, levelIndex }) {
  const level = LEVELS[levelIndex]
  useMemo(() => {
    runtime.noise = null
    runtime.nextEnemyShot = 0
    runtime.time = 0
    runtime.hunter = null
    runtime.nextHunterAt = 0
  }, [runId, level])
  const nav = useMemo(() => new NavGrid(level.layout), [level])

  return (
    <>
      <World level={level} />
      <Player />
      <Enemies level={level} nav={nav} />
    </>
  )
}

// Development only: lets the browser test scripts in tools/ reach the 3D scene.
function DevHooks() {
  const scene = useThree((s) => s.scene)
  if (import.meta.env.DEV) window.__g.scene = scene
  return null
}

export default function App() {
  const phase = useGame((s) => s.phase)
  const runId = useGame((s) => s.runId)
  const level = useGame((s) => s.level)
  const demoOpen = useGame((s) => s.demoOpen)

  useEffect(bindInput, [])
  useEffect(() => {
    const onLock = () => {
      if (!document.pointerLockElement && useGame.getState().phase === 'playing') {
        useGame.getState().setPhase('paused')
      }
    }
    document.addEventListener('pointerlockchange', onLock)
    return () => document.removeEventListener('pointerlockchange', onLock)
  }, [])

  return (
    <>
      <Canvas
        frameloop={demoOpen ? 'never' : 'always'} // the 3D scene sits out while the demo video plays
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 1.5]}
        camera={{ fov: 58, near: 0.1, far: HALL.w * 2, position: [-34, 3, 0] }}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false, toneMapping: THREE.NoToneMapping }}
      >
        <Suspense fallback={null}>
          <Physics gravity={[0, -20, 0]} timeStep={1 / 60} paused={phase !== 'playing'}>
            <Stage key={runId} runId={runId} levelIndex={level} />
          </Physics>
          <Effects />
          {import.meta.env.DEV && <DevHooks />}
          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur intensity={0.45} luminanceThreshold={1} luminanceSmoothing={0.2} />
            <ToneMapping mode={ToneMappingMode.AGX} />
            <Vignette offset={0.32} darkness={0.62} />
            <SMAA />
          </EffectComposer>
        </Suspense>
      </Canvas>
      <Hud />
    </>
  )
}
