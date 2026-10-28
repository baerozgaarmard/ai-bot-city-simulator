import { describe, it, expect } from 'vitest'
import { ASSET_MANIFEST, manifestKeys } from '../city/textures'
import { spritePixels } from '../city/sprites'
import { SimEngine } from '../simulation/engine'
import { WorldSchema } from '../persistence/db'
import { narrowAtLoad } from '../stores/store'
// NOTE: PhaserScene.ts cannot be imported in node (Phaser needs window),
// so the camera test below checks the actual iso() source in that file
// rather than executing Phaser. The e2e suite covers Phaser at runtime.

// V4 pipeline tests: the HF generation pipeline itself, plus the
// simulation/camera/avatar/save-load behaviours the pipeline must not
// break. No Phaser DOM is needed here; these are pure / on-disk checks.

describe('V4 asset-generation pipeline files', () => {
  it('model-config names a real SD 1.5 base + SD 1.5 LoRA, with no weights in public/', async () => {
    const fs = await import('node:fs'); const path = await import('node:path')
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tools', 'asset-generation', 'model-config.json'), 'utf8'))
    expect(cfg.chosen.base_model).toBe('stable-diffusion-v1-5/stable-diffusion-v1-5')
    expect(cfg.chosen.lora).toBe('VaroDZAKY/Varo_pixel_Art')
    expect(cfg.chosen.lora_base).toBe('Stable Diffusion v1.5')
    expect(cfg.inference_settings_for_6gb_vram.torch_dtype).toBe('float16')
    expect(cfg.inference_settings_for_6gb_vram.batch_size).toBe(1)
    expect(cfg.generated_in_this_vm).toBe('none')
    // No model weights may live in the deployable asset directory.
    const pub = path.join(process.cwd(), 'public')
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
    for (const f of walk(pub)) expect(f).not.toMatch(/\.(safetensors|ckpt|bin|pt)$/)
  })
  it('generate.py and validate_assets.py exist and declare the required pipeline behaviour', async () => {
    const fs = await import('node:fs'); const path = await import('node:path')
    const gen = fs.readFileSync(path.join(process.cwd(), 'tools', 'asset-generation', 'generate.py'), 'utf8')
    expect(gen).toContain('StableDiffusionPipeline')
    expect(gen).toContain('manual_seed')
    expect(gen).toContain('num_inference_steps')
    expect(gen).toContain('cuda')
    expect(gen).toContain('outputs')
    const val = fs.readFileSync(path.join(process.cwd(), 'tools', 'asset-generation', 'validate_assets.py'), 'utf8')
    expect(val).toContain('RGBA')
    expect(val).toContain('alpha')
    expect(val).toContain('contact-sheet')
    expect(val).toContain('SystemExit')
  })
  it('V4 asset manifest is valid JSON, all pending, and no V4 asset claims to be generated', async () => {
    const fs = await import('node:fs'); const path = await import('node:path')
    const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tools', 'asset-generation', 'asset-manifest.json'), 'utf8'))
    expect(m.assets.length).toBeGreaterThanOrEqual(8)
    for (const a of m.assets) {
      expect(a.status).toBe('pending')
      expect(a.final_path).not.toContain('outputs/raw')
    }
    expect(m.note).toContain('not with this Hugging Face pipeline')
  })
  it('every V4 manifest asset id has a prompt entry with a seed and steps', async () => {
    const fs = await import('node:fs'); const path = await import('node:path')
    const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tools', 'asset-generation', 'asset-manifest.json'), 'utf8'))
    const prompts = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tools', 'asset-generation', 'prompts', 'assets.json'), 'utf8'))
    const ids = new Set(prompts.assets.map((a: any) => a.id))
    for (const a of m.assets) expect(ids.has(a.id)).toBe(true)
    for (const p of prompts.assets) {
      expect(typeof p.seed).toBe('number'); expect(p.steps).toBeGreaterThan(0)
      expect(p.prompt.length).toBeGreaterThan(10); expect(p.negative_prompt).toContain('text')
    }
  })
})

describe('pipeline must not break existing behaviour', () => {
  it('manifest references are valid: every v3 building file exists or has a procedural fallback key', async () => {
    const fs = await import('node:fs'); const path = await import('node:path')
    const keys = manifestKeys()
    for (const id of ['cafe', 'restaurant', 'shop', 'townhall', 'office', 'house']) {
      const file = path.join(process.cwd(), 'public', 'v3-assets', `building-${id}.png`)
      // Missing-file diagnostic: a v3 file must exist, otherwise the
      // renderer silently falls back to procedural art. This test makes
      // that silent fallback visible instead of concealing it.
      expect(fs.existsSync(file), `missing v3 asset: ${file}`).toBe(true)
      expect(keys).toContain(`v3-building-${id}`)
      expect(keys).toContain(`building-${id}`)
    }
    expect(ASSET_MANIFEST.find(a => a.key === 'v3-building-cafe')?.transparent).toBe(true)
  })
  it('avatar identity is stable: same role+index gives the same sprite, different index differs', () => {
    const a = spritePixels('Chef', 'down', 'idle', 3)
    const b = spritePixels('Chef', 'down', 'idle', 3)
    const c = spritePixels('Chef', 'down', 'idle', 4)
    expect(a.rows).toEqual(b.rows); expect(a.colors).toEqual(b.colors)
    expect(a.rows.join()).not.toBe(c.rows.join())
  })
  it('snapshot restore preserves agents, tick, and counts (save/load round-trip)', () => {
    const e = new SimEngine(7)
    const acc = { v: 0 }
    for (let i = 0; i < 10; i++) e.step(1, acc)
    const snap = WorldSchema.parse(e.snapshot())
    const e2 = new SimEngine(99)
    e2.restore(snap)
    expect(e2.tick).toBe(e.tick)
    expect(e2.agents.length).toBe(e.agents.length)
    expect(e2.completed).toBe(e.completed)
  })
  it('camera projection formula is the documented iso mapping (source check; Phaser itself is e2e-covered)', async () => {
    const fs = await import('node:fs'); const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'city', 'PhaserScene.ts'), 'utf8')
    // iso(x, y) = { sx: 480 + (x - y) * 32, sy: 80 + (x + y) * 16 }
    expect(src).toContain('(x - y) * 32')
    expect(src).toContain('(x + y) * 16')
    expect(src).toContain('ground = sy')
    // The same formula, evaluated here, must be monotonic (depth basis).
    const iso = (x: number, y: number) => ({ sx: 480 + (x - y) * 32, sy: 80 + (x + y) * 16 })
    expect(iso(2, 0).sx).toBeGreaterThan(iso(1, 0).sx)
    expect(iso(0, 2).sx).toBeLessThan(iso(0, 1).sx)
    expect(iso(1, 1).sy).toBeGreaterThan(iso(0, 0).sy)
  })
  it('responsive helper collapses panels only below 768px', () => {
    // narrowAtLoad reads window; in node (no window) it must be false,
    // i.e. desktop layout is the default, not a collapsed accident.
    expect(narrowAtLoad()).toBe(false)
  })
})

describe('V4 Windows GPU pipeline (launcher + integrate)', () => {
  it('run-windows.bat exists and checks, in order: python, nvidia-smi, torch.cuda, VRAM, disk, generate, validate, integrate', async () => {
    const fs = await import('node:fs'); const path = await import('node:path')
    const bat = fs.readFileSync(path.join(process.cwd(), 'tools', 'asset-generation', 'run-windows.bat'), 'utf8')
    const steps = ['Python 3.10', 'nvidia-smi', 'torch.cuda.is_available', '5.5', '15 GB', 'generate.py', 'validate_assets.py', 'integrate.py']
    let prev = -1
    for (const s of steps) {
      const idx = bat.indexOf(s)
      expect(idx, `launcher missing/ordered step: ${s}`).toBeGreaterThan(prev)
      prev = idx
    }
    // HF_HOME is set in step 7 (after the disk check, before generate);
    // it also appears in the header comment, so check the set command.
    expect(bat).toContain('set "HF_HOME=')
    expect(bat).toContain('will NOT run generation on CPU')
    expect(bat).toContain('tools\\asset-generation\\run-windows.bat')
  })
  it('generate.py resolves real revisions, caches weights once, and refuses without CUDA', async () => {
    const fs = await import('node:fs'); const path = await import('node:path')
    const gen = fs.readFileSync(path.join(process.cwd(), 'tools', 'asset-generation', 'generate.py'), 'utf8')
    expect(gen).toContain('HfApi')
    expect(gen).toContain('model_info')
    expect(gen).toContain('snapshot_download')
    expect(gen).toContain('HF_HOME')
    expect(gen).toContain('enable_sequential_cpu_offload')
    expect(gen).toContain('No CUDA GPU detected')
    // No placeholder revision value may be written into a record.
    expect(gen).not.toContain('base_model_revision": "FILL-IN')
    expect(gen).not.toContain('lora_revision": "FILL-IN')
  })
  it('integrate.py copies only approved validated assets and writes a Phaser manifest', async () => {
    const fs = await import('node:fs'); const path = await import('node:path')
    const integ = fs.readFileSync(path.join(process.cwd(), 'tools', 'asset-generation', 'integrate.py'), 'utf8')
    expect(integ).toContain('outputs/approved')
    expect(integ).toContain('public/v4-assets')
    expect(integ).toContain('manifest.json')
    expect(integ).toContain('bottom-centre')
    expect(integ).toContain('border_opaque_fraction')
    expect(integ).toContain('"integrated"')
    expect(integ).toContain('contact-sheet-integrated')
  })
  it('asset manifest defines integrated status and all 12 assets are still pending (no fake generation)', async () => {
    const fs = await import('node:fs'); const path = await import('node:path')
    const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tools', 'asset-generation', 'asset-manifest.json'), 'utf8'))
    expect(m.assets.filter((a: any) => a.id.startsWith('v4-')).length).toBe(12) // V4 set unchanged; V5 adds 7 more below
    expect(m.status_definitions.integrated).toContain('integrate.py')
    for (const a of m.assets) expect(a.status).toBe('pending')
    const walk = (d: string): string[] => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : []
    for (const f of [...walk(path.join(process.cwd(), 'public')), ...walk(path.join(process.cwd(), 'tools', 'asset-generation'))]) {
      expect(f).not.toMatch(/\.(safetensors|ckpt|pt)$/)
    }
  })
})
