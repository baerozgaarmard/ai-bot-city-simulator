import { describe, it, expect } from 'vitest'
import { SimEngine } from '../simulation/engine'

const drive = (e: SimEngine, minutes: number) => {
  const acc = { v: 0 }
  for (let i = 0; i < minutes; i++) e.step(1, acc)
}

// restore() validated every agent entry but never looked at the
// world counters — and WorldSchema's z.number() accepts Infinity and
// -Infinity, so a hand-edited save with simMinutes Infinity passed
// the schema gate and loaded: the clock then read "NaN:NaN" forever
// (hour is NaN, so Sleep never fires and no day/night cycle ever
// runs), simMinutes++ stayed Infinity, and tick / completed /
// interactions stuck at Infinity too, so every counter display was
// permanently broken. A negative simMinutes failed the other way:
// hour -12 makes Sleep score 90 around the clock and the clock reads
// "-12:-20" for days. Live operation only ever produces finite counts
// >= 0, so anything else is refused up front, before anything is
// mutated — the same atomic refusal the agent checks give.
describe('restore() rejects malformed world counters', () => {
  it('a save with a non-finite simMinutes is refused', () => {
    const src = new SimEngine(42)
    drive(src, 200)
    const snap: any = src.snapshot()
    snap.simMinutes = Infinity
    const e = new SimEngine(7)
    expect(() => e.restore(snap)).toThrow('malformed counters')
  })
  it('a save with non-finite or negative counters is refused', () => {
    const src = new SimEngine(42)
    drive(src, 200)
    for (const bad of [
      { tick: Infinity },
      { tick: -1 },
      { simMinutes: -5000 },
      { completed: Infinity },
      { interactions: -Infinity },
      { seed: Infinity },
    ]) {
      const snap: any = src.snapshot()
      Object.assign(snap, bad)
      const e = new SimEngine(7)
      expect(() => e.restore(snap)).toThrow('malformed counters')
    }
  })
  it('the refused load leaves the live world untouched and running', () => {
    const src = new SimEngine(42)
    drive(src, 200)
    const snap: any = src.snapshot()
    snap.simMinutes = Infinity
    const e = new SimEngine(7)
    const before = e.agents.map(a => a.id)
    const simBefore = e.simMinutes
    const completedBefore = e.completed
    expect(() => e.restore(snap)).toThrow('malformed counters')
    expect(e.agents.map(a => a.id)).toEqual(before)
    expect(e.simMinutes).toBe(simBefore)
    drive(e, 100)
    expect(e.simMinutes).toBe(simBefore + 100)
    expect(e.completed).toBeGreaterThan(completedBefore)
    expect(e.timeStr()).toMatch(/^\d{2}:\d{2}$/)
  })
  it('a well-formed save still loads and its clock advances', () => {
    const src = new SimEngine(42)
    drive(src, 200)
    const snap: any = src.snapshot()
    const e = new SimEngine(7)
    e.restore(snap)
    expect(e.simMinutes).toBe(snap.simMinutes)
    expect(e.tick).toBe(snap.tick)
    drive(e, 100)
    expect(e.simMinutes).toBe(snap.simMinutes + 100)
    expect(e.timeStr()).toMatch(/^\d{2}:\d{2}$/)
  })
})
