import { describe, it, expect } from 'vitest'
import { SimEngine } from '../simulation/engine'

// Per-agent goal coverage over 30k minutes on four seeds: every agent
// spends time in every activity state and converses at least once.
// Existing tests cover shop/commute/socialize per agent; this is the
// same dead-goal check for Work, Eat, Rest, Sleep and for conversation
// participation, which no test counted before. Added in the 2026-11-27
// run-4 bug hunt (it passed — kept as the guard for this goal class).
describe('per-agent goal coverage', () => {
  it('every agent works, eats, rests, sleeps and converses', () => {
    const goals = ['Work', 'Eat', 'Rest', 'Sleep', 'Socialize', 'Shop', 'Commute']
    for (const seed of [1, 42, 777, 20261028]) {
      const e2 = new SimEngine(seed)
      const acc2 = { v: 0 }
      const minutes = new Map<string, Map<string, number>>()
      const convMin = new Map<string, number>()
      for (let i = 0; i < 30000; i++) {
        e2.step(1, acc2)
        for (const a of e2.agents) {
          let m = minutes.get(a.id); if (!m) { m = new Map(); minutes.set(a.id, m) }
          m.set(a.state, (m.get(a.state) ?? 0) + 1)
          if (a.state === 'Conversing') convMin.set(a.id, (convMin.get(a.id) ?? 0) + 1)
        }
      }
      const report: string[] = []
      for (const a of e2.agents) {
        const m = minutes.get(a.id)!
        const missing = goals.filter(g => {
          const state = g === 'Work' ? 'Working' : g === 'Eat' ? 'Eating' : g === 'Rest' ? 'Resting' : g === 'Sleep' ? 'Sleeping' : g === 'Socialize' ? 'Socializing' : g === 'Shop' ? 'Shopping' : 'Commuting'
          return (m.get(state) ?? 0) === 0
        })
        if (missing.length) report.push(`${a.name} never in state for: ${missing.join(',')}`)
        if ((convMin.get(a.id) ?? 0) === 0) report.push(`${a.name} never Conversing in 30k min (socializing ${(m.get('Socializing') ?? 0)} min)`)
      }
      expect(report).toEqual([])
    }
  }, 600000)
})
