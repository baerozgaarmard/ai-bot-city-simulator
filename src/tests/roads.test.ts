import { describe, it, expect } from 'vitest'
import { CROSSWALKS, LOCATIONS, ROAD_TILES, connectorAt, graphAt, graphNeighbours, roadAt, roadKind, sidewalkAt, walkableGrid } from '../simulation/map'
import { astar } from '../simulation/pathfinding'

// Park tiles are walkable ground in walkableGrid (the park exception),
// not solid buildings — exclude them from the blocked-tile set.
const buildingTiles = new Set(LOCATIONS.filter(l => l.id !== 'park').flatMap(l => l.tiles.map(t => `${t.x},${t.y}`)))
const entrance = (id: string) => LOCATIONS.find(l => l.id === id)!.entrance

describe('road network', () => {
  it('no road tile overlaps a building tile', () => {
    for (const [x, y] of ROAD_TILES) expect(buildingTiles.has(`${x},${y}`), `road at ${x},${y} overlaps a building`).toBe(false)
  })
  it('every road tile has a graph neighbour — no isolated tiles, no mid-ground dead ends', () => {
    for (const [x, y] of ROAD_TILES) {
      expect(graphNeighbours(x, y).length, `road ${x},${y} is isolated`).toBeGreaterThan(0)
    }
  })
  it('tiles with exactly one graph neighbour are only boundary or destination termini', () => {
    const termini = ROAD_TILES.filter(([x, y]) => graphNeighbours(x, y).length === 1).map(([x, y]) => `${x},${y}`).sort()
    // Map boundaries (0,7),(21,7),(10,0),(10,15); destination termini:
    // cafe (6,3), restaurant (18,5), bus (11,13).
    expect(termini).toEqual(['0,7', '10,0', '10,15', '11,13', '18,5', '21,7', '6,3'])
  })
  it('the road graph is connected through roads and the park path', () => {
    const seen = new Set<string>(['0,7']); const queue = [[0, 7]]
    while (queue.length) {
      const [x, y] = queue.pop()!
      for (const n of graphNeighbours(x, y)) {
        const k = `${n.x},${n.y}`
        if (!seen.has(k)) { seen.add(k); queue.push([n.x, n.y]) }
      }
    }
    for (const [x, y] of ROAD_TILES) expect(seen.has(`${x},${y}`), `road ${x},${y} unreachable from 0,7`).toBe(true)
  })
  it('every entrance is on a road, on the park path, or adjacent to a road', () => {
    for (const loc of LOCATIONS) {
      const { x, y } = loc.entrance
      expect(roadAt(x, y) || connectorAt(x, y) || graphNeighbours(x, y).length > 0, `${loc.id} entrance ${x},${y} is not road-connected`).toBe(true)
    }
  })
  it('junctions have neighbours on both axes, straight roads on exactly one', () => {
    expect(roadKind(10, 7)).toBe('asphalt-cross')
    expect(roadKind(6, 7)).toBe('asphalt-cross')
    expect(roadKind(10, 5)).toBe('asphalt-cross')
    expect(roadKind(10, 13)).toBe('asphalt-cross')
    expect(roadKind(12, 7)).toBe('asphalt-x')
    expect(roadKind(10, 3)).toBe('asphalt-y')
    for (const k of CROSSWALKS) {
      const [x, y] = k.split(',').map(Number)
      expect(roadKind(x, y), `crosswalk ${k} is not an intersection`).toBe('asphalt-cross')
    }
  })
  it('sidewalks are road-adjacent ground, never a road, park, or building tile', () => {
    expect(sidewalkAt(2, 6)).toBe(true) // beside main road, beside a parked car
    expect(sidewalkAt(0, 7)).toBe(false) // road itself
    expect(sidewalkAt(10, 8)).toBe(false) // park path
    expect(sidewalkAt(4, 3)).toBe(false) // cafe building tile
    expect(sidewalkAt(20, 2)).toBe(false) // far from any road
  })
  it('A* between entrances exists and never crosses a building tile', () => {
    const grid = walkableGrid()
    for (const [a, b] of [['cafe', 'office'], ['residential', 'bus'], ['shop', 'townhall'], ['restaurant', 'park']] as const) {
      const path = astar(grid, entrance(a), entrance(b))
      expect(path.length, `${a} -> ${b} has no path`).toBeGreaterThan(0)
      for (const p of path) expect(buildingTiles.has(`${p.x},${p.y}`), `path ${a}->${b} crosses building ${p.x},${p.y}`).toBe(false)
    }
    // Park path connects the split vertical main road: south segment is
    // reachable from the north segment only through (10,8)/(10,9).
    expect(graphAt(10, 8) && graphAt(10, 9)).toBe(true)
    expect(roadAt(10, 8)).toBe(false) // park stays park, not asphalt
  })
})
