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
// Road network (tile-based, grid coordinates, not screen coordinates).
// Before this fix the city had only a single cross: y=7 and x=10, with no
// road reaching any entrance except the park's. Every location entrance
// is now on a road tile (park entrance on its paved path), and every road
// tile has a graph neighbour — no isolated tiles, no mid-ground dead ends.
// Segments: main cross (y=7, x=10), north road (y=5), west road (x=6),
// shop spur (x=3, y=9), townhall spur (x=15, y=9), south road (y=13).
// The vertical main road is split by the park (y=8,9): those two tiles
// stay park paving (the park path), and act as graph connectors, not asphalt.
const RAW_ROADS: Array<[number, number]> = [
  ...Array.from({ length: 22 }, (_, x) => [x, 7] as [number, number]),
  ...Array.from({ length: 8 }, (_, i) => [10, i] as [number, number]),
  ...Array.from({ length: 6 }, (_, i) => [10, 10 + i] as [number, number]),
  ...Array.from({ length: 13 }, (_, i) => [6 + i, 5] as [number, number]),
  ...Array.from({ length: 11 }, (_, i) => [6, 3 + i] as [number, number]),
  ...Array.from({ length: 3 }, (_, i) => [3, 7 + i] as [number, number]),
  ...Array.from({ length: 4 }, (_, i) => [3 + i, 9] as [number, number]),
  ...Array.from({ length: 3 }, (_, i) => [15, 7 + i] as [number, number]),
  ...Array.from({ length: 4 }, (_, i) => [12 + i, 9] as [number, number]),
  ...Array.from({ length: 6 }, (_, i) => [6 + i, 13] as [number, number]),
]
export const ROAD_TILES: Array<[number, number]> = [...new Set(RAW_ROADS.map(([x, y]) => `${x},${y}`))].map(k => k.split(',').map(Number) as [number, number])
const ROAD_SET = new Set(ROAD_TILES.map(([x, y]) => `${x},${y}`))
export const PARK_PATH: Array<[number, number]> = [[10, 8], [10, 9], [11, 9]] // x=10 column + east exit to the townhall road at (12,9)
export const CROSSWALKS = new Set(['10,7', '6,7', '10,13'])
export function roadAt(x: number, y: number) { return ROAD_SET.has(`${x},${y}`) }
export function connectorAt(x: number, y: number) { return PARK_PATH.some(([px, py]) => px === x && py === y) }
export function graphAt(x: number, y: number) { return roadAt(x, y) || connectorAt(x, y) }
export function graphNeighbours(x: number, y: number) {
  return [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }].filter(p => graphAt(p.x, p.y))
}
// Road direction from grid neighbours, not screen eyeballing: a tile with
// east/west neighbours runs along x, north/south along y, both = intersection.
export function roadKind(x: number, y: number): 'asphalt-x' | 'asphalt-y' | 'asphalt-cross' {
  const dx = roadAt(x + 1, y) || roadAt(x - 1, y)
  const dy = roadAt(x, y + 1) || roadAt(x, y - 1)
  if (dx && dy) return 'asphalt-cross'
  if (dx) return 'asphalt-x'
  return 'asphalt-y'
}
// Sidewalk = non-road, non-park ground tile orthogonally adjacent to a road.
// Entrance tiles are roads themselves, so a sidewalk never covers a doorway.
export function sidewalkAt(x: number, y: number) {
  if (roadAt(x, y)) return false
  if (LOCATIONS.some(l => l.tiles.some(t => t.x === x && t.y === y))) return false
  return roadAt(x + 1, y) || roadAt(x - 1, y) || roadAt(x, y + 1) || roadAt(x, y - 1)
}
export function walkableGrid(): boolean[][] {
  const g = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(true))
  for (const loc of LOCATIONS) for (const t of loc.tiles) if (loc.id !== 'park') g[t.y][t.x] = false
  return g
}
export function locationAt(pos: Pos): Location | undefined { return LOCATIONS.find(l => l.entrance.x === Math.round(pos.x) && l.entrance.y === Math.round(pos.y)) }
