import type { Location, Pos } from './types'
export const GRID_W = 22, GRID_H = 16
export const LOCATIONS: Location[] = [
  { id: 'cafe', name: 'Neural Cafe', type: 'cafe', entrance: { x: 6, y: 3 }, tiles: [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }], actions: ['Eat', 'Socialize', 'Conversing'] },
  { id: 'park', name: 'Central Park', type: 'park', entrance: { x: 10, y: 8 }, tiles: [{ x: 8, y: 8 }, { x: 9, y: 8 }, { x: 10, y: 8 }, { x: 11, y: 8 }, { x: 8, y: 9 }, { x: 9, y: 9 }, { x: 10, y: 9 }, { x: 11, y: 9 }], actions: ['Socialize', 'Resting'] },
  { id: 'residential', name: 'Residential District', type: 'home', entrance: { x: 6, y: 12 }, tiles: [{ x: 3, y: 11 }, { x: 4, y: 11 }, { x: 5, y: 11 }, { x: 3, y: 12 }, { x: 4, y: 12 }, { x: 5, y: 12 }], actions: ['Resting', 'Sleeping'] },
  { id: 'townhall', name: 'Town Hall', type: 'civic', entrance: { x: 15, y: 9 }, tiles: [{ x: 15, y: 10 }, { x: 16, y: 10 }, { x: 17, y: 10 }, { x: 15, y: 11 }, { x: 16, y: 11 }, { x: 17, y: 11 }], actions: ['Working'] },
  { id: 'shop', name: 'Corner Shop', type: 'shop', entrance: { x: 3, y: 9 }, tiles: [{ x: 1, y: 9 }, { x: 2, y: 9 }, { x: 1, y: 10 }, { x: 2, y: 10 }], actions: ['Shopping'] },
  { id: 'office', name: 'Office Building', type: 'office', entrance: { x: 14, y: 5 }, tiles: [{ x: 14, y: 2 }, { x: 15, y: 2 }, { x: 16, y: 2 }, { x: 14, y: 3 }, { x: 15, y: 3 }, { x: 16, y: 3 }, { x: 14, y: 4 }, { x: 15, y: 4 }, { x: 16, y: 4 }], actions: ['Working'] },
  { id: 'restaurant', name: 'Restaurant', type: 'restaurant', entrance: { x: 18, y: 5 }, tiles: [{ x: 18, y: 2 }, { x: 19, y: 2 }, { x: 18, y: 3 }, { x: 19, y: 3 }], actions: ['Eating'] },
  { id: 'bus', name: 'Bus Stop', type: 'transit', entrance: { x: 11, y: 13 }, tiles: [{ x: 11, y: 14 }], actions: ['Waiting', 'Commuting'] },
]
export function walkableGrid(): boolean[][] {
  const g = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(true))
  for (const loc of LOCATIONS) for (const t of loc.tiles) if (loc.id !== 'park') g[t.y][t.x] = false
  return g
}
export function locationAt(pos: Pos): Location | undefined { return LOCATIONS.find(l => l.entrance.x === Math.round(pos.x) && l.entrance.y === Math.round(pos.y)) }
