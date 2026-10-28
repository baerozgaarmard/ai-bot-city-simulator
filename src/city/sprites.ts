// Pure, testable pixel-art specs. No Phaser import here, so Vitest can
// verify every role sprite and every building style without a canvas.
// A character is a 16x20 pixel grid; each cell is a palette key:
// '.' transparent, 'H' hair, 'S' skin, 'E' eye, 'T' top, 'P' pants,
// 'F' shoes, 'A' accessory (hat / cap / apron / coat stripe).
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
export function paletteFor(role: string): RolePalette {
  if (ROLE_PALETTES[role]) return ROLE_PALETTES[role]
  const keys = Object.keys(ROLE_PALETTES); let h = 0; for (const c of role) h = (h * 31 + c.charCodeAt(0)) % keys.length
  return ROLE_PALETTES[keys[h]]
}
export function paletteColors(p: RolePalette, skin: string, hair: string): Record<string, string> {
  return { H: hair, S: skin, E: '#111827', T: p.top, P: p.pants, F: '#1f2937', A: p.accessory }
}
// 16 wide x 20 tall. Rows 0-2 hair, 3-7 head, 8-14 body, 15-19 legs.
export function charPixels(dir: Dir, frame: Frame): string[] {
  const g: string[][] = Array.from({ length: 20 }, () => Array(16).fill('.'))
  const fill = (r0: number, r1: number, c0: number, c1: number, ch: string) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = ch }
  fill(0, 2, 4, 11, 'H'); fill(3, 7, 4, 11, 'S')
  if (dir === 'up') fill(3, 7, 4, 11, 'H') // back of head, no face
  else {
    const eyeC = dir === 'left' ? [5, 8] : dir === 'right' ? [7, 10] : [5, 9]
    g[5][eyeC[0]] = 'E'; g[5][eyeC[1]] = 'E'
    if (dir === 'down') { g[6][7] = 'E'; g[6][8] = 'E' } // nose shadow, keeps face distinct from side views
  }
  fill(8, 14, 4, 11, 'T'); fill(9, 13, 3, 3, 'T'); fill(9, 13, 12, 12, 'T'); fill(13, 13, 3, 3, 'S'); fill(13, 13, 12, 12, 'S')
  if (frame === 'idle') { fill(15, 18, 5, 7, 'P'); fill(15, 18, 8, 10, 'P'); fill(19, 19, 5, 7, 'F'); fill(19, 19, 8, 10, 'F') }
  else if (frame === 'walkA') { fill(15, 19, 5, 6, 'P'); fill(19, 19, 5, 6, 'F'); fill(15, 17, 9, 10, 'P'); fill(18, 18, 9, 10, 'F') }
  else { fill(15, 17, 5, 6, 'P'); fill(18, 18, 5, 6, 'F'); fill(15, 19, 9, 10, 'P'); fill(19, 19, 9, 10, 'F') }
  return g.map(r => r.join(''))
}
export function applyAccessory(rows: string[], kind: RolePalette['accessoryKind']): string[] {
  const g = rows.map(r => r.split(''))
  if (kind === 'hat') for (let c = 3; c <= 12; c++) { g[0][c] = 'A'; g[1][c] = 'A' }
  if (kind === 'cap') { for (let c = 4; c <= 11; c++) g[0][c] = 'A'; g[1][12] = 'A'; g[1][13] = 'A' }
  if (kind === 'apron') for (let r = 9; r <= 14; r++) { g[r][6] = 'A'; g[r][7] = 'A'; g[r][8] = 'A'; g[r][9] = 'A' }
  if (kind === 'coat') for (let r = 8; r <= 14; r++) { g[r][4] = 'A'; g[r][11] = 'A' }
  return g.map(r => r.join(''))
}
export function spritePixels(role: string, dir: Dir, frame: Frame, agentIndex: number): { rows: string[]; colors: Record<string, string> } {
  const p = paletteFor(role)
  const rows = applyAccessory(charPixels(dir, frame), p.accessoryKind)
  return { rows, colors: paletteColors(p, SKIN_TONES[agentIndex % SKIN_TONES.length], HAIR_COLORS[agentIndex % HAIR_COLORS.length]) }
}
export function countPixels(rows: string[], ch: string): number { return rows.join('').split(ch).length - 1 }
// Building styles, one per location id. Stories drive prism height in the scene.
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
