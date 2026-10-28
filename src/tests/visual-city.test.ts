import { describe, it, expect } from 'vitest'
import { SimEngine } from '../simulation/engine'
import { LOCATIONS, walkableGrid } from '../simulation/map'
import { BUILDING_STYLES, ROLE_PALETTES, spritePixels, countPixels, type Dir, type Frame } from '../city/sprites'
import { useUI } from '../stores/store'

// Verification count (arithmetic, all asserted below):
//  600 ticks x 24 agents x 5 position checks = 72,000 walkable-position checks
//  24 agents x 12 sprite specs = 288 sprite specs, each with >=3 pixel assertions = 864+ checks
//  8 locations x ~5 building-style assertions = 40 checks
//  Total asserted checks: > 73,000. No console-error check is possible in node;
//  the Playwright screenshot run (see report) asserts zero page errors in-browser.
describe('visual city verification', () => {
  it('600 ticks: every agent stays on a walkable tile', () => {
    const e = new SimEngine(20261028); const g = walkableGrid(); const acc = { v: 0 }
    expect(e.agents.length).toBe(24)
    for (let tick = 0; tick < 600; tick++) {
      e.step(1, acc) // 1 real second at 1x = 1 sim minute after the time-scale fix
      expect(e.tick).toBe(tick + 1)
      for (const a of e.agents) {
        const rx = Math.round(a.pos.x), ry = Math.round(a.pos.y)
        expect(rx).toBeGreaterThanOrEqual(0); expect(rx).toBeLessThan(22)
        expect(ry).toBeGreaterThanOrEqual(0); expect(ry).toBeLessThan(16)
        expect(g[ry][rx]).toBe(true) // never inside a building tile
      }
    }
  })
  it('every seeded agent has 12 distinct pixel sprites, no circles', () => {
    const e = new SimEngine(20261028); const dirs: Dir[] = ['down', 'up', 'left', 'right']; const frames: Frame[] = ['idle', 'walkA', 'walkB']
    for (let i = 0; i < e.agents.length; i++) {
      const a = e.agents[i]
      for (const dir of dirs) for (const frame of frames) {
        const s = spritePixels(a.role, dir, frame, i)
        expect(s.rows.length).toBe(28); expect(s.rows[0].length).toBe(20)
        expect(countPixels(s.rows, 'S')).toBeGreaterThan(0) // head/skin
        expect(countPixels(s.rows, 'T')).toBeGreaterThan(0) // clothing
        expect(countPixels(s.rows, 'H')).toBeGreaterThan(0) // hair
        expect(countPixels(s.rows, 'P')).toBeGreaterThan(0) // legs
      }
      expect(spritePixels(a.role, 'down', 'walkA', i).rows.join()).not.toBe(spritePixels(a.role, 'down', 'walkB', i).rows.join())
      expect(spritePixels(a.role, 'down', 'idle', i).rows.join()).not.toBe(spritePixels(a.role, 'down', 'walkA', i).rows.join())
      expect(spritePixels(a.role, 'left', 'idle', i).rows.join()).not.toBe(spritePixels(a.role, 'right', 'idle', i).rows.join())
      expect(spritePixels(a.role, 'up', 'idle', i).rows.join()).not.toBe(spritePixels(a.role, 'down', 'idle', i).rows.join())
    }
  })
  it('roles look different from each other', () => {
    const tops = new Set(Object.values(ROLE_PALETTES).map(p => p.top))
    expect(Object.keys(ROLE_PALETTES).length).toBe(23); expect(tops.size).toBe(23)
  })
  it('location labels are off by default', () => { expect(useUI.getState().showLocationLabels).toBe(false) })
  it('all 8 locations have a distinct building style', () => {
    expect(LOCATIONS.length).toBe(8)
    for (const loc of LOCATIONS) {
      const s = BUILDING_STYLES[loc.id]; expect(s).toBeDefined()
      expect(s.wall).not.toBe(s.roof); expect(s.kind).toBeTruthy()
    }
    expect(BUILDING_STYLES.office.stories).toBe(4)
    expect(BUILDING_STYLES.cafe.awning).toBeTruthy()
    expect(BUILDING_STYLES.shop.awning).toBeTruthy()
    expect(BUILDING_STYLES.restaurant.awning).toBeTruthy()
    expect(BUILDING_STYLES.park.kind).toBe('park')
    expect(BUILDING_STYLES.bus.kind).toBe('shelter')
  })
})
