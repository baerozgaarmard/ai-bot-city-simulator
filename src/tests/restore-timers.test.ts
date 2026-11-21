import { describe, it, expect } from 'vitest'
import { SimEngine } from '../simulation/engine'

const drive = (e: SimEngine, minutes: number) => {
  const acc = { v: 0 }
  for (let i = 0; i < minutes; i++) e.step(1, acc)
}

// restore() checked that activityUntil, cooldownUntil and a saved
// _target's durationMin were finite, but never that they were on the
// restored timeline — so a hand-edited save with a timer a million
// minutes out loaded fine and then stranded the agent: a Resting
// agent never finished its rest (Resting has no exhaustion
// interrupt), an Eating agent never finished its meal, and an Idle
// agent never picked a new goal, while hunger still rose and energy
// still drained around it. Live operation only ever sets
// activityUntil up to 120 minutes out (a full night's sleep) and
// cooldownUntil up to 5 minutes out, so restore() clamps both — and
// the target duration arrive() turns into activityUntil — to twice
// the live maximum, and a bad timer can delay an agent by minutes,
// never strand it for days.
describe('restore() clamps far-future timers to the restored timeline', () => {
  it('a Resting agent with activityUntil a million minutes out finishes its rest', () => {
    const src = new SimEngine(42)
    const snap: any = src.snapshot()
    const a = snap.agents[0]
    a.state = 'Resting'; a.activity = 'Resting at home'
    a.activityUntil = snap.simMinutes + 1_000_000; a.cooldownUntil = 0
    a._target = undefined; a.path = []; a.dest = null
    const e = new SimEngine(7)
    e.restore(snap)
    expect(e.agents[0].activityUntil).toBe(e.simMinutes + 240)
    drive(e, 300)
    // The rest ends at the clamped time (240 minutes in), so the agent
    // completes it and moves on — it is not still in the same rest 300
    // minutes later, whatever it picked next.
    expect(e.agents[0].recentActions.length).toBeGreaterThan(0)
  })
  it('an Idle agent with cooldownUntil a million minutes out picks a new goal', () => {
    const src = new SimEngine(42)
    const snap: any = src.snapshot()
    const a = snap.agents[0]
    a.state = 'Idle'; a.activity = 'Deciding what to do next'
    a.activityUntil = 0; a.cooldownUntil = snap.simMinutes + 1_000_000
    a._target = undefined; a.path = []; a.dest = null; a.goal = 'Settle in'
    const e = new SimEngine(7)
    e.restore(snap)
    expect(e.agents[0].cooldownUntil).toBe(e.simMinutes + 30)
    drive(e, 500)
    expect(e.agents[0].goal).not.toBe('Settle in')
  })
  it('a saved activity target with a million-minute duration is clamped', () => {
    const src = new SimEngine(42)
    const snap: any = src.snapshot()
    const a = snap.agents[0]
    a.state = 'Eating'; a.activity = 'Eating'
    a.activityUntil = snap.simMinutes + 1_000_000; a.cooldownUntil = 0
    a.path = []; a.dest = null
    a._target = { loc: { id: 'restaurant', name: 'Restaurant', entrance: { x: 18, y: 5 } }, state: 'Eating', activity: 'Eating', durationMin: 1_000_000 }
    const e = new SimEngine(7)
    e.restore(snap)
    expect((e.agents[0] as any)._target.durationMin).toBe(240)
    drive(e, 500)
    expect(e.agents[0].state).not.toBe('Eating')
  })
  it('a normal save round-trips its timers untouched', () => {
    const src = new SimEngine(42)
    drive(src, 200)
    const snap: any = src.snapshot()
    const before = snap.agents.map((a: any) => [a.activityUntil, a.cooldownUntil])
    const e = new SimEngine(7)
    e.restore(snap)
    expect(e.agents.map(a => [a.activityUntil, a.cooldownUntil])).toEqual(before)
  })
})
