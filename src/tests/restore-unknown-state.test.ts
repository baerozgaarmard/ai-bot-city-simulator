import { describe, it, expect } from 'vitest'
import { SimEngine } from '../simulation/engine'

const drive = (e: SimEngine, minutes: number) => {
  const acc = { v: 0 }
  for (let i = 0; i < minutes; i++) e.step(1, acc)
}

const VALID_STATES = ['Idle', 'Walking', 'Commuting', 'Working', 'Eating', 'Resting', 'Socializing', 'Shopping', 'Waiting', 'Sleeping', 'Conversing']

// restore() validated that state is a string, but not that it is a
// state the engine can ever produce: a hand-edited save with state
// 'Dancing' loaded, and the agent then stood in the bogus state for
// the whole activity window (99 minutes in a probe) — the exhaustion
// interrupt never fired for it, so it sat at 0 energy for 101 of 120
// minutes, and when the window passed complete() logged "completed
// work" for a shift it never worked. A genuine Working agent in the
// same setup is interrupted after 19 minutes and sent home to rest.
// An unknown state is a malformed agent entry, rejected atomically
// like a missing personality or a bad workplace.
describe('restore() rejects an unknown agent state', () => {
  it('a save with state Dancing throws and the live world keeps running', () => {
    const src = new SimEngine(42)
    drive(src, 200)
    const snap: any = src.snapshot()
    const a0 = snap.agents[0]
    a0.state = 'Dancing'
    a0.activity = 'Dancing at the park'
    a0.goal = 'Work'
    a0.activityUntil = snap.simMinutes + 100
    a0.energy = 5
    const e = new SimEngine(7)
    drive(e, 50)
    const liveSimMinutes = e.simMinutes
    const liveFirstId = e.agents[0].id
    expect(() => e.restore(snap)).toThrow('malformed agent entry')
    // Atomic refusal: the pre-load world is untouched, not half-loaded.
    expect(e.simMinutes).toBe(liveSimMinutes)
    expect(e.agents[0].id).toBe(liveFirstId)
    expect(e.agents[0].state).not.toBe('Dancing')
  })
  it('every state live operation can produce still loads', () => {
    for (const state of VALID_STATES) {
      const src = new SimEngine(42)
      const snap: any = src.snapshot()
      snap.agents[0].state = state
      const e = new SimEngine(7)
      expect(() => e.restore(snap)).not.toThrow()
      // And the restored world runs without throwing on the next ticks.
      drive(e, 30)
    }
  })
  it('a well-formed save keeps its states unchanged', () => {
    const src = new SimEngine(42)
    drive(src, 200)
    const snap: any = src.snapshot()
    const before = snap.agents.map((a: any) => a.state)
    const e = new SimEngine(7)
    e.restore(snap)
    expect(e.agents.map(a => a.state)).toEqual(before)
  })
})
