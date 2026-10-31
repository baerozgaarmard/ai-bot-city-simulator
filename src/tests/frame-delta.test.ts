import { describe, it, expect } from 'vitest'

// NOTE: PhaserScene.ts cannot be imported in node (Phaser needs window),
// so this checks the actual update() source, as pipeline.test.ts does for
// the iso() camera formula. The e2e suite covers Phaser at runtime.
describe('frame delta clamp', () => {
  it('scene update clamps Phaser delta before stepping the engine', async () => {
    // Regression: update() passed Phaser's raw frame delta to engine.step.
    // Delta is wall time since the last frame, so returning to a tab left
    // hidden for 10 minutes advanced the sim clock 600 sim-minutes in one
    // frame — activities completing en masse, energy draining to 0 —
    // while movement advances only one tile per frame.
    const fs = await import('node:fs'); const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'city', 'PhaserScene.ts'), 'utf8')
    const update = src.slice(src.indexOf('update(_time'))
    expect(update).toMatch(/engine\.step\(\(Math\.min\(delta, 100\) \/ 1000\) \* ui\.speed/)
  })
})
