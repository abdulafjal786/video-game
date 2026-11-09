// Every sound is synthesised, so the game ships no audio files.
let ctx = null
let noiseBuf = null
let master = null

export function initAudio() {
  if (ctx) { ctx.resume(); return }
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = 0.5
  master.connect(ctx.destination)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  // low room tone
  const hum = ctx.createOscillator()
  const humGain = ctx.createGain()
  hum.frequency.value = 52
  humGain.gain.value = 0.02
  hum.connect(humGain).connect(master)
  hum.start()
}

function burst({ freq, q = 0.7, dur, gain }) {
  const t = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.setValueAtTime(freq, t)
  f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.2), t + dur)
  f.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(master)
  src.start(t, Math.random() * 0.5)
  src.stop(t + dur + 0.02)
}

function tone(freq, dur, gain, type = 'sine') {
  const t = ctx.currentTime
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)
}

export const sfx = {
  shot(volume = 1) {
    if (!ctx) return
    burst({ freq: 3800, dur: 0.16, gain: 0.8 * volume })
    burst({ freq: 420, dur: 0.3, gain: 0.9 * volume })
    tone(92, 0.14, 0.7 * volume, 'triangle')
  },
  hit() { if (ctx) tone(1500, 0.05, 0.16, 'square') },
  hurt() { if (ctx) burst({ freq: 700, dur: 0.14, gain: 0.5 }) },
  click() { if (ctx) tone(2200, 0.03, 0.15, 'square') },
  reload() {
    if (!ctx) return
    tone(320, 0.05, 0.25, 'square')
    setTimeout(() => ctx && tone(520, 0.05, 0.25, 'square'), 900)
  },
  loot() {
    if (!ctx) return
    tone(520, 0.1, 0.16)
    setTimeout(() => ctx && tone(780, 0.14, 0.16), 90)
  },
}
