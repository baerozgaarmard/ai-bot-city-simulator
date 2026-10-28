// Pure, testable pixel-art specs. No Phaser import here, so Vitest can
// verify every role sprite and every building style without a canvas.
// A character is a 24x32 pixel grid; each cell is a palette key:
// '.' transparent, 'H' hair, 'S' skin, 'E' eye, 'O' mouth, 'T' top,
// 'D' darker top (shading, right side), 'L' lighter top (highlight, left),
// 'C' collar, 'B' belt, 'K' dark outline, 'P' pants/skirt, 'F' shoes,
// 'A' accessory (hat / cap / apron / coat stripe).
// 7 hair styles x accessory combinations give the base silhouettes;
// role colour, skin tone and accessory then vary them to 24+ agents.
// The same grid renders in Phaser (city sprites) and in React (registry/
// inspector thumbnails via AgentAvatar), so identity is stable everywhere.
// V5: collars, belts, torso shading/highlight, ears, eyebrows, noses in
// profile, skirt variant, ponytail + curly hair, and an idleB blink frame
// (eyes closed, arms raised 1px) for a subtle idle animation. Directions
// are genuine: down = front face, up = back of head (no face), left/right
// = profiles with a nose on the facing side and hair on the back side.
// Left/right bodies are NOT a flip of the front view.
export type Dir = 'down' | 'up' | 'left' | 'right'
export type Frame = 'idle' | 'idleB' | 'walkA' | 'walkB'
export interface RolePalette { top: string; pants: string; accessory: string; accessoryKind: 'hat' | 'cap' | 'apron' | 'coat' | 'none' }
export const ROLE_PALETTES: Record<string, RolePalette> = {
  'Software Developer': { top: '#3b82f6', pants: '#1e293b', accessory: '#3b82f6', accessoryKind: 'none' },
  Chef: { top: '#f8fafc', pants: '#1f2937', accessory: '#f8fafc', accessoryKind: 'hat' },
  Student: { top: '#f59e0b', pants: '#334155', accessory: '#f59e0b', accessoryKind: 'none' },
  Artist: { top: '#c026d3', pants: '#3f3f46', accessory: '#c026d3', accessoryKind: 'none' },
  Shopkeeper: { top: '#14b8a6', pants: '#134e4a', accessory: '#14b8a6', accessoryKind: 'apron' },
  'Office Worker': { top: '#475569', pants: '#0f172a', accessory: '#475569', accessoryKind: 'none' },
  'Retired Resident': { top: '#94a3b8', pants: '#57534e', accessory: '#94a3b8', accessoryKind: 'none' },
  Doctor: { top: '#e0f2fe', pants: '#1e3a5f', accessory: '#ffffff', accessoryKind: 'coat' },
  'Bus Driver': { top: '#1e40af', pants: '#111827', accessory: '#1e40af', accessoryKind: 'cap' },
  Teacher: { top: '#dc2626', pants: '#1f2937', accessory: '#dc2626', accessoryKind: 'none' },
  Designer: { top: '#ec4899', pants: '#27272a', accessory: '#ec4899', accessoryKind: 'none' },
  'Security Guard': { top: '#1f2937', pants: '#111827', accessory: '#facc15', accessoryKind: 'cap' },
  Barista: { top: '#78350f', pants: '#292524', accessory: '#065f46', accessoryKind: 'apron' },
  Engineer: { top: '#f97316', pants: '#1c1917', accessory: '#f97316', accessoryKind: 'cap' },
  Nurse: { top: '#38bdf8', pants: '#164e63', accessory: '#ffffff', accessoryKind: 'coat' },
  Baker: { top: '#fef3c7', pants: '#44403c', accessory: '#b45309', accessoryKind: 'apron' },
  Writer: { top: '#0f766e', pants: '#134e4a', accessory: '#0f766e', accessoryKind: 'none' },
  Florist: { top: '#22c55e', pants: '#365314', accessory: '#22c55e', accessoryKind: 'apron' },
  Courier: { top: '#eab308', pants: '#27272a', accessory: '#eab308', accessoryKind: 'cap' },
  Musician: { top: '#7c3aed', pants: '#18181b', accessory: '#7c3aed', accessoryKind: 'none' },
  Accountant: { top: '#334155', pants: '#0f172a', accessory: '#334155', accessoryKind: 'none' },
  Mechanic: { top: '#44403c', pants: '#1c1917', accessory: '#44403c', accessoryKind: 'none' },
  Librarian: { top: '#6d28d9', pants: '#1e1b4b', accessory: '#6d28d9', accessoryKind: 'none' },
}
export const SKIN_TONES = ['#ffdbac', '#f0c8a0', '#c68642', '#8d5524']
export const HAIR_COLORS = ['#111827', '#78350f', '#d97706', '#b91c1c', '#9ca3af']
export const HAIR_STYLES = ['short', 'bob', 'bun', 'bald', 'long', 'ponytail', 'curly'] as const
export function paletteFor(role: string): RolePalette {
  if (ROLE_PALETTES[role]) return ROLE_PALETTES[role]
  const keys = Object.keys(ROLE_PALETTES); let h = 0; for (const c of role) h = (h * 31 + c.charCodeAt(0)) % keys.length
  return ROLE_PALETTES[keys[h]]
}
const shadeHex = (hex: string, f: number) => {
  const n = parseInt(hex.replace('#', ''), 16)
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)))
  return `#${((ch((n >> 16) & 255) << 16) + (ch((n >> 8) & 255) << 8) + ch(n & 255)).toString(16).padStart(6, '0')}`
}
export function paletteColors(p: RolePalette, skin: string, hair: string): Record<string, string> {
  return { H: hair, S: skin, E: '#111827', O: '#7c2d12', T: p.top, D: shadeHex(p.top, 0.72), L: shadeHex(p.top, 1.22), C: '#f8fafc', B: '#292524', K: '#1f2937', P: p.pants, F: '#1f2937', A: p.accessory }
}
// 24 wide x 32 tall, chibi proportions so the face reads at city zoom.
// Rows 0-4 hair, 5-12 head/face, 13-21 torso+arms, 22-31 legs+shoes.
export function charPixels(dir: Dir, frame: Frame, hairStyle: string = 'short', skirt = false): string[] {
  const g: string[][] = Array.from({ length: 32 }, () => Array(24).fill('.'))
  const fill = (r0: number, r1: number, c0: number, c1: number, ch: string) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = ch }
  // Hair styles (back of head in 'up' view is all hair).
  if (hairStyle === 'bald') fill(0, 1, 8, 15, 'H')
  else if (hairStyle === 'bob') { fill(0, 4, 7, 16, 'H'); fill(5, 11, 6, 6, 'H'); fill(5, 11, 17, 17, 'H') }
  else if (hairStyle === 'bun') { fill(0, 4, 8, 15, 'H'); fill(0, 2, 11, 13, 'H') }
  else if (hairStyle === 'long') { fill(0, 4, 7, 16, 'H'); fill(5, 14, 6, 7, 'H'); fill(5, 14, 16, 17, 'H') }
  else if (hairStyle === 'ponytail') { fill(0, 4, 8, 15, 'H'); fill(5, 14, 16, 17, 'H') }
  else if (hairStyle === 'curly') { fill(0, 3, 6, 17, 'H'); fill(4, 4, 6, 6, 'H'); fill(4, 4, 17, 17, 'H') }
  else { fill(0, 3, 8, 15, 'H'); fill(4, 4, 8, 10, 'H'); fill(4, 4, 13, 15, 'H') } // short, with fringe
  fill(5, 12, 8, 15, 'S')
  // Ears (front + profile views only).
  if (dir !== 'up') { g[9][7] = 'S'; g[9][16] = 'S' }
  if (dir === 'up') {
    fill(5, 12, 8, 15, 'H')
    if (hairStyle === 'ponytail') fill(5, 14, 16, 17, 'H')
    if (hairStyle === 'long') { fill(5, 14, 6, 7, 'H'); fill(5, 14, 16, 17, 'H') }
  } else if (dir === 'down') {
    // Front face: eyebrows, two eyes, smile.
    g[8][9] = 'K'; g[8][13] = 'K'; g[9][9] = 'E'; g[9][13] = 'E'; g[11][10] = 'O'; g[11][11] = 'O'; g[11][12] = 'O'
  } else if (dir === 'left') {
    // Profile facing left: single eye, nose on the facing (left) side,
    // hair covering the back (right) side of the head.
    g[9][9] = 'E'; g[10][7] = 'S'; fill(5, 12, 14, 15, 'H')
  } else {
    // Profile facing right: mirrored nose/hair, not a flip of the front.
    g[9][13] = 'E'; g[10][16] = 'S'; fill(5, 12, 8, 9, 'H')
  }
  // Torso: collar, shaded right side, highlighted left edge, belt.
  fill(13, 21, 8, 15, 'T')
  fill(14, 21, 15, 15, 'D'); fill(14, 21, 8, 8, 'L')
  g[13][10] = 'C'; g[13][11] = 'C'; g[13][12] = 'C'; g[13][13] = 'C'; g[14][11] = 'C'; g[14][12] = 'C'
  fill(21, 21, 8, 15, 'B')
  // Arms: swing further in walk frames, hands (skin) at the arm ends.
  const armSwing = frame === 'walkA' ? 2 : frame === 'walkB' ? -2 : frame === 'idleB' ? -1 : 0
  const armL0 = 14 + Math.max(0, armSwing), armL1 = 20 + Math.max(0, armSwing)
  const armR0 = 14 + Math.max(0, -armSwing), armR1 = 20 + Math.max(0, -armSwing)
  fill(armL0, armL1, 6, 7, 'T'); g[armL1][6] = 'S'; g[armL1][7] = 'S'
  fill(armR0, armR1, 16, 17, 'T'); g[armR1][16] = 'S'; g[armR1][17] = 'S'
  // Legs: idle together, walk frames stride with a lifted foot.
  // Skirt variant (every 4th agent): skirt block, then skin legs below.
  if (skirt) {
    fill(22, 22, 9, 14, 'P'); fill(23, 25, 8, 15, 'P')
    if (frame === 'idle' || frame === 'idleB') { fill(26, 29, 10, 11, 'S'); fill(26, 29, 12, 13, 'S'); fill(30, 31, 10, 11, 'F'); fill(30, 31, 12, 13, 'F') }
    else if (frame === 'walkA') { fill(26, 30, 10, 11, 'S'); fill(31, 31, 10, 11, 'F'); fill(26, 28, 12, 13, 'S'); fill(29, 29, 12, 13, 'F') }
    else { fill(26, 28, 10, 11, 'S'); fill(29, 29, 10, 11, 'F'); fill(26, 30, 12, 13, 'S'); fill(31, 31, 12, 13, 'F') }
  } else if (frame === 'idle' || frame === 'idleB') { fill(22, 29, 9, 11, 'P'); fill(22, 29, 12, 14, 'P'); fill(30, 31, 9, 11, 'F'); fill(30, 31, 12, 14, 'F') }
  else if (frame === 'walkA') { fill(22, 30, 9, 10, 'P'); fill(31, 31, 9, 10, 'F'); fill(22, 27, 13, 14, 'P'); fill(28, 28, 13, 14, 'F') }
  else { fill(22, 27, 9, 10, 'P'); fill(28, 28, 9, 10, 'F'); fill(22, 30, 13, 14, 'P'); fill(31, 31, 13, 14, 'F') }
  // idleB = blink: eyes closed (skin) on face views; arms already raised 1px above.
  if (frame === 'idleB' && dir === 'down') { g[9][9] = 'S'; g[9][13] = 'S' }
  if (frame === 'idleB' && dir === 'left') g[9][9] = 'S'
  if (frame === 'idleB' && dir === 'right') g[9][13] = 'S'
  return g.map(r => r.join(''))
}
export function applyAccessory(rows: string[], kind: RolePalette['accessoryKind']): string[] {
  const g = rows.map(r => r.split(''))
  if (kind === 'hat') for (let c = 6; c <= 17; c++) { g[0][c] = 'A'; g[1][c] = 'A' }
  if (kind === 'cap') { for (let c = 8; c <= 15; c++) g[0][c] = 'A'; g[1][18] = 'A'; g[1][19] = 'A' }
  if (kind === 'apron') for (let r = 14; r <= 21; r++) { g[r][10] = 'A'; g[r][11] = 'A'; g[r][12] = 'A'; g[r][13] = 'A' }
  if (kind === 'coat') for (let r = 13; r <= 21; r++) { g[r][8] = 'A'; g[r][15] = 'A' }
  return g.map(r => r.join(''))
}
export function spritePixels(role: string, dir: Dir, frame: Frame, agentIndex: number): { rows: string[]; colors: Record<string, string> } {
  const p = paletteFor(role)
  const skirt = agentIndex % 4 === 3
  const rows = applyAccessory(charPixels(dir, frame, HAIR_STYLES[agentIndex % HAIR_STYLES.length], skirt), p.accessoryKind)
  return { rows, colors: paletteColors(p, SKIN_TONES[agentIndex % SKIN_TONES.length], HAIR_COLORS[agentIndex % HAIR_COLORS.length]) }
}
export function countPixels(rows: string[], ch: string): number { return rows.join('').split(ch).length - 1 }
// Building styles, one per location id. Stories drive texture height in textures.ts.
export interface BuildingStyle { kind: string; wall: string; roof: string; trim: string; stories: number; awning: string | null }
export const BUILDING_STYLES: Record<string, BuildingStyle> = {
  cafe: { kind: 'cafe', wall: '#fef3c7', roof: '#b91c1c', trim: '#7f1d1d', stories: 1, awning: '#dc2626' },
  park: { kind: 'park', wall: '#22c55e', roof: '#16a34a', trim: '#14532d', stories: 0, awning: null },
  residential: { kind: 'houses', wall: '#fde68a', roof: '#b45309', trim: '#78350f', stories: 2, awning: null },
  townhall: { kind: 'civic', wall: '#e7e5e4', roof: '#475569', trim: '#f8fafc', stories: 2, awning: null },
  shop: { kind: 'shop', wall: '#dbeafe', roof: '#0e7490', trim: '#164e63', stories: 1, awning: '#0e7490' },
  office: { kind: 'office', wall: '#94a3b8', roof: '#1e3a5f', trim: '#e0f2fe', stories: 4, awning: null },
  restaurant: { kind: 'restaurant', wall: '#fecaca', roof: '#7c2d12', trim: '#451a03', stories: 1, awning: '#ea580c' },
  bus: { kind: 'shelter', wall: '#a8a29e', roof: '#1c1917', trim: '#facc15', stories: 0, awning: null },
}
