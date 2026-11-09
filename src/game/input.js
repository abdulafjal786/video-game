export const keys = new Set()
export const mouse = { dx: 0, dy: 0, down: false }

export const pressed = (code) => keys.has(code)

export function bindInput() {
  const handlers = {
    keydown: (e) => {
      keys.add(e.code)
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault()
    },
    keyup: (e) => keys.delete(e.code),
    mousemove: (e) => {
      mouse.dx += e.movementX
      mouse.dy += e.movementY
    },
    mousedown: (e) => { if (e.button === 0) mouse.down = true },
    mouseup: (e) => { if (e.button === 0) mouse.down = false },
    blur: () => { keys.clear(); mouse.down = false },
  }
  for (const [name, fn] of Object.entries(handlers)) addEventListener(name, fn)
  return () => {
    for (const [name, fn] of Object.entries(handlers)) removeEventListener(name, fn)
  }
}

export function lockPointer() {
  const r = document.body.requestPointerLock?.()
  r?.catch?.(() => {}) // the game stays playable if the browser refuses
}
