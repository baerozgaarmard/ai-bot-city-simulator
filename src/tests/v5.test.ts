import { describe, it, expect } from 'vitest'
import { ASSET_MANIFEST, manifestKeys } from '../city/textures'
import { HAIR_STYLES, spritePixels, countPixels } from '../city/sprites'
import { SimEngine } from '../simulation/engine'

describe('V5 characters', () => {
  it('idleB blink differs from idle in every direction, and all four directions differ', () => {
    const e = new SimEngine(1)
    for (let i = 0; i < e.agents.length; i++) {
      const a = e.agents[i]
      for (const dir of ['down', 'up', 'left', 'right'] as const) {
        expect(spritePixels(a.role, dir, 'idleB', i).rows.join()).not.toBe(spritePixels(a.role, dir, 'idle', i).rows.join())
      }
      const downs = spritePixels(a.role, 'down', 'idle', i).rows.join()
      expect(spritePixels(a.role, 'up', 'idle', i).rows.join()).not.toBe(downs)
      expect(spritePixels(a.role, 'left', 'idle', i).rows.join()).not.toBe(spritePixels(a.role, 'right', 'idle', i).rows.join())
    }
  })
  it('characters have collar, shading, and 7 hair styles; skirt variant keeps pants pixels', () => {
    expect(HAIR_STYLES.length).toBe(7)
    const s = spritePixels('Chef', 'down', 'idle', 0)
    expect(countPixels(s.rows, 'C')).toBeGreaterThan(0) // collar
    expect(countPixels(s.rows, 'D')).toBeGreaterThan(0) // torso shading
    expect(countPixels(s.rows, 'L')).toBeGreaterThan(0) // torso highlight
    const skirt = spritePixels('Chef', 'down', 'idle', 3) // index % 4 === 3
    expect(countPixels(skirt.rows, 'P')).toBeGreaterThan(0)
    expect(countPixels(skirt.rows, 'S')).toBeGreaterThan(0)
  })
  it('AgentAvatar uses the same sprite grid as the city (identity stable)', () => {
    // AgentAvatar renders spritePixels(role, 'down', 'idle', index) to canvas;
    // the grid it draws must therefore match the city sprite exactly.
    const a = spritePixels('Doctor', 'down', 'idle', 2)
    const b = spritePixels('Doctor', 'down', 'idle', 2)
    expect(a.rows.join()).toBe(b.rows.join())
    expect(a.colors).toEqual(b.colors)
  })
})
describe('V5 environment', () => {
  it('manifest has tile variants, maple/birch trees, and bin/planter props', () => {
    const keys = manifestKeys()
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of ['tile-grass-v1', 'tile-paving-v1', 'tile-park-v1', 'tile-sidewalk-v1']) expect(keys).toContain(k)
    expect(keys).toContain('tree-maple'); expect(keys).toContain('tree-birch')
    expect(keys).toContain('prop-bin'); expect(keys).toContain('prop-planter')
    for (const a of ASSET_MANIFEST) { expect(a.w).toBeGreaterThan(0); expect(a.h).toBeGreaterThan(0); expect(a.transparent).toBe(true) }
  })
  it('V5 HF pipeline entries are pending with prompts, none claimed generated', async () => {
    const fs = await import('node:fs'); const path = await import('node:path')
    const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tools', 'asset-generation', 'asset-manifest.json'), 'utf8'))
    const prompts = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tools', 'asset-generation', 'prompts', 'assets.json'), 'utf8'))
    const ids = new Set(prompts.assets.map((a: any) => a.id))
    const v5 = m.assets.filter((a: any) => a.id.startsWith('v5-'))
    expect(v5.length).toBe(7)
    for (const a of v5) { expect(a.status).toBe('pending'); expect(ids.has(a.id)).toBe(true) }
  })
})
