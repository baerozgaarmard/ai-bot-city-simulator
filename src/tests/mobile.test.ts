import { describe, it, expect } from 'vitest'
import { narrowAtLoad } from '../stores/store'

describe('narrowAtLoad', () => {
  it('collapses panels below 768px and not at/above it', () => {
    ;(globalThis as any).window = { innerWidth: 390 }
    expect(narrowAtLoad()).toBe(true)
    ;(globalThis as any).window = { innerWidth: 768 }
    expect(narrowAtLoad()).toBe(false)
    delete (globalThis as any).window
    expect(narrowAtLoad()).toBe(false)
  })
})
