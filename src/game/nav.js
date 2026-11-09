import { HALL } from './config'

// Grid breadth-first distance fields. One field gives every enemy a route
// to the same target, so chasing costs a single search however many chase.
export class NavGrid {
  constructor(obstacles) {
    this.cols = HALL.w
    this.rows = HALL.d
    this.blocked = new Uint8Array(this.cols * this.rows)
    const m = 0.65
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const { x, z } = this.world(c, r)
        const edge = Math.abs(x) > HALL.w / 2 - 1 || Math.abs(z) > HALL.d / 2 - 1
        const hit = obstacles.some((o) => Math.abs(x - o.x) < o.w / 2 + m && Math.abs(z - o.z) < o.d / 2 + m)
        this.blocked[r * this.cols + c] = edge || hit ? 1 : 0
      }
    }
  }

  world(c, r) {
    return { x: c - this.cols / 2 + 0.5, z: r - this.rows / 2 + 0.5 }
  }

  cell(x, z) {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor(x + this.cols / 2)))
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor(z + this.rows / 2)))
    return r * this.cols + c
  }

  nearestFree(i) {
    if (!this.blocked[i]) return i
    for (let rad = 1; rad < 6; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          const n = i + dr * this.cols + dc
          if (n >= 0 && n < this.blocked.length && !this.blocked[n]) return n
        }
      }
    }
    return i
  }

  field(x, z) {
    const { cols, rows, blocked } = this
    const dist = new Int16Array(cols * rows).fill(-1)
    const start = this.nearestFree(this.cell(x, z))
    const queue = new Int32Array(cols * rows)
    let head = 0
    let tail = 0
    queue[tail++] = start
    dist[start] = 0
    while (head < tail) {
      const i = queue[head++]
      const c = i % cols
      const d = dist[i] + 1
      if (c > 0 && !blocked[i - 1] && dist[i - 1] < 0) { dist[i - 1] = d; queue[tail++] = i - 1 }
      if (c < cols - 1 && !blocked[i + 1] && dist[i + 1] < 0) { dist[i + 1] = d; queue[tail++] = i + 1 }
      if (i >= cols && !blocked[i - cols] && dist[i - cols] < 0) { dist[i - cols] = d; queue[tail++] = i - cols }
      if (i < cols * (rows - 1) && !blocked[i + cols] && dist[i + cols] < 0) { dist[i + cols] = d; queue[tail++] = i + cols }
    }
    return dist
  }

  // Next waypoint downhill on a field, refusing diagonals that clip a corner.
  step(field, x, z) {
    const { cols, blocked } = this
    const i = this.nearestFree(this.cell(x, z))
    let best = i
    let bestD = field[i] < 0 ? Infinity : field[i]
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue
        const n = i + dr * cols + dc
        if (n < 0 || n >= field.length) continue
        if (Math.abs((n % cols) - (i % cols)) > 1) continue
        if (blocked[n] || field[n] < 0) continue
        if (dr && dc && (blocked[i + dc] || blocked[i + dr * cols])) continue
        const score = field[n] + (dr && dc ? 0.4 : 0)
        if (score < bestD) { bestD = score; best = n }
      }
    }
    return this.world(best % cols, Math.floor(best / cols))
  }

  randomFree(fromX, fromZ, minDist) {
    for (let t = 0; t < 400; t++) {
      const i = Math.floor(Math.random() * this.blocked.length)
      if (this.blocked[i]) continue
      const { x, z } = this.world(i % this.cols, Math.floor(i / this.cols))
      if (Math.hypot(x - fromX, z - fromZ) >= minDist) return { x, z }
    }
    return { x: 0, z: 0 }
  }
}
