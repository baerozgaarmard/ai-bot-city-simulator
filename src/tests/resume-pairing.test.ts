import { describe, it, expect } from 'vitest'
import { SimEngine } from '../simulation/engine'
import { LOCATIONS } from '../simulation/map'

const drive = (e: SimEngine, minutes: number) => {
  const acc = { v: 0 }
  for (let i = 0; i < minutes; i++) e.step(1, acc)
}

// Two agents at the park entrance, every other agent parked Idle at home
// so nobody else can pair with either of them during the probe.
const stagePair = (e: SimEngine, aState: 'Socializing' | 'Idle', aCooldown: number) => {
  const park = LOCATIONS.find(l => l.id === 'park')!
  const [a, b] = e.agents
  for (const x of [a, b]) {
    x.pos = { ...park.entrance }
    x.path = []
    x.dest = { ...park.entrance }
    x.state = 'Socializing'
    x.activity = 'Socializing'
    x.goal = 'Socialize'
    x.activityUntil = e.simMinutes + 30
    x.cooldownUntil = 0
    ;(x as any)._target = { loc: park, state: 'Socializing', activity: 'Socializing', durationMin: 30 }
  }
  // A is the agent under test: either already Socializing, or Idle on its
  // post-conversation break with the window still open (it resumes
  // Socializing once the cooldown passes).
  a.state = aState
  a.activity = aState === 'Idle' ? 'Finished conversation' : 'Socializing'
  a.cooldownUntil = aCooldown
  if (aState === 'Idle') a.dest = null
  for (const o of e.agents.slice(2)) {
    o.pos = { x: 6, y: 12 }
    o.state = 'Idle'
    o.path = []
    o.dest = null
    o.activityUntil = 0
    o.cooldownUntil = 0
    ;(o as any)._target = undefined
  }
  return { a, b }
}

describe('co-located Socializing agents pair even without arriving', () => {
  it('two Socializing agents standing at the same entrance pair within a minute', () => {
    const e = new SimEngine(42)
    drive(e, 5)
    // Pairing used to happen only in arrive(), so two agents that ended
    // up Socializing at the same entrance without arriving stood there
    // in silence for their whole 30-minute window — 731 agent-minutes
    // of exactly that in a 10k-minute probe, 17% of all social time.
    const { a, b } = stagePair(e, 'Socializing', 0)
    const interactionsBefore = e.interactions
    drive(e, 2)
    expect(a.state).toBe('Conversing')
    expect(b.state).toBe('Conversing')
    expect(e.interactions).toBe(interactionsBefore + 1)
  })

  it('a resumed agent pairs with the Socializing agent standing at the same entrance', () => {
    const e = new SimEngine(42)
    drive(e, 5)
    // After a conversation ends the released agent goes Idle for a
    // 5-minute break, then resumes Socializing at the same entrance.
    // The resume used to set the state directly without ever running
    // the pairing step, so it never talked to the agent already
    // standing there for the rest of its window.
    const { a, b } = stagePair(e, 'Idle', e.simMinutes + 1)
    const interactionsBefore = e.interactions
    drive(e, 10)
    expect(a.state).toBe('Conversing')
    expect(b.state).toBe('Conversing')
    expect(e.interactions).toBe(interactionsBefore + 1)
  })

  it('long-run: no unblocked co-located pair stands in silence', () => {
    const e = new SimEngine(20261028)
    let unblockedDead = 0
    const acc = { v: 0 }
    for (let m = 0; m < 10000; m++) {
      e.step(1, acc)
      const byEntrance = new Map<string, string[]>()
      for (const a of e.agents) {
        if (a.state !== 'Socializing') continue
        const key = `${Math.round(a.pos.x)},${Math.round(a.pos.y)}`
        const ids = byEntrance.get(key) ?? []
        ids.push(a.id)
        byEntrance.set(key, ids)
      }
      for (const ids of byEntrance.values()) {
        if (ids.length < 2) continue
        // A pair inside its 30-minute no-repeat window is silent by
        // design (just-finished ex-partners); anything else must pair.
        // Blocked means either direction of the window is still open.
        const lt = (e as any).lastTalk as Map<string, Map<string, number>>
        const unblocked = ids.some((id, i) =>
          ids.some((other, j) => i !== j
            && (lt.get(id)?.get(other) ?? 0) <= e.simMinutes
            && (lt.get(other)?.get(id) ?? 0) <= e.simMinutes))
        if (unblocked) unblockedDead++
      }
    }
    expect(unblockedDead).toBe(0)
  })
})
