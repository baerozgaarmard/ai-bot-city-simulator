import { describe, it, expect } from 'vitest'
import { SimEngine } from '../simulation/engine'

const drive = (e: SimEngine, minutes: number) => {
  const acc = { v: 0 }
  for (let i = 0; i < minutes; i++) e.step(1, acc)
}

// Memories and events are z.any() in WorldSchema, so a hand-edited save
// can hold a null entry that passes validation — the agent check in
// restore() does not cover them. log()'s 500-event pruning reads
// m.sourceEventId and ev.id on every entry, so the first prune after
// the load threw a TypeError inside step() and crashed the sim. A
// corrupt row must be dropped at load, not trusted into the live world.
describe('restore() drops malformed memories and events', () => {
  it('a save whose memories contain a null entry does not crash the sim after load', () => {
    const src = new SimEngine(42)
    drive(src, 500)
    const snap: any = src.snapshot()
    snap.memories = [null, ...snap.memories.slice(0, 3)]
    const e = new SimEngine(7)
    expect(() => e.restore(snap)).not.toThrow()
    expect(e.memories).not.toContain(null)
    // 200 minutes is not enough to trip the 500-event pruning in log(),
    // which is the code that reads m.sourceEventId — drive past it.
    expect(() => drive(e, 3000)).not.toThrow()
  })
  it('a save whose events contain a null entry does not crash the sim after load', () => {
    const src = new SimEngine(42)
    drive(src, 500)
    const snap: any = src.snapshot()
    snap.events = [null, ...snap.events.slice(0, 3)]
    const e = new SimEngine(7)
    expect(() => e.restore(snap)).not.toThrow()
    expect(e.events).not.toContain(null)
    // Same 500-event pruning path as the memories case: log() reads
    // ev.id on every entry once the cap trips.
    expect(() => drive(e, 3000)).not.toThrow()
  })
  it('a well-formed save keeps its memories and events intact', () => {
    const src = new SimEngine(42)
    drive(src, 500)
    const snap: any = src.snapshot()
    const memCount = snap.memories.length, evCount = snap.events.length
    const e = new SimEngine(7)
    e.restore(snap)
    expect(e.memories.length).toBe(memCount)
    expect(e.events.length).toBe(evCount)
  })
})
