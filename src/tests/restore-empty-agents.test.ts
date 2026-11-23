import { describe, it, expect } from 'vitest'
import { SimEngine } from '../simulation/engine'

const drive = (e: SimEngine, minutes: number) => {
  const acc = { v: 0 }
  for (let i = 0; i < minutes; i++) e.step(1, acc)
}

// restore() rejected a missing agent list but accepted an empty one —
// and live operation can never produce zero agents (24 seeded,
// addAgent only ever adds), so an empty list can only come from a
// hand-edited save. Loading it silently wiped the live city to zero
// agents, ticked on with nothing in it, and told the user "World
// loaded." The 24 agents and all their state were gone from the
// session; only a page reload brought them back. An empty list is
// refused up front, like a missing one, before anything is mutated.
describe('restore() rejects a save with no agents', () => {
  it('a save with an empty agent list is refused', () => {
    const src = new SimEngine(42)
    drive(src, 200)
    const snap: any = src.snapshot()
    snap.agents = []
    const e = new SimEngine(7)
    expect(() => e.restore(snap)).toThrow('no agent list')
  })
  it('the refused load leaves the live world untouched and running', () => {
    const src = new SimEngine(42)
    drive(src, 200)
    const snap: any = src.snapshot()
    snap.agents = []
    const e = new SimEngine(7)
    const before = e.agents.map(a => a.id)
    const completedBefore = e.completed
    expect(() => e.restore(snap)).toThrow('no agent list')
    expect(e.agents.map(a => a.id)).toEqual(before)
    expect(e.agents.length).toBe(24)
    drive(e, 100)
    expect(e.completed).toBeGreaterThan(completedBefore)
  })
  it('a well-formed save with agents still loads', () => {
    const src = new SimEngine(42)
    drive(src, 200)
    const snap: any = src.snapshot()
    const e = new SimEngine(7)
    e.restore(snap)
    expect(e.agents.length).toBe(24)
  })
})
