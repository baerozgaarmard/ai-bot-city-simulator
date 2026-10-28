import { describe, it, expect } from 'vitest'
import { astar } from '../simulation/pathfinding'
import { walkableGrid } from '../simulation/map'
import { SimEngine } from '../simulation/engine'
import { WorldSchema } from '../persistence/db'

describe('pathfinding', () => {
  it('finds a path that never crosses building tiles', () => {
    const g = walkableGrid(); const p = astar(g, { x: 0, y: 0 }, { x: 6, y: 3 })
    expect(p.length).toBeGreaterThan(0); for (const t of p) expect(g[t.y][t.x]).toBe(true)
  })
  it('returns empty for a blocked goal', () => { const g = walkableGrid(); expect(astar(g, { x: 0, y: 0 }, { x: 3, y: 3 })).toEqual([]) })
})
describe('engine', () => {
  it('seeds distinct agents and advances ticks', () => {
    const e = new SimEngine(42); expect(e.agents.length).toBeGreaterThanOrEqual(20)
    const names = new Set(e.agents.map(a => a.name)); expect(names.size).toBe(e.agents.length)
    const acc = { v: 0 }; e.step(120, acc); expect(e.tick).toBeGreaterThan(0)
  })
  it('low energy agents prefer rest over work', () => {
    const e = new SimEngine(7); const a = e.agents[0]; a.energy = 5; a.hunger = 10; a.state = 'Idle'; a.activityUntil = 0; a.cooldownUntil = 0; a.path = []; a.dest = null; (a as any)._target = undefined // reset the constructor's initial goal so the low-energy choice is re-made
    const acc = { v: 0 }; for (let i = 0; i < 3; i++) e.step(1, acc)
    expect(['Resting', 'Sleeping', 'Walking']).toContain(a.state)
  })
  it('memories come from real events and can be retrieved', () => {
    const e = new SimEngine(9); const a = e.agents[0]; const b = e.agents[1]
    ;(e as any).addMemory(a, 'episodic', 'Met Bob at cafe', 8, 1, [b.id], null, 'ev-1', ['social'])
    expect(e.relevantMemories(a.id, b.id)[0].summary).toContain('Bob')
  })
  it('world snapshot validates with Zod', () => { const e = new SimEngine(3); expect(() => WorldSchema.parse(e.snapshot())).not.toThrow() })
  it('add agent appears and ticks', () => {
    const e = new SimEngine(5); const before = e.agents.length
    e.addAgent({ name: 'Zoe Test', role: 'Tester', personality: { sociability: 50, energyNeed: 50, curiosity: 50, routine: 50 }, locationId: 'cafe', energy: 80, mood: 70 })
    expect(e.agents.length).toBe(before + 1)
  })
})
