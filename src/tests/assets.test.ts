import { describe, it, expect } from 'vitest'
import { ASSET_MANIFEST, manifestKeys } from '../city/textures'
import { BUILDING_STYLES, spritePixels } from '../city/sprites'
import { SimEngine } from '../simulation/engine'

describe('asset manifest', () => {
  it('has unique keys, valid sizes, and covers every building, tree, vehicle, and prop', () => {
    const keys = manifestKeys()
    expect(new Set(keys).size).toBe(keys.length)
    for (const a of ASSET_MANIFEST) { expect(a.w).toBeGreaterThan(0); expect(a.h).toBeGreaterThan(0); expect(a.transparent).toBe(true) }
    for (const id of Object.keys(BUILDING_STYLES)) {
      if (id === 'park' || id === 'residential') continue
      expect(keys).toContain(`building-${id}`)
    }
    expect(keys).toContain('building-apartment'); expect(keys).toContain('building-house')
    for (const k of ['oak', 'pine', 'blossom']) expect(keys).toContain(`tree-${k}`)
    for (const k of ['car-red', 'car-blue', 'van']) expect(keys).toContain(`vehicle-${k}`)
    for (const k of ['bench', 'lamp', 'sign', 'fountain', 'flowerbed', 'cafe-table', 'bus-shelter']) expect(keys).toContain(`prop-${k}`)
    for (const k of ['grass', 'paving', 'asphalt-h', 'asphalt-v', 'crosswalk', 'park']) expect(keys).toContain(`tile-${k}`)
  })
  it('character sprites are 20x28 with transparent corners and distinct walk frames', () => {
    const e = new SimEngine(1)
    for (let i = 0; i < e.agents.length; i++) {
      const s = spritePixels(e.agents[i].role, 'down', 'idle', i)
      expect(s.rows.length).toBe(28); expect(s.rows[0].length).toBe(20)
      expect(s.rows[0][0]).toBe('.'); expect(s.rows[27][0]).toBe('.')
      expect(spritePixels(e.agents[i].role, 'down', 'walkA', i).rows.join()).not.toBe(spritePixels(e.agents[i].role, 'down', 'walkB', i).rows.join())
    }
  })
})
describe('simulation liveness (idle-bug regression)', () => {
  it('agents leave Idle immediately, and after 300 sim minutes some activities complete with events', () => {
    const e = new SimEngine(20261028)
    expect(e.agents.some(a => a.state !== 'Idle')).toBe(true)
    const acc = { v: 0 }
    for (let i = 0; i < 300; i++) e.step(1, acc)
    expect(e.tick).toBe(300)
    expect(e.completed).toBeGreaterThan(0)
    expect(e.events.length).toBeGreaterThan(0)
    expect(e.agents.some(a => a.state !== 'Idle')).toBe(true)
  })
  it('one real second at 1x advances exactly one sim minute', () => {
    const e = new SimEngine(5); const acc = { v: 0 }; e.step(1, acc); expect(e.tick).toBe(1); e.step(1, acc); expect(e.tick).toBe(2)
  })
})
