// Pure, testable pixel-art specs. No Phaser import here, so Vitest can
// verify every role sprite and every building style without a canvas.
// A character is a 20x28 pixel grid; each cell is a palette key:
// '.' transparent, 'H' hair, 'S' skin, 'E' eye, 'T' top, 'P' pants,
// 'F' shoes, 'A' accessory (hat / cap / apron / coat stripe / backpack).
// 8 base silhouettes come from hair style x accessory combinations:
// short, bob, bun, bald, long, cap, hat, apron — role colour, skin tone
// and accessory then vary them to 24+ distinct agents.
export type Dir = 'down' | 'up' | 'left' | 'right'
export type Frame = 'idle' | 'walkA' | 'walkB'
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
export const HAIR_STYLES = ['short', 'bob', 'bun', 'bald', 'long'] as const
export function paletteFor(role: string): RolePalette {
  if (ROLE_PALETTES[role]) return ROLE_PALETTES[role]
  const keys = Object.keys(ROLE_PALETTES); let h = 0; for (const c of role) h = (h * 31 + c.charCodeAt(0)) % keys.length
  return ROLE_PALETTES[keys[h]]
}
export function paletteColors(p: RolePalette, skin: string, hair: string): Record<string, string> {
  return { H: hair, S: skin, E: '#111827', T: p.top, P: p.pants, F: '#1f2937', A: p.accessory }
}
// 20 wide x 28 tall. Rows 0-5 hair, 6-11 head, 12-19 body+arms, 20-27 legs.
export function charPixels(dir: Dir, frame: Frame, hairStyle: string = 'short'): string[] {
  const g: string[][] = Array.from({ length: 28 }, () => Array(20).fill('.'))
  const fill = (r0: number, r1: number, c0: number, c1: number, ch: string) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = ch }
  // Hair styles (back of head in 'up' view is all hair).
  if (hairStyle === 'bald') fill(0, 1, 6, 13, 'H')
  else if (hairStyle === 'bob') { fill(0, 4, 5, 14, 'H'); fill(5, 11, 5, 5, 'H'); fill(5, 11, 14, 14, 'H') }
  else if (hairStyle === 'bun') { fill(0, 4, 6, 13, 'H'); fill(0, 2, 9, 11, 'H') }
  else if (hairStyle === 'long') { fill(0, 4, 5, 14, 'H'); fill(5, 14, 5, 6, 'H'); fill(5, 14, 13, 14, 'H') }
  else fill(0, 3, 6, 13, 'H')
  fill(5, 11, 6, 13, 'S')
  if (dir === 'up') fill(5, 11, 6, 13, 'H')
  else {
    const eyeC = dir === 'left' ? [7, 10] : dir === 'right' ? [9, 12] : [7, 11]
    g[8][eyeC[0]] = 'E'; g[8][eyeC[1]] = 'E'
    if (dir === 'down') { g[9][9] = 'E'; g[9][10] = 'E' }
  }
  // Torso + arms. Arms swing in walk frames, hang in idle.
  fill(12, 19, 6, 13, 'T')
  const armSwing = frame === 'walkA' ? 1 : frame === 'walkB' ? -1 : 0
  fill(13 + Math.max(0, armSwing), 18 + Math.max(0, armSwing), 4, 5, 'T')
  fill(13 + Math.max(0, -armSwing), 18 + Math.max(0, -armSwing), 14, 15, 'T')
  fill(18, 18, 4, 5, 'S'); fill(18, 18, 14, 15, 'S')
  // Legs: idle together, walk frames stride.
  if (frame === 'idle') { fill(20, 26, 7, 9, 'P'); fill(20, 26, 10, 12, 'P'); fill(27, 27, 7, 9, 'F'); fill(27, 27, 10, 12, 'F') }
  else if (frame === 'walkA') { fill(20, 27, 7, 8, 'P'); fill(27, 27, 7, 8, 'F'); fill(20, 24, 11, 12, 'P'); fill(25, 25, 11, 12, 'F') }
  else { fill(20, 24, 7, 8, 'P'); fill(25, 25, 7, 8, 'F'); fill(20, 27, 11, 12, 'P'); fill(27, 27, 11, 12, 'F') }
  return g.map(r => r.join(''))
}
export function applyAccessory(rows: string[], kind: RolePalette['accessoryKind']): string[] {
  const g = rows.map(r => r.split(''))
  if (kind === 'hat') for (let c = 4; c <= 15; c++) { g[0][c] = 'A'; g[1][c] = 'A' }
  if (kind === 'cap') { for (let c = 6; c <= 13; c++) g[0][c] = 'A'; g[1][16] = 'A'; g[1][17] = 'A' }
  if (kind === 'apron') for (let r = 13; r <= 19; r++) { g[r][8] = 'A'; g[r][9] = 'A'; g[r][10] = 'A'; g[r][11] = 'A' }
  if (kind === 'coat') for (let r = 12; r <= 19; r++) { g[r][6] = 'A'; g[r][13] = 'A' }
  return g.map(r => r.join(''))
}
export function spritePixels(role: string, dir: Dir, frame: Frame, agentIndex: number): { rows: string[]; colors: Record<string, string> } {
  const p = paletteFor(role)
  const rows = applyAccessory(charPixels(dir, frame, HAIR_STYLES[agentIndex % HAIR_STYLES.length]), p.accessoryKind)
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
