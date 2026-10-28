# V4 asset generation — development-time only

This directory is a DEVELOPMENT-TIME pipeline. It is not part of the deployed
website, it is not loaded by Phaser, and no model runs at runtime. The site
loads ordinary local PNG files through the existing asset loader
(`src/city/textures.ts`, `src/city/PhaserScene.ts`).

## Status — read this first

- V3 (live) buildings in `public/v3-assets/` were generated with an external
  image-generation tool in V3. They are NOT Hugging Face local generations.
  Do not relabel them as HF-local.
- **No Hugging Face asset was generated in the Muse VM.** The VM has 2 CPU
  cores, ~3.6 GB RAM available, no GPU, no CUDA, no torch (see
  `ENVIRONMENT_AUDIT.md`). Even the smallest distilled SD model needs
  ~8 GB RAM + 12 CPU cores for slow CPU generation (per the tiny-SD docs),
  so local generation was stopped before downloading multi-GB weights.
- This pipeline is built to run on the user's Windows machine:
  Intel 5 210H, NVIDIA RTX 4050 (6 GB VRAM), 16 GB RAM. See
  `RUN_ON_WINDOWS_GPU.md`.

## Layout

- `model-config.json` — chosen base model + LoRA, revisions, licenses,
  and the 6 GB VRAM memory settings. Edit this, not scattered constants.
- `prompts/style-spec.md` — the one style spec every prompt must follow.
- `prompts/assets.json` — one entry per asset: id, category, prompt,
  negative prompt, seed, size, steps, guidance, output filename.
- `generate.py` — loads the model once, generates every asset in
  `prompts/assets.json` with deterministic seeds, writes
  `outputs/raw/<id>.png` plus `outputs/raw/<id>.json` (generation record).
- `validate_assets.py` — checks PNG integrity, dimensions, alpha channel,
  cell slicing for sheets, and builds a contact sheet. Exits non-zero on
  any failure. Never accept an asset because its format is correct.
- `asset-manifest.json` — the V4 manifest template. Status starts as
  `pending` for every V4 asset. Only assets that pass validation and a
  human visual check move to `approved`, and only approved assets are
  copied to `public/v4-assets/` and wired into the Phaser loader.
- `outputs/` — raw / rejected / approved subdirectories (gitignored).
  Model weights live OUTSIDE this repo, in the Hugging Face cache
  (`HF_HOME`), never in `public/` and never in git.

## Workflow on the GPU machine

1. Follow `RUN_ON_WINDOWS_GPU.md` to install torch (CUDA) + diffusers.
2. `python generate.py` — resumable: assets already in `outputs/raw/`
   with a matching record are skipped unless `--force` is passed.
3. `python validate_assets.py` — fix or reject failures, do not
   integrate a failed asset.
4. Visually inspect `outputs/contact-sheet.png` side by side.
5. Copy approved assets to `public/v4-assets/`, update
   `src/city/textures.ts` manifest + `PhaserScene.preload()`, run
   `npm run build && npm test && npm run test:e2e`, then commit/push/deploy.

## Rules that must not be broken

- Never put model weights, raw rejected outputs, or temp files in git
  or in the Vercel deployment. Only final approved PNGs + scripts + docs.
- Never white-key an entire image to fake transparency: white window
  frames, highlights, and clothing are legitimate artwork. Prefer
  pipeline alpha; if a background must be removed, use a segmentation
  method, inspect edge halos, and reject damaged silhouettes.
- Never slice a sheet by assuming equal cells: validate cell count,
  dimensions, and that no neighbouring character crosses a boundary.
- Character identity across directions is NOT guaranteed by a text
  prompt. Verify it in the contact sheet; if a sheet mixes identities,
  reject it and generate individual poses instead.
- Collision/navigation geometry stays independent of decorative sprite
  size. Do not change `src/simulation/map.ts` walkability for art.
