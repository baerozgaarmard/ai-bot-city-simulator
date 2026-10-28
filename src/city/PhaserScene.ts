import Phaser from 'phaser'
import { engine } from '../simulation/engine'
import { GRID_W, GRID_H, LOCATIONS } from '../simulation/map'
import { useUI } from '../stores/store'

export const iso = (x: number, y: number) => ({ sx: 480 + (x - y) * 32, sy: 80 + (x + y) * 16 })
let sceneRef: PhaserScene | null = null
export const focusAgent = (id: string) => sceneRef?.follow(id)
export const focusLocation = (id: string) => { const l = LOCATIONS.find(x => x.id === id); if (l) sceneRef?.focusTile(l.entrance.x, l.entrance.y) }
export const resetCamera = () => sceneRef?.resetView()
export const getScene = () => sceneRef

export class PhaserScene extends Phaser.Scene {
  private agentObjs = new Map<string, Phaser.GameObjects.Container>()
  private followId: string | null = null
  private acc = { v: 0 }
  private lastSync = 0
  constructor() { super('city') }
  create() {
    sceneRef = this
    this.cameras.main.setZoom(1)
    // Ground tiles
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const { sx, sy } = iso(x, y)
      const g = this.add.graphics()
      const isRoad = y === 7 || x === 10
      const isPark = LOCATIONS.find(l => l.id === 'park')!.tiles.some(t => t.x === x && t.y === y)
      const color = isPark ? 0x2f7d32 : isRoad ? 0x374151 : 0x4b5563
      g.fillStyle(color, 1); g.beginPath(); g.moveTo(sx, sy - 16); g.lineTo(sx + 32, sy); g.lineTo(sx, sy + 16); g.lineTo(sx - 32, sy); g.closePath(); g.fillPath()
      if (isRoad && (y === 7 || x === 10)) { g.fillStyle(0xfacc15, 0.7); g.fillRect(sx - 1, sy - 1, 2, 2) }
    }
    // Buildings: raised iso blocks, no emoji, no remote images
    for (const loc of LOCATIONS) {
      if (loc.id === 'park') { for (const t of loc.tiles) { const { sx, sy } = iso(t.x, t.y); const c = this.add.circle(sx, sy, 8, 0x16a34a); c.setDepth(sy) } continue }
      for (const t of loc.tiles) {
        const { sx, sy } = iso(t.x, t.y)
        const g = this.add.graphics(); g.fillStyle(0x1f2937, 1)
        g.beginPath(); g.moveTo(sx, sy - 28); g.lineTo(sx + 32, sy - 12); g.lineTo(sx, sy + 4); g.lineTo(sx - 32, sy - 12); g.closePath(); g.fillPath()
        g.fillStyle(0x9ca3af, 1); g.fillRect(sx - 2, sy - 28, 4, 12)
        g.setDepth(sy + 100)
        const label = this.add.text(sx, sy - 34, loc.name, { fontSize: '9px', color: '#e5e7eb', backgroundColor: '#111827' }).setOrigin(0.5); label.setDepth(sy + 101)
      }
    }
    // Agents
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
    const cont = this.add.container(0, 0)
    const body = this.add.circle(0, 0, 10, parseInt(a.color.replace('#', '0x')) as any)
    const head = this.add.circle(0, -8, 5, 0xfde68a)
    const label = this.add.text(0, -24, a.name, { fontSize: '10px', color: '#fff', backgroundColor: '#111827' }).setOrigin(0.5)
    cont.add([body, head, label]); cont.setInteractive(new Phaser.Geom.Circle(0, 0, 14), Phaser.Geom.Circle.Contains)
    cont.on('pointerdown', () => useUI.getState().select(a.id))
    cont.setDepth(1000); this.agentObjs.set(id, cont)
  }
  follow(id: string) { this.followId = id }
  focusTile(x: number, y: number) { const { sx, sy } = iso(x, y); this.cameras.main.centerOn(sx, sy); this.followId = null }
  resetView() { this.cameras.main.setZoom(1); this.cameras.main.centerOn(480, 280); this.followId = null }
  update(_time: number, delta: number) {
    const ui = useUI.getState()
    engine.paused = ui.paused; engine.speed = ui.speed
    if (!ui.paused) engine.step((delta / 1000) * ui.speed, this.acc)
    for (const a of engine.agents) {
      this.ensureAgent(a.id)
      const cont = this.agentObjs.get(a.id)!; const { sx, sy } = iso(a.pos.x, a.pos.y)
      cont.setPosition(sx, sy - 10); cont.setDepth(sy + 500)
      const label = cont.list[2] as Phaser.GameObjects.Text
      label.setText(ui.showThoughts ? `${a.name}\n${a.state}` : a.name)
      // Path preview for selected agent
      if (ui.showPaths && ui.selectedId === a.id && a.path.length) {
        // path line is drawn once per frame via a dedicated graphics object stored on container data
        let g = cont.getData('pathG') as Phaser.GameObjects.Graphics | undefined
        if (!g) { g = this.add.graphics(); cont.setData('pathG', g) }
        g.clear(); g.lineStyle(2, 0xfacc15, 0.9); g.beginPath(); g.moveTo(sx, sy)
        for (const p of a.path) { const pp = iso(p.x, p.y); g.lineTo(pp.sx, pp.sy) } g.strokePath()
      }
    }
    if (this.followId) { const a = engine.agents.find(x => x.id === this.followId); if (a) { const { sx, sy } = iso(a.pos.x, a.pos.y); this.cameras.main.centerOn(sx, sy) } }
    if (_time - this.lastSync > 500) { this.lastSync = _time; ui.sync() }
    // Reduced motion: Phaser already respects user setting via speed; no auto-animations beyond agent movement.
  }
}
