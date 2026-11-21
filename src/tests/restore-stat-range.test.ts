import { describe, it, expect } from 'vitest'
import { SimEngine } from '../simulation/engine'

const drive = (e: SimEngine, minutes: number) => {
  const acc = { v: 0 }
  for (let i = 0; i < minutes; i++) e.step(1, acc)
}

// restore() validated that stats are finite, but not that they are in
// range: a hand-edited save with energy 500 / sociability 500 passed,
// the inspector then showed "Energy: 350%" after 600 sim-minutes, and
// the sociability-500 agent picked Socialize at every decision for
// 3,000 minutes — its utility (500 * 0.8) outbid even a critical-
// hunger meal — never working or eating. Live operation keeps every
// bounded stat in [0, 100]; a restored agent must be clamped to it.
describe('restore() clamps out-of-range stats', () => {
  it('a save with out-of-range stats and traits loads with every value in [0, 100]', () => {
    const src = new SimEngine(42)
    drive(src, 200)
    const snap: any = src.snapshot()
    const a0 = snap.agents[0]
    a0.energy = 500; a0.hunger = -50; a0.mood = 999; a0.confidence = -20
    a0.personality.sociability = 500; a0.personality.curiosity = -100
    a0.sociability = 500
    a0.relationships = { someone: 999, nobody: Number.NaN }
    const e = new SimEngine(7)
    e.restore(snap)
    const a = e.agents[0]
    expect(a.energy).toBe(100); expect(a.hunger).toBe(0); expect(a.mood).toBe(100); expect(a.confidence).toBe(0)
    expect(a.personality.sociability).toBe(100); expect(a.personality.curiosity).toBe(0)
    expect(a.sociability).toBe(100)
    expect(a.relationships).toEqual({ someone: 100 })
    // And the values stay in range as the world runs: before the fix
    // energy was still 350 after 600 minutes of drain.
    drive(e, 600)
    for (const ag of e.agents) {
      for (const v of [ag.energy, ag.hunger, ag.mood, ag.confidence, ag.sociability, ag.personality.sociability, ag.personality.energyNeed, ag.personality.curiosity, ag.personality.routine]) {
        expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100)
      }
    }
  })
  it('a clamped agent picks varied goals instead of only Socialize', () => {
    const src = new SimEngine(42)
    const snap: any = src.snapshot()
    snap.agents[0].personality.sociability = 500
    snap.agents[0].sociability = 500
    const e = new SimEngine(7)
    e.restore(snap)
    const a = e.agents[0]
    const picked = new Set<string>()
    const acc = { v: 0 }
    let last = ''
    for (let i = 0; i < 3000; i++) { e.step(1, acc); if (a.goal !== last && a.goal !== 'Settle in') { picked.add(a.goal); last = a.goal } }
    // Before the fix the set was exactly {Socialize, Commute}: the
    // agent never worked or ate in 3,000 minutes.
    expect(picked.has('Work')).toBe(true)
    expect(picked.has('Eat')).toBe(true)
  })
  it('a well-formed save keeps its stats unchanged', () => {
    const src = new SimEngine(42)
    drive(src, 200)
    const snap: any = src.snapshot()
    const before = snap.agents.map((a: any) => [a.energy, a.hunger, a.mood, a.confidence, a.personality.sociability])
    const e = new SimEngine(7)
    e.restore(snap)
    expect(e.agents.map(a => [a.energy, a.hunger, a.mood, a.confidence, a.personality.sociability])).toEqual(before)
  })
})
