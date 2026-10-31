import Phaser from 'phaser'
import { engine } from '../simulation/engine'
import { GRID_W, GRID_H, LOCATIONS, CROSSWALKS, roadAt, roadKind, sidewalkAt } from '../simulation/map'
import { useUI } from '../stores/store'
import { spritePixels, type Dir, type Frame } from './sprites'
import { buildAllTextures } from './textures'

export const iso = (x: number, y: number) => ({ sx: 480 + (x - y) * 32, sy: 80 + (x + y) * 16 })
let sceneRef: PhaserScene | null = null
export const focusAgent = (id: string) => sceneRef?.follow(id)
export const focusLocation = (id: string) => { const l = LOCATIONS.find(x => x.id === id); if (l) sceneRef?.focusTile(l.entrance.x, l.entrance.y) }
export const resetCamera = () => sceneRef?.resetView()
export const getScene = () => sceneRef

const hexNum = (h: string) => parseInt(h.replace('#', ''), 16)
interface AgentObj { sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; prevX: number; prevY: number; facing: Dir; frame: Frame; timer: number }

// Depth rule (unified, ground-based): ground = sy, shadow = sy+0.1,
// props/trees/cars = sy+0.5, buildings = sy+1, agents = sy+2, labels = sy+3.
// An agent north of a building (smaller sy) therefore renders behind it,
// and south of it renders in front — the previous +500 agent offset broke this.
export class PhaserScene extends Phaser.Scene {
  private agentObjs = new Map<string, AgentObj>()
  private followId: string | null = null
  private acc = { v: 0 }
  private lastSync = 0
  private buildingLabels: Phaser.GameObjects.Text[] = []
  private pathG: Phaser.GameObjects.Graphics | null = null
  constructor() { super('city') }

  private img(key: string, sx: number, sy: number, depth: number, scaleX = 1, scaleY = 1) {
    const im = this.add.image(sx, sy, key).setOrigin(0.5, 1)
    im.setDepth(depth); im.setScale(scaleX, scaleY); im.texture.setFilter(Phaser.Textures.FilterMode.NEAREST)
    return im
  }
  // V3 generated building if loaded, else the procedural texture.
  // Generated art is wide (240px); targetW keeps it at ~2-3 tiles wide so
  // it does not clip neighbours or dwarf doorways and agents.
  private buildingImg(id: string, sx: number, sy: number, depth: number, targetW: number, proceduralKey: string) {
    const v3 = `v3-building-${id}`
    if (this.textures.exists(v3)) {
      const w = this.textures.get(v3).source[0].width || 240
      const s = targetW / w
      return this.img(v3, sx, sy, depth, s, s)
    }
    return this.img(proceduralKey, sx, sy, depth)
  }
  private shadow(sx: number, sy: number, depth: number, w = 1) {
    const im = this.add.image(sx, sy, 'shadow').setOrigin(0.5, 1).setDepth(depth).setScale(w, 1)
    return im
  }
  preload() {
    // V3 AI-generated buildings (public/v3-assets/, copied to dist root).
    // If a file fails to load, create() falls back to procedural textures.
    for (const id of ['cafe', 'restaurant', 'shop', 'townhall', 'office', 'house']) {
      this.load.image(`v3-building-${id}`, `/v3-assets/building-${id}.png`)
    }
  }
  private makeSpriteTextures(a: any, index: number) {
    const dirs: Dir[] = ['down', 'up', 'left', 'right']; const frames: Frame[] = ['idle', 'idleB', 'walkA', 'walkB']
    for (const dir of dirs) for (const frame of frames) {
      const key = `agent-${a.id}-${dir}-${frame}`; if (this.textures.exists(key)) continue
      const { rows, colors } = spritePixels(a.role, dir, frame, index)
      const g = this.add.graphics()
      rows.forEach((row, r) => { [...row].forEach((ch, c) => { if (ch === '.') return; g.fillStyle(hexNum(colors[ch] ?? '#111827'), 1); g.fillRect(c * 2, r * 2, 2, 2) }) })
      g.generateTexture(key, 48, 64); g.destroy() // 24x32 grid at 2px/cell
    }
  }

  // Fit the whole 22x16 district in the viewport at load, instead of a
  // fixed 0.85x that crops the town on narrow viewports.
  fitView() {
    const z = Math.min(this.scale.width / 1180, this.scale.height / 700)
    this.cameras.main.setZoom(Math.max(0.4, Math.min(0.9, z)))
    this.cameras.main.centerOn(576, 384)
  }
  create() {
    sceneRef = this
    buildAllTextures(this) // throws if any manifest texture is missing
    this.fitView()
    // Ground: one pixel-textured diamond sprite per tile, below everything.
    // Render order: terrain -> road surfaces/markings (tile texture) ->
    // sidewalks/curbs (ground tiles, adjacent tiles only, never overlapping
    // a road tile) -> props -> buildings/vehicles/characters (depth by sy).
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const { sx, sy } = iso(x, y)
      const isPark = LOCATIONS.find(l => l.id === 'park')!.tiles.some(t => t.x === x && t.y === y)
      // Paved path through the park centre (x=10 column), not just grass.
      const kind = roadAt(x, y) ? (CROSSWALKS.has(`${x},${y}`) ? 'crosswalk' : roadKind(x, y)) : isPark && x === 10 ? 'paving' : isPark ? 'park' : sidewalkAt(x, y) ? 'sidewalk' : 'paving'
      // V5 tile variants: deterministic per-tile variant so grass/paving/
      // park/sidewalk are not one repeated texture across the whole map.
      // Roads keep a single texture so centrelines stay continuous.
      const variantKinds = ['grass', 'paving', 'park', 'sidewalk']
      const v = (x * 7 + y * 13) % 4
      const tileKey = variantKinds.includes(kind) && v !== 0 ? `tile-${kind}-v${v}` : `tile-${kind}`
      const im = this.add.image(sx, sy, tileKey).setOrigin(0.5, 0.5).setDepth(sy)
      im.texture.setFilter(Phaser.Textures.FilterMode.NEAREST)
    }
    // Subtle manhole covers on road tiles only, at ground depth (+0.05),
    // so they never float above buildings or cover a doorway.
    for (const [mx, my] of [[12, 7], [10, 11], [14, 5]] as const) {
      const p = iso(mx, my)
      const mh = this.add.ellipse(p.sx, p.sy, 12, 6, 0x27272a, 0.8).setDepth(p.sy + 0.05)
      mh.setStrokeStyle(1, 0x52525b)
    }
    // Buildings, each on its real map location; entrances stay walkable.
    for (const loc of LOCATIONS) {
      const xs = loc.tiles.map(t => t.x), ys = loc.tiles.map(t => t.y)
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
      const { sx, sy } = iso(cx, cy)
      if (loc.id === 'residential') {
        // Generated house (one flipped for variety) + procedural apartment.
        const h1 = iso(3.5, 11); this.shadow(h1.sx, h1.sy + 2, h1.sy + 0.1, 2.2); this.buildingImg('house', h1.sx, h1.sy + 8, h1.sy + 1, 135, 'building-house')
        const h2 = iso(5, 12); this.shadow(h2.sx, h2.sy + 2, h2.sy + 0.1, 2.2)
        if (this.textures.exists('v3-building-house')) { const s = 135 / (this.textures.get('v3-building-house').source[0].width || 240); this.img('v3-building-house', h2.sx, h2.sy + 8, h2.sy + 1, -s, s) }
        else this.img('building-house', h2.sx, h2.sy + 8, h2.sy + 1)
        const h3 = iso(4, 11.5); this.shadow(h3.sx, h3.sy + 2, h3.sy + 0.1, 2.2); this.img('building-apartment', h3.sx, h3.sy + 8, h3.sy + 1)
      } else if (loc.id === 'park') {
        const f = iso(9.5, 8.5); this.img('prop-fountain', f.sx, f.sy + 4, f.sy + 0.5)
        for (const [tx, ty, kind] of [[8, 8, 'oak'], [11, 8, 'pine'], [8, 9, 'blossom'], [11, 9, 'maple']] as const) { const p = iso(tx, ty); this.shadow(p.sx, p.sy + 2, p.sy + 0.1); this.img(`tree-${kind}`, p.sx, p.sy, p.sy + 0.5) }
        for (const [bx, by] of [[9, 8], [10, 9]] as const) { const p = iso(bx, by); this.img('prop-bench', p.sx, p.sy + 6, p.sy + 0.5) }
        for (const [fx, fy] of [[9, 9], [10, 8]] as const) { const p = iso(fx, fy); this.img('prop-flowerbed', p.sx, p.sy + 4, p.sy + 0.5) }
        // Gathering spaces flanking the fountain, off-grid decoration only.
        for (const [fx, fy] of [[8.5, 8.5], [10.5, 8.5]] as const) { const p = iso(fx, fy); this.img('prop-flowerbed', p.sx, p.sy + 4, p.sy + 0.5) }
        const w = iso(8.5, 9.5); this.shadow(w.sx, w.sy + 2, w.sy + 0.1); this.img('tree-willow', w.sx, w.sy, w.sy + 0.5)
      } else if (loc.id === 'bus') {
        // Shelter at prop depth, not building depth: waiting agents stand
        // at the stop and must not be hidden behind its glass panel.
        this.shadow(sx, sy + 2, sy + 0.1, 1.8); this.img('prop-bus-shelter', sx, sy + 6, sy + 0.5); this.img('prop-sign', sx + 28, sy, sy + 0.5)
      } else {
        // Generated art is 240px wide; keep it narrower than the old 144px
        // procedural buildings would suggest, because adjacent footprints
        // are only ~2 tiles (~128px iso) apart and wider art overlaps neighbours.
        const targetW = loc.id === 'office' ? 120 : loc.id === 'townhall' ? 160 : loc.id === 'shop' ? 145 : 150
        this.shadow(sx, sy + 2, sy + 0.1, 2.6); this.buildingImg(loc.id, sx, sy + 8, sy + 1, targetW, `building-${loc.id}`)
        if (loc.id === 'townhall') this.img('prop-sign', sx + 40, sy, sy + 0.5)
        if (loc.id === 'cafe' || loc.id === 'restaurant') { const e = iso(loc.entrance.x, loc.entrance.y); this.img('prop-cafe-table', e.sx + 24, e.sy, e.sy + 0.5); this.img('prop-cafe-table', e.sx - 22, e.sy + 12, e.sy + 0.5) }
        if (loc.id === 'shop') this.img('prop-sign', sx + 36, sy, sy + 0.5)
      }
      const label = this.add.text(sx, sy - 130, loc.name, { fontSize: '11px', color: '#f8fafc', backgroundColor: '#111827' }).setOrigin(0.5)
      label.setDepth(sy + 3); label.setVisible(false); this.buildingLabels.push(label)
    }
    // Decorative apartment blocks on map corners (shortest paths between
    // entrances never detour there, so agents do not walk through them).
    for (const [ax, ay] of [[1, 1], [20, 14]] as const) { const p = iso(ax, ay); this.shadow(p.sx, p.sy + 2, p.sy + 0.1, 2.4); this.img('building-apartment', p.sx, p.sy + 8, p.sy + 1) }
    // Street furniture, trees, and parked vehicles with directional orientation.
    // Lamps and parked cars sit on sidewalk tiles beside roads, never in
    // the carriageway itself (V3 put both on road tiles, blocking the
    // visual lane and letting agents appear to walk through parked cars).
    for (const [lx, ly] of [[0, 6], [21, 8], [9, 0], [11, 15], [5, 6], [15, 6]] as const) { const p = iso(lx, ly); this.img('prop-lamp', p.sx, p.sy, p.sy + 0.5) }
    for (const [cx2, cy2, kind, flip] of [[2, 6, 'car-red', 1], [18, 6, 'car-blue', -1], [11, 3, 'van', 1], [11, 12, 'car-yellow', -1]] as const) { const p = iso(cx2, cy2); this.shadow(p.sx, p.sy + 4, p.sy + 0.1, 1.6); this.img(`vehicle-${kind}`, p.sx, p.sy + 6, p.sy + 0.5, flip) }
    for (const [tx, ty, kind] of [[1, 6, 'pine'], [20, 8, 'oak'], [12, 12, 'blossom'], [19, 12, 'willow'], [1, 5, 'maple'], [19, 10, 'birch']] as const) { const p = iso(tx, ty); this.shadow(p.sx, p.sy + 2, p.sy + 0.1); this.img(`tree-${kind}`, p.sx, p.sy, p.sy + 0.5) }
    // V5 street-level props on sidewalk/ground tiles (never roads or doorways):
    // bins beside the cafe and office roads, planters by the shop and townhall.
    for (const [bx, by] of [[7, 6], [14, 6]] as const) { const p = iso(bx, by); this.img('prop-bin', p.sx, p.sy, p.sy + 0.5) }
    for (const [px, py] of [[2, 8], [17, 12]] as const) { const p = iso(px, py); this.img('prop-planter', p.sx, p.sy, p.sy + 0.5) }
    for (const a of engine.agents) this.ensureAgent(a.id)
    this.pathG = this.add.graphics()
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
    const shadow = this.shadow(0, 0, 0, 0.8)
    const ring = this.add.image(0, 0, 'shadow').setOrigin(0.5, 1).setDepth(0).setScale(1.4, 1.4); ring.setTint(0xfacc15); ring.setAlpha(0.6); ring.setVisible(false)
    const sprite = this.add.sprite(0, 0, `agent-${a.id}-down-idle`).setOrigin(0.5, 1).setScale(1.15)
    sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST)
    sprite.setInteractive(); sprite.on('pointerdown', () => useUI.getState().select(a.id))
    const label = this.add.text(0, -28, a.name, { fontSize: '10px', color: '#fff', backgroundColor: '#111827' }).setOrigin(0.5)
    this.agentObjs.set(id, { sprite, shadow, ring, label, prevX: a.pos.x, prevY: a.pos.y, facing: 'down', frame: 'idle', timer: 0 })
  }
  follow(id: string) { this.followId = id }
  focusTile(x: number, y: number) { const { sx, sy } = iso(x, y); this.cameras.main.centerOn(sx, sy); this.followId = null }
  resetView() { this.fitView(); this.followId = null }
  update(_time: number, delta: number) {
    const ui = useUI.getState()
    engine.paused = ui.paused; engine.speed = ui.speed
    this.buildingLabels.forEach(l => l.setVisible(ui.showLocationLabels))
    // Clamp the frame delta: Phaser's delta is wall time since the last
    // frame, so returning to a hidden tab (or a long pause) would otherwise
    // advance the whole absence in a single step — the clock jumping hours,
    // activities completing en masse and energy/hunger draining, while
    // movement advances only one tile per frame. At 100ms the sim
    // effectively pauses while the tab is hidden; normal frames (~16ms)
    // are unaffected.
    if (!ui.paused) engine.step((Math.min(delta, 100) / 1000) * ui.speed, this.acc)
    for (const a of engine.agents) {
      this.ensureAgent(a.id)
      const o = this.agentObjs.get(a.id)!; const { sx, sy } = iso(a.pos.x, a.pos.y)
      const dx = a.pos.x - o.prevX, dy = a.pos.y - o.prevY, moving = Math.abs(dx) + Math.abs(dy) > 0.001
      const conversing = a.state === 'Conversing'
      if (moving) {
        o.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
        o.timer += delta; if (o.timer > 160) { o.timer = 0; o.frame = o.frame === 'walkA' ? 'walkB' : 'walkA' }
      } else if (conversing) {
        // Interaction animation: small bounce, only during a real conversation.
        o.timer += delta; if (o.timer > 300) { o.timer = 0; o.frame = o.frame === 'idle' ? 'walkA' : 'idle' }
      } else {
        // V5 idle animation: blink — idle -> idleB (eyes closed, arms
        // raised 1px) briefly, roughly once a second, not a frozen sprite.
        if (o.frame === 'walkA' || o.frame === 'walkB') { o.frame = 'idle'; o.timer = 0 }
        o.timer += delta
        if (o.frame === 'idle' && o.timer > 900) { o.frame = 'idleB'; o.timer = 0 }
        else if (o.frame === 'idleB' && o.timer > 180) { o.frame = 'idle'; o.timer = 0 }
      }
      o.prevX = a.pos.x; o.prevY = a.pos.y
      o.sprite.setTexture(`agent-${a.id}-${o.facing}-${o.frame}`)
      const bounce = conversing && o.frame === 'walkA' ? -2 : 0
      o.sprite.setPosition(sx, sy + bounce); o.sprite.setDepth(sy + 2)
      o.shadow.setPosition(sx, sy); o.shadow.setDepth(sy + 0.1)
      o.ring.setPosition(sx, sy); o.ring.setDepth(sy + 0.15); o.ring.setVisible(ui.selectedId === a.id)
      o.label.setPosition(sx, sy - 86); o.label.setDepth(sy + 3)
      o.label.setText(ui.showThoughts ? `${a.name}\n${a.state}` : a.name)
      if (ui.showPaths && ui.selectedId === a.id && a.path.length && this.pathG) {
        this.pathG.clear(); this.pathG.lineStyle(2, 0xfacc15, 0.9); this.pathG.setDepth(sy + 0.4); this.pathG.beginPath(); this.pathG.moveTo(sx, sy)
        for (const p of a.path) { const pp = iso(p.x, p.y); this.pathG.lineTo(pp.sx, pp.sy) } this.pathG.strokePath()
      } else if (this.pathG && ui.selectedId === a.id) { this.pathG.clear() }
    }
    if (this.followId) { const a = engine.agents.find(x => x.id === this.followId); if (a) { const { sx, sy } = iso(a.pos.x, a.pos.y); this.cameras.main.centerOn(sx, sy) } }
    if (_time - this.lastSync > 500) { this.lastSync = _time; ui.sync() }
  }
}
