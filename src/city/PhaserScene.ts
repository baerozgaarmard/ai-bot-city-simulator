import Phaser from 'phaser'
import { engine } from '../simulation/engine'
import { GRID_W, GRID_H, LOCATIONS } from '../simulation/map'
import { useUI } from '../stores/store'
import { BUILDING_STYLES, spritePixels, type BuildingStyle, type Dir, type Frame } from './sprites'

export const iso = (x: number, y: number) => ({ sx: 480 + (x - y) * 32, sy: 80 + (x + y) * 16 })
let sceneRef: PhaserScene | null = null
export const focusAgent = (id: string) => sceneRef?.follow(id)
export const focusLocation = (id: string) => { const l = LOCATIONS.find(x => x.id === id); if (l) sceneRef?.focusTile(l.entrance.x, l.entrance.y) }
export const resetCamera = () => sceneRef?.resetView()
export const getScene = () => sceneRef

const shade = (hex: number, f: number) => { const r = Math.min(255, ((hex >> 16) & 255) * f), g = Math.min(255, ((hex >> 8) & 255) * f), b = Math.min(255, (hex & 255) * f); return (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b) }
const hexNum = (h: string) => parseInt(h.replace('#', ''), 16)

interface AgentObj { sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text; prevX: number; prevY: number; facing: Dir; frame: Frame; timer: number }

export class PhaserScene extends Phaser.Scene {
  private agentObjs = new Map<string, AgentObj>()
  private followId: string | null = null
  private acc = { v: 0 }
  private lastSync = 0
  private buildingLabels: Phaser.GameObjects.Text[] = []
  constructor() { super('city') }

  private diamond(g: Phaser.GameObjects.Graphics, sx: number, sy: number, hw: number, color: number, alpha = 1) {
    g.fillStyle(color, alpha); g.beginPath(); g.moveTo(sx, sy - hw / 2); g.lineTo(sx + hw, sy); g.lineTo(sx, sy + hw / 2); g.lineTo(sx - hw, sy); g.closePath(); g.fillPath()
  }
  private tree(sx: number, sy: number, depth: number) {
    const g = this.add.graphics(); g.fillStyle(0x78350f, 1); g.fillRect(sx - 2, sy - 10, 4, 12)
    g.fillStyle(0x16a34a, 1); g.fillCircle(sx, sy - 16, 11); g.fillStyle(0x22c55e, 1); g.fillCircle(sx - 4, sy - 20, 7); g.setDepth(depth)
  }
  private bench(sx: number, sy: number, depth: number) {
    const g = this.add.graphics(); g.fillStyle(0x92400e, 1); g.fillRect(sx - 14, sy - 4, 28, 5); g.fillStyle(0x78350f, 1); g.fillRect(sx - 14, sy - 10, 28, 4); g.setDepth(depth)
  }
  private streetlight(sx: number, sy: number, depth: number) {
    const g = this.add.graphics(); g.fillStyle(0x374151, 1); g.fillRect(sx - 1, sy - 26, 2, 26); g.fillStyle(0xfacc15, 1); g.fillCircle(sx + 3, sy - 28, 4); g.fillStyle(0xfacc15, 0.18); g.fillCircle(sx + 3, sy - 28, 10); g.setDepth(depth)
  }
  private car(sx: number, sy: number, color: number, depth: number) {
    const g = this.add.graphics(); g.fillStyle(0x111827, 1); g.fillCircle(sx - 8, sy + 6, 4); g.fillCircle(sx + 8, sy + 6, 4)
    g.fillStyle(color, 1); g.fillRoundedRect(sx - 16, sy - 6, 32, 12, 4); g.fillStyle(0xbfdbfe, 1); g.fillRoundedRect(sx - 6, sy - 4, 12, 7, 2); g.setDepth(depth)
  }
  private tableSet(sx: number, sy: number, depth: number) {
    const g = this.add.graphics(); g.fillStyle(0xf8fafc, 1); g.fillCircle(sx, sy, 7); g.fillStyle(0x92400e, 1); g.fillRect(sx - 12, sy - 3, 5, 5); g.fillRect(sx + 7, sy - 3, 5, 5); g.setDepth(depth)
  }
  private building(sx: number, sy: number, bw: number, style: BuildingStyle, depth: number) {
    const H = Math.max(28, style.stories * 26), bh = bw / 2, topY = sy - H
    const g = this.add.graphics()
    g.fillStyle(shade(hexNum(style.wall), 0.82), 1); g.beginPath(); g.moveTo(sx - bw, topY); g.lineTo(sx, topY + bh); g.lineTo(sx, sy + bh); g.lineTo(sx - bw, sy); g.closePath(); g.fillPath()
    g.fillStyle(shade(hexNum(style.wall), 0.66), 1); g.beginPath(); g.moveTo(sx, topY + bh); g.lineTo(sx + bw, topY); g.lineTo(sx + bw, sy); g.lineTo(sx, sy + bh); g.closePath(); g.fillPath()
    g.fillStyle(hexNum(style.roof), 1); g.beginPath(); g.moveTo(sx, topY - bh); g.lineTo(sx + bw, topY); g.lineTo(sx, topY + bh); g.lineTo(sx - bw, topY); g.closePath(); g.fillPath()
    g.lineStyle(1, 0x111827, 0.6); g.strokePoints([{ x: sx, y: topY - bh }, { x: sx + bw, y: topY }, { x: sx, y: topY + bh }, { x: sx - bw, y: topY }, { x: sx, y: topY - bh }])
    const win = (u: number, v: number, face: 'L' | 'R') => {
      const wx = (face === 'L' ? sx - bw : sx) + u * bw, wy = topY + u * bh + v * H
      const lit = (Math.round(u * 4) + Math.round(v * 4)) % 2 === 0
      g.fillStyle(lit ? 0xfde68a : 0xbfdbfe, 1); g.fillRect(wx - 4, wy - 5, 8, 10)
    }
    for (const u of [0.28, 0.55, 0.8]) for (const v of [0.28, 0.55, 0.78]) { if (H > 40 || v < 0.6) { win(u, v, 'L'); win(u, v, 'R') } }
    g.fillStyle(0x1f2937, 1); g.fillRect(sx - 6, sy + bh - 18, 12, 18)
    if (style.awning) for (let i = 0; i < 6; i++) { g.fillStyle(i % 2 ? 0xf8fafc : hexNum(style.awning), 1); g.fillRect(sx - 24 + i * 8, sy + bh - 26, 8, 7) }
    g.setDepth(depth)
    return { topY, bh }
  }
  private house(sx: number, sy: number, wall: string, roof: string, stories: number, depth: number) {
    const bw = 22, H = stories * 24, bh = 11, topY = sy - H
    const g = this.add.graphics()
    g.fillStyle(shade(hexNum(wall), 0.82), 1); g.beginPath(); g.moveTo(sx - bw, topY); g.lineTo(sx, topY + bh); g.lineTo(sx, sy + bh); g.lineTo(sx - bw, sy); g.closePath(); g.fillPath()
    g.fillStyle(shade(hexNum(wall), 0.66), 1); g.beginPath(); g.moveTo(sx, topY + bh); g.lineTo(sx + bw, topY); g.lineTo(sx + bw, sy); g.lineTo(sx, sy + bh); g.closePath(); g.fillPath()
    g.fillStyle(hexNum(roof), 1); g.beginPath(); g.moveTo(sx - bw, topY); g.lineTo(sx, topY - 16); g.lineTo(sx + bw, topY); g.lineTo(sx, topY + bh); g.closePath(); g.fillPath()
    g.fillStyle(0xbfdbfe, 1); g.fillRect(sx - 14, topY + 6, 7, 9); g.fillRect(sx + 7, topY + 6, 7, 9)
    g.fillStyle(0x78350f, 1); g.fillRect(sx - 4, sy + bh - 14, 8, 14); g.fillRect(sx + bw - 6, topY - 12, 4, 12)
    g.setDepth(depth)
  }
  private makeSpriteTextures(a: any, index: number) {
    const dirs: Dir[] = ['down', 'up', 'left', 'right']; const frames: Frame[] = ['idle', 'walkA', 'walkB']
    for (const dir of dirs) for (const frame of frames) {
      const key = `agent-${a.id}-${dir}-${frame}`; if (this.textures.exists(key)) continue
      const { rows, colors } = spritePixels(a.role, dir, frame, index)
      const g = this.add.graphics()
      rows.forEach((row, r) => { [...row].forEach((ch, c) => { if (ch === '.') return; g.fillStyle(hexNum(colors[ch] ?? '#111827'), 1); g.fillRect(c * 2, r * 2, 2, 2) }) })
      g.generateTexture(key, 32, 40); g.destroy()
    }
  }

  create() {
    sceneRef = this
    // shortcut: centre on the town (tile 11,8) at 0.85x so the whole
    // 22x16 grid is visible at load instead of cropping its edges.
    this.cameras.main.setZoom(0.85)
    this.cameras.main.centerOn(576, 384)
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const { sx, sy } = iso(x, y)
      const isRoad = y === 7 || x === 10
      const isPark = LOCATIONS.find(l => l.id === 'park')!.tiles.some(t => t.x === x && t.y === y)
      const g = this.add.graphics()
      if (isRoad) this.diamond(g, sx, sy, 32, 0x3f3f46)
      else if (isPark) this.diamond(g, sx, sy, 32, (x + y) % 2 ? 0x22c55e : 0x4ade80)
      else { this.diamond(g, sx, sy, 32, (x + y) % 2 ? 0xd6c9b0 : 0xcfc2a6); g.lineStyle(1, 0x8a7d64, 0.5); g.strokePoints([{ x: sx, y: sy - 16 }, { x: sx + 32, y: sy }, { x: sx, y: sy + 16 }, { x: sx - 32, y: sy }, { x: sx, y: sy - 16 }]) }
      if (isRoad && x === 10 && y === 7) for (let i = -2; i <= 2; i++) { g.fillStyle(0xf8fafc, 1); g.fillRect(sx - 22 + i * 9, sy - 14, 5, 28) }
      else if (isRoad && y === 7 && x !== 10) { g.fillStyle(0xfacc15, 0.9); g.fillRect(sx - 10, sy - 1, 20, 2) }
      else if (isRoad && x === 10) { g.fillStyle(0xfacc15, 0.9); g.fillRect(sx - 1, sy - 8, 2, 16) }
      if (!isRoad && (x * 7 + y * 13) % 5 === 0) { g.fillStyle(0x000000, 0.08); g.fillCircle(sx + 10, sy + 4, 2) }
      g.setDepth(sy)
    }
    for (const loc of LOCATIONS) {
      const style = BUILDING_STYLES[loc.id]
      const xs = loc.tiles.map(t => t.x), ys = loc.tiles.map(t => t.y)
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
      const { sx, sy } = iso(cx, cy)
      const bw = Math.max(30, (Math.max(...xs) - Math.min(...xs) + 1) * 28)
      if (loc.id === 'residential') {
        const houses: Array<[number, number, string, string, number]> = [[3.5, 11, '#fde68a', '#b45309', 2], [4.5, 11, '#dbeafe', '#7c3f16', 1], [4, 12, '#fecdd3', '#9a3412', 2]]
        for (const [hx, hy, wall, roof, st] of houses) { const p = iso(hx, hy); this.house(p.sx, p.sy, wall, roof, st, p.sy + 100) }
      } else if (loc.id === 'park') {
        const g = this.add.graphics(); g.fillStyle(0x9ca3af, 1); g.fillCircle(sx, sy, 18); g.fillStyle(0x38bdf8, 1); g.fillCircle(sx, sy, 13); g.fillStyle(0xe0f2fe, 1); g.fillCircle(sx, sy, 5); g.setDepth(sy + 60)
        for (const [tx, ty] of [[8, 8], [11, 8], [8, 9], [11, 9]] as const) { const p = iso(tx, ty); this.tree(p.sx - 12, p.sy - 6, p.sy + 50) }
        for (const [bx, by] of [[9, 8], [10, 9]] as const) { const p = iso(bx, by); this.bench(p.sx, p.sy + 8, p.sy + 50) }
        const path = this.add.graphics(); path.fillStyle(0xe7e5e4, 0.9); path.fillRect(sx - 30, sy - 2, 60, 4); path.setDepth(sy + 40)
      } else if (loc.id === 'bus') {
        const g = this.add.graphics(); g.fillStyle(0x374151, 1); g.fillRect(sx - 16, sy - 26, 3, 26); g.fillRect(sx + 13, sy - 26, 3, 26)
        g.fillStyle(0x1c1917, 1); g.fillRoundedRect(sx - 20, sy - 32, 40, 8, 2); g.fillStyle(0x92400e, 1); g.fillRect(sx - 12, sy - 8, 24, 4); g.setDepth(sy + 100)
        const sign = this.add.graphics(); sign.fillStyle(0x374151, 1); sign.fillRect(sx + 24, sy - 22, 2, 22); sign.fillStyle(0x1d4ed8, 1); sign.fillRect(sx + 18, sy - 32, 14, 10); sign.setDepth(sy + 100)
      } else {
        const { topY } = this.building(sx, sy, bw, style, sy + 100)
        if (loc.id === 'townhall') { const g = this.add.graphics(); for (let i = 0; i < 4; i++) { g.fillStyle(0xf8fafc, 1); g.fillRect(sx - 24 + i * 16, topY + 10, 5, 26) } g.fillStyle(0x374151, 1); g.fillRect(sx - 1, topY - 30, 2, 30); g.fillStyle(0xdc2626, 1); g.fillRect(sx + 1, topY - 30, 12, 8); g.setDepth(sy + 101) }
        if (loc.id === 'cafe' || loc.id === 'restaurant') { const e = iso(loc.entrance.x, loc.entrance.y); this.tableSet(e.sx + 22, e.sy - 6, e.sy + 60); this.tableSet(e.sx - 20, e.sy + 10, e.sy + 60) }
        if (loc.id === 'shop') { const g = this.add.graphics(); g.fillStyle(0xbfdbfe, 0.9); g.fillRect(sx - 20, sy + 6, 40, 12); g.setDepth(sy + 101) }
      }
      const label = this.add.text(sx, sy - (style.stories * 26 + 44), loc.name, { fontSize: '11px', color: '#f8fafc', backgroundColor: '#111827' }).setOrigin(0.5)
      label.setDepth(sy + 200); label.setVisible(false); this.buildingLabels.push(label)
    }
    for (const [lx, ly] of [[0, 7], [21, 7], [10, 0], [10, 15], [5, 7], [15, 7]] as const) { const p = iso(lx, ly); this.streetlight(p.sx, p.sy, p.sy + 50) }
    for (const [cx2, cy2, col] of [[2, 7, 0xdc2626], [18, 7, 0x2563eb], [10, 3, 0xeab308]] as const) { const p = iso(cx2, cy2); this.car(p.sx - 8, p.sy + 8, col, p.sy + 50) }
    for (const [tx, ty] of [[1, 6], [20, 8], [12, 12]] as const) { const p = iso(tx, ty); this.tree(p.sx, p.sy, p.sy + 50) }
    for (const a of engine.agents) this.ensureAgent(a.id)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.button === 0) this.input.setDefaultCursor('grabbing') })
    this.input.on('wheel', (_p: any, _o: any, _dx: number, dy: number) => { const cam = this.cameras.main; cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.5, 2.5)) })
    let dragging = false; let last: { x: number; y: number } | null = null
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown) { if (!dragging) { dragging = true; last = { x: p.x, y: p.y } } else if (last) { this.cameras.main.scrollX -= (p.x - last.x); this.cameras.main.scrollY -= (p.y - last.y); last = { x: p.x, y: p.y } } } else dragging = false })
    this.scale.on('resize', () => this.cameras.main.setViewport(0, 0, this.scale.width, this.scale.height))
  }
  ensureAgent(id: string) {
    if (this.agentObjs.has(id)) return
    const a = engine.agents.find(x => x.id === id)!; if (!a) return
    const index = engine.agents.indexOf(a)
    this.makeSpriteTextures(a, index)
    const sprite = this.add.sprite(0, 0, `agent-${a.id}-down-idle`)
    sprite.setInteractive(); sprite.on('pointerdown', () => useUI.getState().select(a.id))
    const label = this.add.text(0, -28, a.name, { fontSize: '10px', color: '#fff', backgroundColor: '#111827' }).setOrigin(0.5)
    sprite.setDepth(1000); label.setDepth(1001)
    this.agentObjs.set(id, { sprite, label, prevX: a.pos.x, prevY: a.pos.y, facing: 'down', frame: 'idle', timer: 0 })
  }
  follow(id: string) { this.followId = id }
  focusTile(x: number, y: number) { const { sx, sy } = iso(x, y); this.cameras.main.centerOn(sx, sy); this.followId = null }
  resetView() { this.cameras.main.setZoom(0.85); this.cameras.main.centerOn(576, 384); this.followId = null }
  update(_time: number, delta: number) {
    const ui = useUI.getState()
    engine.paused = ui.paused; engine.speed = ui.speed
    // Location labels are an optional overlay (Settings, off by default),
    // never a substitute for the buildings themselves.
    this.buildingLabels.forEach(l => l.setVisible(ui.showLocationLabels))
    if (!ui.paused) engine.step((delta / 1000) * ui.speed, this.acc)
    for (const a of engine.agents) {
      this.ensureAgent(a.id)
      const o = this.agentObjs.get(a.id)!; const { sx, sy } = iso(a.pos.x, a.pos.y)
      const dx = a.pos.x - o.prevX, dy = a.pos.y - o.prevY, moving = Math.abs(dx) + Math.abs(dy) > 0.001
      if (moving) {
        o.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
        o.timer += delta; if (o.timer > 160) { o.timer = 0; o.frame = o.frame === 'walkA' ? 'walkB' : 'walkA' }
      } else o.frame = 'idle'
      o.prevX = a.pos.x; o.prevY = a.pos.y
      o.sprite.setTexture(`agent-${a.id}-${o.facing}-${o.frame}`)
      o.sprite.setPosition(sx, sy - 20); o.sprite.setDepth(sy + 500)
      o.label.setPosition(sx, sy - 44); o.label.setDepth(sy + 501)
      o.label.setText(ui.showThoughts ? `${a.name}\n${a.state}` : a.name)
      if (ui.showPaths && ui.selectedId === a.id && a.path.length) {
        let g = o.sprite.getData('pathG') as Phaser.GameObjects.Graphics | undefined
        if (!g) { g = this.add.graphics(); o.sprite.setData('pathG', g) }
        g.clear(); g.lineStyle(2, 0xfacc15, 0.9); g.beginPath(); g.moveTo(sx, sy)
        for (const p of a.path) { const pp = iso(p.x, p.y); g.lineTo(pp.sx, pp.sy) } g.strokePath()
      }
    }
    if (this.followId) { const a = engine.agents.find(x => x.id === this.followId); if (a) { const { sx, sy } = iso(a.pos.x, a.pos.y); this.cameras.main.centerOn(sx, sy) } }
    if (_time - this.lastSync > 500) { this.lastSync = _time; ui.sync() }
  }
}
