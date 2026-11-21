import { describe, it, expect } from 'vitest'
import { SimEngine } from '../simulation/engine'

const drive = (e: SimEngine, minutes: number) => {
  const acc = { v: 0 }
  for (let i = 0; i < minutes; i++) e.step(1, acc)
}

// restore() validated each agent entry but never checked the ids
// against each other: a hand-edited save with two agents sharing one
// id loaded silently, and every id-keyed lookup then addressed only
// the first twin — resetAgent reset the first while the second kept
// its pre-reset state, their conversation timers overwrote each other
// in the conv map, and the second twin never got a sprite (the scene
// map already held the id), so it walked the city invisible while
// listed in the registry. Snapshot ids are unique by construction, so
// a duplicate can only come from a hand-edited save: reject it like
// any other malformed entry, before anything is mutated.
describe('restore() rejects duplicate agent ids', () => {
  it('a save with two agents sharing an id is refused', () => {
    const src = new SimEngine(42)
    drive(src, 200)
    const snap: any = src.snapshot()
    const twin = JSON.parse(JSON.stringify(snap.agents[0]))
    twin.name = 'Alice Twin'
    snap.agents.push(twin)
    const e = new SimEngine(7)
    expect(() => e.restore(snap)).toThrow('duplicate agent id')
  })
  it('the refused load leaves the live world untouched and running', () => {
    const src = new SimEngine(42)
    drive(src, 200)
    const snap: any = src.snapshot()
    const twin = JSON.parse(JSON.stringify(snap.agents[0]))
    twin.name = 'Alice Twin'
    snap.agents.push(twin)
    const e = new SimEngine(7)
    const before = e.agents.map(a => a.id)
    const completedBefore = e.completed
    expect(() => e.restore(snap)).toThrow('duplicate agent id')
    expect(e.agents.map(a => a.id)).toEqual(before)
    expect(e.agents.length).toBe(24)
    drive(e, 100)
    expect(e.completed).toBeGreaterThan(completedBefore)
  })
  it('a well-formed save with unique ids still loads', () => {
    const src = new SimEngine(42)
    drive(src, 200)
    const snap: any = src.snapshot()
    const e = new SimEngine(7)
    e.restore(snap)
    expect(new Set(e.agents.map(a => a.id)).size).toBe(e.agents.length)
    expect(e.agents.length).toBe(24)
  })
})
