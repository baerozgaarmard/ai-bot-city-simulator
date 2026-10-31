import { describe, it, expect } from 'vitest'
import { astar } from '../simulation/pathfinding'
import { walkableGrid, LOCATIONS } from '../simulation/map'
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
  it('goal at the agent\'s current entrance sets activityUntil instead of instantly completing', () => {
    // Regression: setGoal used to set the target state directly when the
    // path was empty (already at the entrance) without setting
    // activityUntil, so the next decision tick instantly "completed" a goal
    // the agent never spent time on — and re-picking the same location
    // looped one fake completion per minute.
    const e = new SimEngine(11); const a = e.agents[0]
    const home = LOCATIONS.find(l => l.id === 'residential')!
    a.pos = { ...home.entrance }; a.state = 'Idle'; a.path = []; a.dest = null
    a.activityUntil = e.simMinutes - 10; a.cooldownUntil = 0 // stale value from a previous activity
    ;(e as any).setGoal(a, 'Rest', home, 'Resting', 'Resting at home', 60)
    expect(a.state).toBe('Resting'); expect(a.activityUntil).toBe(e.simMinutes + 60)
    const acc = { v: 0 }; e.step(1, acc)
    expect(a.state).toBe('Resting'); expect(a.recentActions).not.toContain('Rest at Residential District')
    for (let i = 0; i < 61; i++) e.step(1, acc)
    expect(a.recentActions.filter(r => r === 'Rest at Residential District').length).toBe(1)
  })
  it('restored Conversing agent is not stuck: the conv timer is not in the snapshot, so a missing entry must release it', () => {
    const e = new SimEngine(11); const a = e.agents[0]
    a.state = 'Conversing'; a.path = []; a.activityUntil = e.simMinutes + 40; a.cooldownUntil = 0
    const e2 = new SimEngine(99); e2.restore(e.snapshot())
    const acc = { v: 0 }; for (let i = 0; i < 200; i++) e2.step(1, acc)
    expect(e2.agents[0].state).not.toBe('Conversing')
  })
  it('loading a save clears live conversation state instead of leaving stale conv entries', () => {
    // Regression: restore() replaced the agents but kept the live conv
    // map. Loading an older save while a conversation was live left a
    // stale entry whose `until` was in the restored timeline's future:
    // a restored Conversing agent stayed Conversing, talking to nobody,
    // until that stale timer passed, and a restored Socializing agent
    // could never be picked as a conversation partner again (arrive()
    // requires !conv.has(o.id), and the guard only runs for Conversing
    // agents, so the stale entry never expired for it).
    const e = new SimEngine(77); const park = LOCATIONS.find(l => l.id === 'park')!
    const [a, b] = e.agents
    for (const ag of [a, b]) {
      ag.pos = { ...park.entrance }; ag.state = 'Socializing'; ag.path = []; ag.dest = null
      ag.activityUntil = e.simMinutes + 40; ag.cooldownUntil = 0
      ;(ag as any)._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    }
    ;(e as any).arrive(a)
    expect(a.state).toBe('Conversing'); expect((e as any).conv.size).toBe(2)
    // Simulate loading an older save: rewind the clock, partner elsewhere.
    const snap = e.snapshot()
    snap.simMinutes = e.simMinutes - 200
    snap.agents[0].state = 'Conversing'; snap.agents[0].path = []
    snap.agents[1].state = 'Working'; snap.agents[1].path = []
    e.restore(snap)
    expect((e as any).conv.size).toBe(0)
    const acc = { v: 0 }; for (let i = 0; i < 5; i++) e.step(1, acc)
    expect(e.agents[0].state).not.toBe('Conversing')
  })
  it('add agent appears and ticks', () => {
    const e = new SimEngine(5); const before = e.agents.length
    e.addAgent({ name: 'Zoe Test', role: 'Tester', personality: { sociability: 50, energyNeed: 50, curiosity: 50, routine: 50 }, locationId: 'cafe', energy: 80, mood: 70 })
    expect(e.agents.length).toBe(before + 1)
  })
  it('resetting a Conversing agent unwinds the conversation instead of leaving a stale conv entry', () => {
    // Regression: resetAgent left the agent's entry in the conv map, so
    // arrive() would never pick it as a conversation partner again (it
    // requires !conv.has(o.id)), and its partner kept Conversing with
    // someone who had been reset away.
    const e = new SimEngine(77); const park = LOCATIONS.find(l => l.id === 'park')!
    const [a, b, c] = e.agents
    for (const ag of [a, b]) {
      ag.pos = { ...park.entrance }; ag.state = 'Socializing'; ag.path = []; ag.dest = null
      ag.activityUntil = e.simMinutes + 40; ag.cooldownUntil = 0
      ;(ag as any)._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    }
    ;(e as any).arrive(a)
    expect(a.state).toBe('Conversing'); expect(b.state).toBe('Conversing')
    e.resetAgent(b.id)
    expect(b.state).toBe('Idle'); expect(a.state).toBe('Idle')
    expect((e as any).conv.size).toBe(0)
    // b can be a conversation partner again
    for (const ag of [b, c]) {
      ag.pos = { ...park.entrance }; ag.state = 'Socializing'; ag.path = []; ag.dest = null
      ag.activityUntil = e.simMinutes + 40; ag.cooldownUntil = 0
      ;(ag as any)._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 40 }
    }
    ;(e as any).arrive(c)
    expect(c.state).toBe('Conversing'); expect(b.state).toBe('Conversing')
  })
  it('a full night of sleep restores energy instead of draining it', () => {
    // Regression: Sleeping shared Resting's +40 restore, but a sleep lasts
    // 120 minutes (vs 60 for a rest) while energy drains 0.4/min, so an
    // agent that slept the whole night woke up MORE tired (50 -> 42).
    const e = new SimEngine(5); const a = e.agents[0]
    a.state = 'Sleeping'; a.path = []; a.dest = null
    a.activityUntil = e.simMinutes + 120; a.cooldownUntil = 0
    a.energy = 50; a.hunger = 10
    const acc = { v: 0 }
    for (let i = 0; i < 130; i++) { e.step(1, acc); if ((a.state as string) === 'Idle') break }
    expect(a.state).toBe('Idle')
    expect(a.energy).toBeGreaterThan(50)
  })
})
