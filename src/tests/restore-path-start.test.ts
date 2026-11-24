import { describe, it, expect } from 'vitest'
import { SimEngine } from '../simulation/engine'
import { walkableGrid, GRID_W, GRID_H } from '../simulation/map'

const stepMinutes = (e: SimEngine, n: number) => {
  const acc = { v: 0 }
  for (let i = 0; i < n; i++) e.step(1, acc)
}

// restore() re-routes a saved walk whose route does not start at the
// agent: the stale-path repair used to check only that every waypoint
// was walkable and that the route ended at the destination, so a
// hand-edited save with a valid route starting across town passed it —
// and the movement loop then walked the agent in a straight line to
// that first waypoint, through the office building at (15,4).
describe('restore: path must start at the agent', () => {
  it('re-routes a walk whose route starts across town instead of at the agent', () => {
    const e = new SimEngine(42)
    const s = e.snapshot()
    const a0 = s.agents[0]
    a0.pos = { x: 6, y: 3 }
    a0.state = 'Walking'
    a0.dest = { x: 18, y: 5 }
    a0.path = [{ x: 18, y: 5 }]
    a0.activityUntil = s.simMinutes + 120
    a0.cooldownUntil = 0
    delete (a0 as any)._target
    const e2 = new SimEngine(7)
    e2.restore(structuredClone(s))
    const agent = e2.agents[0]
    // Re-routed from where the agent stands: the first waypoint is the
    // adjacent tile, not the far end of the saved route.
    const first = agent.path[0]
    expect(Math.abs(first.x - agent.pos.x) + Math.abs(first.y - agent.pos.y)).toBeLessThanOrEqual(1)
    // And the walk itself never leaves walkable tiles.
    const grid = walkableGrid()
    const acc = { v: 0 }
    for (let i = 0; i < 10; i++) {
      e2.step(1, acc)
      const rx = Math.round(agent.pos.x), ry = Math.round(agent.pos.y)
      expect(ry >= 0 && ry < GRID_H && rx >= 0 && rx < GRID_W && grid[ry][rx]).toBe(true)
    }
  })

  it('keeps a valid route that already starts at the agent', () => {
    const e = new SimEngine(42)
    const s = e.snapshot()
    const a0 = s.agents[0]
    a0.pos = { x: 17, y: 5 }
    a0.state = 'Walking'
    a0.dest = { x: 18, y: 5 }
    a0.path = [{ x: 18, y: 5 }]
    a0.activityUntil = s.simMinutes + 120
    a0.cooldownUntil = 0
    delete (a0 as any)._target
    const e2 = new SimEngine(7)
    e2.restore(structuredClone(s))
    expect(e2.agents[0].path).toEqual([{ x: 18, y: 5 }])
  })

  it('an agent that arrives with no activity target picks a fresh goal instead of idling with a stale destination', () => {
    const e = new SimEngine(42)
    const s = e.snapshot()
    const a0 = s.agents[0]
    a0.pos = { x: 17, y: 5 }
    a0.state = 'Walking'
    a0.dest = { x: 18, y: 5 }
    a0.path = [{ x: 18, y: 5 }]
    a0.goal = 'Work'
    a0.activity = 'Walking to Restaurant'
    a0.activityUntil = s.simMinutes + 120
    a0.cooldownUntil = 0
    delete (a0 as any)._target
    const e2 = new SimEngine(7)
    e2.restore(structuredClone(s))
    stepMinutes(e2, 2)
    const agent = e2.agents[0]
    // Arrived, went Idle, and re-picked in the same decision tick: the
    // destination now matches the new goal, not the abandoned walk.
    expect(agent.state).toBe('Walking')
    expect(agent.path.length).toBeGreaterThan(0)
    const last = agent.path[agent.path.length - 1]
    expect(agent.dest).toEqual(last)
  })
})
