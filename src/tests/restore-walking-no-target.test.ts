import { describe, it, expect } from 'vitest'
import { SimEngine } from '../simulation/engine'

// Regression: restore() drops a malformed _target, but the stale-path
// repair kept a valid route to a valid destination, so a restored
// Walking agent arrived with no target — and arrive() set state Idle
// while leaving dest, the walking activity and the dropped target's
// timers in place, so the agent sat Idle showing a destination (the
// stale-dest invariant the long-run sweep forbids) until its stale
// cooldown passed. Found in the 2026-11-27 run-4 bug hunt.
describe('restore a Walking agent with no activity target', () => {
  it('arrives Idle with no destination and picks a fresh goal at once', () => {
    const e = new SimEngine(42)
    // Fresh engine: agents picked goals at construction; find one Walking.
    const walking = e.agents.find(a => a.state === 'Walking')
    expect(walking).toBeDefined()
    const snap = e.snapshot()
    const entry = (snap.agents as any[]).find(a => a.id === walking!.id)
    expect(entry.path.length).toBeGreaterThan(0)
    expect(entry.dest).not.toBeNull()
    // A hand-edited save with a malformed _target: restore() drops it.
    delete entry._target
    // Timers from the dropped target, like a hand-edited save could hold.
    entry.activityUntil = snap.simMinutes + 200
    entry.cooldownUntil = snap.simMinutes + 5

    const e2 = new SimEngine(1)
    e2.restore(JSON.parse(JSON.stringify(snap)))
    const a = e2.agents.find(x => x.id === walking!.id)!
    const acc = { v: 0 }
    let idleWithDest = 0
    for (let i = 0; i < 300; i++) {
      e2.step(1, acc)
      if (a.state === 'Idle' && a.dest !== null) idleWithDest++
    }
    expect(idleWithDest).toBe(0)
    // And it did not idle on the dropped target's timers: it picked a
    // fresh goal and completed at least one within the 300 minutes.
    expect(a.recentActions.length).toBeGreaterThan(0)
  }, 60000)
})
