// Original procedural pixel-art texture pipeline.
// Every visible asset is a designed pixel texture with a transparent
// background, generated once at scene creation — never a coloured polygon,
// circle, or floating text label in the production renderer.
// Pixel scale: 1 pixel cell = 2 screen px. All textures are drawn with
// nearest-neighbour sampling (Phaser textures are pixel-exact by default
// when generated from Graphics at integer coordinates).
import type Phaser from 'phaser'
import { mulberry32 } from '../simulation/rng'
import { BUILDING_STYLES, type BuildingStyle } from './sprites'

export interface AssetEntry { key: string; category: 'tile' | 'building' | 'tree' | 'vehicle' | 'prop' | 'character' | 'shadow'; w: number; h: number; transparent: true }
const TILE_KINDS = ['grass', 'paving', 'asphalt-h', 'asphalt-v', 'crosswalk', 'park'] as const
const TREE_KINDS = ['oak', 'pine', 'blossom'] as const
const VEHICLE_KINDS = ['car-red', 'car-blue', 'van'] as const
const PROP_KINDS = ['bench', 'lamp', 'sign', 'fountain', 'flowerbed', 'cafe-table', 'bus-shelter'] as const
const BUILDING_IDS = ['cafe', 'restaurant', 'shop', 'townhall', 'office', 'apartment', 'house', 'bus'] as const
export const ASSET_MANIFEST: AssetEntry[] = [
  ...TILE_KINDS.map(k => ({ key: `tile-${k}`, category: 'tile' as const, w: 64, h: 32, transparent: true as const })),
  ...BUILDING_IDS.map(id => ({ key: `building-${id}`, category: 'building' as const, w: 144, h: id === 'office' ? 208 : id === 'apartment' ? 164 : id === 'house' ? 92 : 128, transparent: true as const })),
  ...TREE_KINDS.map(k => ({ key: `tree-${k}`, category: 'tree' as const, w: 48, h: 64, transparent: true as const })),
  ...VEHICLE_KINDS.map(k => ({ key: `vehicle-${k}`, category: 'vehicle' as const, w: 56, h: 28, transparent: true as const })),
  ...PROP_KINDS.map(k => ({ key: `prop-${k}`, category: 'prop' as const, w: k === 'bus-shelter' ? 72 : k === 'fountain' ? 64 : 56, h: k === 'bus-shelter' ? 56 : k === 'fountain' ? 40 : 56, transparent: true as const })),
  { key: 'character', category: 'character', w: 40, h: 56, transparent: true },
  { key: 'shadow', category: 'shadow', w: 32, h: 12, transparent: true },
]
export function manifestKeys(): string[] { return ASSET_MANIFEST.map(a => a.key) }

const hexNum = (h: string) => parseInt(h.replace('#', ''), 16)
const shade = (hex: string, f: number) => {
  const n = hexNum(hex); const r = Math.min(255, ((n >> 16) & 255) * f), g = Math.min(255, ((n >> 8) & 255) * f), b = Math.min(255, (n & 255) * f)
  return (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)
}
// Draw a pixel texture: painter calls set(x, y, hex) for opaque cells only.
function pixelTexture(scene: Phaser.Scene, key: string, cols: number, rows: number, painter: (set: (x: number, y: number, hex: string) => void) => void) {
  if (scene.textures.exists(key)) return
  const g = scene.add.graphics()
  painter((x, y, hex) => { if (x < 0 || y < 0 || x >= cols || y >= rows) return; g.fillStyle(hexNum(hex), 1); g.fillRect(x * 2, y * 2, 2, 2) })
  g.generateTexture(key, cols * 2, rows * 2); g.destroy()
}
const rect = (set: (x: number, y: number, h: string) => void, x0: number, y0: number, x1: number, y1: number, hex: string) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, hex)
}
// --- Ground tiles: 32x16 diamond, per-pixel texture, no flat colour ---
function tileTexture(scene: Phaser.Scene, kind: typeof TILE_KINDS[number]) {
  const key = `tile-${kind}`; if (scene.textures.exists(key)) return
  const rng = mulberry32(kind.length * 7919 + 13)
  pixelTexture(scene, key, 32, 16, set => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      const d = Math.abs(x - 15.5) / 16 + Math.abs(y - 7.5) / 8
      if (d > 1) continue
      let c = '#c9bfa5'
      if (kind === 'grass' || kind === 'park') c = rng() < 0.5 ? '#4ade80' : '#22c55e'
      if (kind === 'paving') c = rng() < 0.5 ? '#d6c9b0' : '#cfc2a6'
      if (kind === 'asphalt-h' || kind === 'asphalt-v' || kind === 'crosswalk') c = rng() < 0.5 ? '#3f3f46' : '#38383f'
      if (kind === 'park' && rng() < 0.06) c = '#f472b6' // flower speckle
      if (kind === 'paving' && rng() < 0.03) c = '#b8ab8d' // faint speckle, no grid lines
      set(x, y, c)
    }
    // Outline + markings, drawn on top of the texture.
    if (kind === 'asphalt-h') rect(set, 10, 7, 21, 8, '#facc15')
    if (kind === 'asphalt-v') rect(set, 15, 2, 16, 13, '#facc15')
    if (kind === 'crosswalk') { for (let x = 6; x <= 26; x += 5) rect(set, x, 2, x + 2, 13, '#f8fafc') }
    if (kind === 'grass' || kind === 'park') { set(8, 5, '#16a34a'); set(22, 10, '#16a34a') }
  })
}
// --- Buildings: iso prism in pixels — diamond roof, two shaded faces,
// brick pattern, window grid with lit/unlit panes, door, awning, sign,
// balconies, columns, rooftop equipment. One painter per building kind. ---
function buildingTexture(scene: Phaser.Scene, id: typeof BUILDING_IDS[number]) {
  const key = `building-${id}`; if (scene.textures.exists(key)) return
  const style: BuildingStyle = id === 'apartment' ? { kind: 'apartment', wall: '#fde68a', roof: '#92400e', trim: '#78350f', stories: 3, awning: null }
    : id === 'house' ? { kind: 'house', wall: '#fecdd3', roof: '#9a3412', trim: '#7f1d1d', stories: 1, awning: null }
    : BUILDING_STYLES[id === 'bus' ? 'bus' : id]
  const W = 72, roofH = 16, faceH = id === 'office' ? 88 : id === 'apartment' ? 66 : id === 'house' ? 30 : 48, H = roofH + faceH
  const rng = mulberry32(id.length * 104729 + 7)
  pixelTexture(scene, key, W, H, set => {
    const cx = W / 2
    // Roof diamond: shaded tiles, ridge line, rooftop equipment.
    for (let y = 0; y < roofH; y++) for (let x = 0; x < W; x++) {
      const half = y < roofH / 2 ? 2 + y * 4 : 2 + (roofH - y) * 4
      if (Math.abs(x - cx) <= half) {
        const n = x < cx ? shade(style.roof, 0.8) : hexNum(style.roof)
        set(x, y, `#${n.toString(16).padStart(6, '0')}`)
      }
    }
    if (id === 'office' || id === 'apartment') { rect(set, cx - 8, 3, cx - 2, 7, '#9ca3af'); rect(set, cx + 3, 2, cx + 8, 6, '#6b7280'); set(cx - 1, 1, '#e5e7eb') }
    if (id === 'house') { rect(set, cx + 14, 0, cx + 17, 6, '#78350f'); rect(set, cx + 14, 0, cx + 17, 1, '#1f2937') } // chimney
    // Two iso faces: each face is a parallelogram whose bottom edge slants
    // parallel to its top edge. A flat bottom here is what made V1/V2
    // buildings read as rectangular fronts instead of isometric prisms.
    const topEdgeAt = (x: number) => x < cx ? roofH / 2 + (x / cx) * (roofH / 2) : roofH - ((x - cx) / (W - cx)) * (roofH / 2)
    for (let x = 0; x < W; x++) {
      const left = x < cx, topEdge = topEdgeAt(x)
      for (let y = Math.floor(topEdge); y < Math.floor(topEdge) + faceH; y++) {
        let c = left ? shade(style.wall, 0.86) : shade(style.wall, 0.62)
        if ((y - Math.floor(topEdge)) % 4 === 3) c = shade(style.wall, left ? 0.74 : 0.54)
        set(x, y, `#${c.toString(16).padStart(6, '0')}`)
      }
    }
    // Windows: grid on both faces, frame + pane + mullion, some lit warm.
    const winCols = [8, 20, 32, 44, 56]
    for (const wx of winCols) for (let floor = 0; floor < Math.max(1, Math.floor(faceH / 16)); floor++) {
      const wy = Math.floor(topEdgeAt(wx)) + 6 + floor * 16
      if (wy + 8 >= Math.floor(topEdgeAt(wx)) + faceH) continue
      const lit = rng() < 0.45
      rect(set, wx, wy, wx + 5, wy + 7, '#1f2937')
      rect(set, wx + 1, wy + 1, wx + 4, wy + 6, lit ? '#fde68a' : '#bfdbfe')
      set(wx + 2, wy + 3, '#1f2937'); set(wx + 3, wy + 3, '#1f2937')
    }
    // Door at the foot of the left face + steps.
    rect(set, Math.floor(cx) - 8, roofH + faceH - 12, Math.floor(cx) - 3, roofH + faceH - 1, '#1f2937')
    set(Math.floor(cx) - 5, roofH + faceH - 7, '#facc15')
    rect(set, Math.floor(cx) - 10, roofH + faceH - 1, Math.floor(cx) - 1, roofH + faceH - 1, '#e7e5e4')
    // Awning: striped band across the front, with scallops.
    if (style.awning) for (let x = 6; x < W - 6; x++) { const ay = Math.floor(topEdgeAt(x)) + faceH - 18; set(x, ay, x % 2 ? style.awning : '#f8fafc'); set(x, ay + 1, x % 2 ? style.awning : '#f8fafc') }
    // Sign board (shape only, no text — text lives in the optional overlay).
    if (id === 'cafe' || id === 'shop' || id === 'restaurant') rect(set, Math.floor(cx) - 14, roofH + 2, Math.floor(cx) + 14, roofH + 7, id === 'cafe' ? '#dc2626' : id === 'shop' ? '#0e7490' : '#ea580c')
    // Balconies on multi-storey buildings.
    if (faceH >= 48) for (let floor = 1; floor < Math.floor(faceH / 16); floor++) {
      for (let x = 4; x < W - 4; x += 2) set(x, Math.floor(topEdgeAt(x)) + floor * 16 - 2, '#1f2937')
    }
    // Town Hall columns over the front face.
    if (id === 'townhall') for (let i = 0; i < 4; i++) { const cx0 = 10 + i * 14; rect(set, cx0, Math.floor(topEdgeAt(cx0)) + 10, cx0 + 2, Math.floor(topEdgeAt(cx0)) + faceH - 14, '#f8fafc') }
    // Shop storefront glass.
    if (id === 'shop') { for (let x = 8; x < W - 8; x++) for (let y = 0; y < 12; y++) set(x, Math.floor(topEdgeAt(x)) + faceH - 16 + y, y % 3 === 0 ? '#e0f2fe' : '#bfdbfe') }
  })
}
function treeTexture(scene: Phaser.Scene, kind: typeof TREE_KINDS[number]) {
  const key = `tree-${kind}`; if (scene.textures.exists(key)) return
  const rng = mulberry32(kind.length * 31337 + 3)
  pixelTexture(scene, key, 24, 32, set => {
    rect(set, 11, 24, 13, 31, '#78350f')
    if (kind === 'pine') {
      for (let tier = 0; tier < 3; tier++) { const y0 = 4 + tier * 7, w = 10 - tier * 2; for (let y = y0; y < y0 + 7; y++) for (let x = 12 - (y - y0) - 1; x <= 12 + (y - y0); x++) if (x >= 12 - w && x <= 12 + w) set(x, y, rng() < 0.8 ? '#15803d' : '#166534') }
    } else {
      // Irregular canopy: three overlapping clusters + noise, dark outline
      // where a canopy pixel borders empty space — no perfect circle.
      const clusters = [[12, 11, 8], [7, 15, 6], [17, 15, 6]]
      const canopy = new Set<string>()
      for (let y = 2; y < 24; y++) for (let x = 2; x < 22; x++) {
        const inCluster = clusters.some(([cx2, cy2, r]) => (x - cx2) * (x - cx2) + (y - cy2) * (y - cy2) <= r * r + (rng() * 4 - 2))
        if (inCluster) canopy.add(`${x},${y}`)
      }
      for (const key of canopy) {
        const [x, y] = key.split(',').map(Number)
        const edge = !canopy.has(`${x + 1},${y}`) || !canopy.has(`${x - 1},${y}`) || !canopy.has(`${x},${y + 1}`) || !canopy.has(`${x},${y - 1}`)
        const base = kind === 'blossom' ? '#f9a8d4' : '#22c55e'
        set(x, y, edge ? (kind === 'blossom' ? '#db2777' : '#15803d') : rng() < 0.25 ? (kind === 'blossom' ? '#f472b6' : '#16a34a') : rng() < 0.1 ? (kind === 'blossom' ? '#fbcfe8' : '#4ade80') : base)
      }
    }
  })
}
function vehicleTexture(scene: Phaser.Scene, kind: typeof VEHICLE_KINDS[number]) {
  const key = `vehicle-${kind}`; if (scene.textures.exists(key)) return
  const body = kind === 'car-red' ? '#dc2626' : kind === 'car-blue' ? '#2563eb' : '#eab308'
  pixelTexture(scene, key, 28, 14, set => {
    rect(set, 1, 5, 26, 11, body); rect(set, 0, 7, 27, 9, body)
    if (kind === 'van') rect(set, 12, 1, 26, 11, body)
    else { rect(set, 6, 2, 11, 5, '#bfdbfe'); rect(set, 14, 2, 19, 5, '#bfdbfe') }
    rect(set, 2, 5, 25, 6, '#f8fafc') // highlight line
    rect(set, 5, 10, 8, 12, '#111827'); rect(set, 19, 10, 22, 12, '#111827') // wheels
    set(5, 11, '#9ca3af'); set(19, 11, '#9ca3af')
    set(27, 7, '#facc15'); set(0, 7, '#ef4444') // headlight / taillight
  })
}
function propTexture(scene: Phaser.Scene, kind: typeof PROP_KINDS[number]) {
  const key = `prop-${kind}`; if (scene.textures.exists(key)) return
  pixelTexture(scene, key, key === 'prop-bus-shelter' ? 36 : key === 'prop-fountain' ? 32 : 28, key === 'prop-bus-shelter' ? 28 : key === 'prop-fountain' ? 20 : 28, set => {
    if (kind === 'bench') { rect(set, 2, 8, 25, 10, '#92400e'); rect(set, 2, 4, 25, 6, '#92400e'); rect(set, 4, 11, 5, 13, '#78350f'); rect(set, 22, 11, 23, 13, '#78350f') }
    if (kind === 'lamp') { rect(set, 13, 4, 14, 27, '#374151'); rect(set, 14, 4, 20, 5, '#374151'); rect(set, 19, 2, 22, 5, '#facc15'); set(20, 6, '#fef08a'); set(21, 6, '#fef08a') }
    if (kind === 'sign') { rect(set, 13, 8, 14, 27, '#374151'); rect(set, 7, 1, 20, 8, '#1d4ed8'); rect(set, 11, 3, 16, 6, '#f8fafc') }
    if (kind === 'fountain') { for (let x = 2; x < 30; x++) { set(x, 14, '#9ca3af'); set(x, 15, '#9ca3af') } rect(set, 5, 10, 26, 13, '#38bdf8'); rect(set, 14, 4, 17, 10, '#e7e5e4'); set(15, 2, '#38bdf8'); set(16, 2, '#38bdf8'); set(15, 3, '#7dd3fc') }
    if (kind === 'flowerbed') { rect(set, 1, 8, 26, 12, '#78350f'); const cols = ['#f472b6', '#facc15', '#ef4444', '#f8fafc']; for (let i = 0; i < 10; i++) { set(3 + i * 2, 6, cols[i % 4]); set(3 + i * 2, 7, '#22c55e') } }
    if (kind === 'cafe-table') { rect(set, 8, 6, 19, 9, '#f8fafc'); rect(set, 13, 10, 14, 13, '#92400e'); rect(set, 2, 8, 5, 11, '#92400e'); rect(set, 22, 8, 25, 11, '#92400e') }
    if (kind === 'bus-shelter') { rect(set, 3, 4, 5, 27, '#374151'); rect(set, 30, 4, 32, 27, '#374151'); rect(set, 1, 1, 34, 4, '#1c1917'); rect(set, 1, 1, 34, 1, '#e7e5e4'); rect(set, 6, 6, 29, 17, '#bfdbfe'); rect(set, 8, 18, 27, 20, '#92400e'); rect(set, 28, 22, 34, 27, '#1d4ed8') }
  })
}
// Centralized loader: builds every manifest texture once, validates it.
export function buildAllTextures(scene: Phaser.Scene): string[] {
  for (const k of TILE_KINDS) tileTexture(scene, k)
  for (const id of BUILDING_IDS) buildingTexture(scene, id)
  for (const k of TREE_KINDS) treeTexture(scene, k)
  for (const k of VEHICLE_KINDS) vehicleTexture(scene, k)
  for (const k of PROP_KINDS) propTexture(scene, k)
  if (!scene.textures.exists('shadow')) {
    const g = scene.add.graphics(); g.fillStyle(0x000000, 0.28); g.fillEllipse(16, 6, 32, 12); g.generateTexture('shadow', 32, 12); g.destroy()
  }
  const missing = manifestKeys().filter(k => k !== 'character' && !scene.textures.exists(k))
  if (missing.length) throw new Error(`Missing pixel-art textures: ${missing.join(', ')}`)
  return manifestKeys()
}
