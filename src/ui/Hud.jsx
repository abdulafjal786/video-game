import { useEffect, useState } from 'react'
import { LEVELS, PLAYER } from '../game/config'
import { useGame } from '../game/store'
import { lockPointer } from '../game/input'
import { initAudio } from '../game/audio'

const go = (action) => () => {
  initAudio()
  lockPointer()
  useGame.getState()[action]()
}

function Screen({ kicker, title, body, action, label, children, footer }) {
  return (
    <div className="screen">
      <div className="panel">
        {kicker && <p className="kicker">{kicker}</p>}
        <h1>{title}</h1>
        {body && <p className="body">{body}</p>}
        {children}
        <button className="primary" onClick={go(action)}>{label}</button>
        {footer}
      </div>
    </div>
  )
}

function DemoPlayer({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.code === 'Escape') onClose() }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="demo" role="dialog" aria-modal="true" aria-label="How to play demo">
      <div className="demo-panel">
        <div className="demo-head">
          <h2>How to play</h2>
          <button className="secondary small" onClick={onClose}>Close</button>
        </div>
        <video src="/demo/how-to-play.mp4" poster="/demo/poster.jpg" controls autoPlay muted playsInline />
        <p className="body">Silent recording of Level 1: aim, fire, and kill 10 to clear it.</p>
      </div>
    </div>
  )
}

function Controls() {
  const rows = [
    ['W A S D', 'Move'], ['Shift', 'Sprint'], ['Mouse', 'Aim'], ['Left click', 'Fire'],
    ['R', 'Reload'], ['Q', 'Use tools'], ['Esc', 'Pause'],
  ]
  return (
    <dl className="controls">
      {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  )
}

function Bar({ label, value, max, tone }) {
  return (
    <div className="bar">
      <span className="bar-label">{label}</span>
      <div className="bar-track"><div className={`bar-fill ${tone}`} style={{ width: `${(value / max) * 100}%` }} /></div>
      <span className="bar-value">{Math.ceil(value)}</span>
    </div>
  )
}

function Slot({ on, label, count }) {
  return (
    <div className={on ? 'slot on' : 'slot'}>
      {label}{count != null && on ? ` ×${count}` : ''}
    </div>
  )
}

function Toast() {
  const toast = useGame((s) => s.toast)
  const [shown, setShown] = useState(null)
  useEffect(() => {
    if (!toast) return undefined
    setShown(toast.text)
    const t = setTimeout(() => setShown(null), 2200)
    return () => clearTimeout(t)
  }, [toast])
  return shown ? <div className="toast">{shown}</div> : null
}

function Crosshair() {
  const hit = useGame((s) => s.hit)
  const [marker, setMarker] = useState(null)
  useEffect(() => {
    if (!hit) return undefined
    setMarker(hit < 0 ? 'head' : 'body')
    const t = setTimeout(() => setMarker(null), 140)
    return () => clearTimeout(t)
  }, [hit])
  return (
    <div className="crosshair">
      <i /><i /><i /><i />
      {marker && <b className={marker} />}
    </div>
  )
}

function HurtFlash() {
  const hurt = useGame((s) => s.hurt)
  const health = useGame((s) => s.health)
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!hurt) return undefined
    setOn(true)
    const t = setTimeout(() => setOn(false), 180)
    return () => clearTimeout(t)
  }, [hurt])
  return <div className={`hurt ${on ? 'on' : ''} ${health < 30 ? 'low' : ''}`} />
}

const closeDemo = () => useGame.getState().setDemoOpen(false)

function Hud() {
  const s = useGame()
  const lvl = LEVELS[s.level]
  const inGame = s.phase === 'playing'

  return (
    <div className="hud">
      {inGame && (
        <>
          <div className="top">
            <div>
              <p className="kicker">Level {s.level + 1}: {lvl.name}</p>
              <p className="objective">Kill {s.target - s.kills} more</p>
            </div>
            <div className="kills"><strong>{s.kills}</strong><span>/ {s.target}</span></div>
          </div>
          <Crosshair />
          <HurtFlash />
          <Toast />
          <div className="bottom">
            <div className="vitals">
              <Bar label="Health" value={s.health} max={PLAYER.maxHealth} tone={s.health < 30 ? 'low' : 'ok'} />
              <Bar label="Belt" value={s.armor} max={PLAYER.maxArmor} tone="armor" />
            </div>
            <div className="gear">
              <Slot on={s.toolCharges > 0} label="Tools (Q)" count={s.toolCharges} />
            </div>
            <div className="ammo">
              {s.reloading ? <span className="reloading">Reloading</span> : <strong>{s.mag}</strong>}
              <span>/ {s.reserve}</span>
            </div>
          </div>
        </>
      )}

      {s.phase === 'menu' && (
        <Screen
          kicker="Third-person shooter"
          title="Dead Freight"
          body="Hostile contractors hold a freight yard. You have a rifle, a safety belt and tools. Clear the shed, the night shift, the forest, then a flooded marsh where they come one at a time."
          action="start"
          label="Start"
          footer={<button className="secondary" onClick={() => s.setDemoOpen(true)}>Demo</button>}
        >
          <Controls />
        </Screen>
      )}
      {s.phase === 'menu' && s.demoOpen && <DemoPlayer onClose={closeDemo} />}
      {s.phase === 'paused' && (
        <Screen title="Paused" action="resume" label="Resume"><Controls /></Screen>
      )}
      {s.phase === 'cleared' && (
        <Screen
          kicker={`Level ${s.level + 1} clear`}
          title={`${s.kills} down`}
          body={`${LEVELS[s.level + 1].intro} Your health, belt, ammo and tools are refilled.`}
          action="nextLevel"
          label="Next level"
        />
      )}
      {s.phase === 'dead' && (
        <Screen
          kicker={`Level ${s.level + 1}`}
          title="You died"
          body={`${s.kills} of ${s.target} down.`}
          action="retry"
          label="Try again"
        />
      )}
      {s.phase === 'won' && (
        <Screen kicker={`All ${LEVELS.length} levels clear`} title="You win" body="Nobody left standing but you." action="start" label="Play again" />
      )}
    </div>
  )
}

export default Hud
