# Run V4 generation on the Windows GPU machine

Target hardware: Intel 5 210H, NVIDIA RTX 4050 (6 GB VRAM), 16 GB RAM,
Windows. Do NOT run this on the Muse VM (no GPU, 2 cores, ~3.6 GB RAM
free) — see ENVIRONMENT_AUDIT.md.

## 1. Install (PowerShell, from the repo root)

```powershell
py -3.12 -m venv .venv-v4
.\.venv-v4\Scripts\Activate.ps1
pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cu121
pip install -r tools\asset-generation\requirements.txt
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

The last line must print a torch version, `True`, and the RTX 4050.
If it prints `False`, stop: fix the NVIDIA driver / CUDA install first,
do not start downloading weights.

Check free disk first: the SD 1.5 fp16 weights are ~4.27 GB, plus the
LoRA. Keep at least 10 GB free.

## 2. Verify licences before commercial use

- Base model `stable-diffusion-v1-5/stable-diffusion-v1-5`: reported as
  CreativeML OpenRAIL-M. Open the repo page and read its LICENSE file.
- LoRA `VaroDZAKY/Varo_pixel_Art`: **no licence was stated in the
  fetched model card.** Read the repo's licence/metadata before
  redistributing anything built with it. If no licence is found, treat
  the LoRA as unverified for commercial use and pick an alternative
  with a stated licence.

## 3. Generate (resumable, one image per batch, 512x512, fp16)

```powershell
cd tools\asset-generation
python generate.py
```

This writes `outputs\raw\<id>.png` + `outputs\raw\<id>.json` per asset.
Fill in `base_model_revision` / `lora_revision` in each record from the
`snapshot_download` output. Re-running skips already-generated assets
unless `--force` is passed. If a run OOMs on 6 GB, enable sequential
CPU offload in `model-config.json` (much slower) or reduce steps —
do not raise resolution or batch size.

Estimated time on an RTX 4050: seconds to a few minutes per 512x512
image at 28 steps. If a single image takes tens of minutes, stop and
check GPU utilisation — the run is probably on CPU.

## 4. Validate, inspect, approve

```powershell
python validate_assets.py
python validate_assets.py --sheet outputs\raw\v4-character-sheet.png --cols 4 --rows 3
```

Open `outputs\contact-sheet.png` and inspect every asset side by side:
perspective, scale, transparency, identity across character frames,
no text, no malformed doors/windows. Reject anything that fails —
move it to `outputs\rejected\` with a reason, do not integrate it.

## 5. Integrate (only approved assets)

1. Copy approved PNGs to `public\v4-assets\`.
2. Add `v4-building-<id>` entries to `src/city/textures.ts`
   (ASSET_MANIFEST) and preload them in `src/city/PhaserScene.ts`,
   following the existing `v3-building-*` pattern, with the
   procedural texture as fallback only if a file is missing — and
   log that missing-file case (do not silently ship a placeholder
   in production without a diagnostic).
3. Keep collision/navigation geometry in `src/simulation/map.ts`
   untouched. Keep registry/inspector avatars on the same character
   identity as the city sprites.
4. Run `npm run build`, `npm test`, `npm run test:e2e` — all must pass.
5. Screenshot default / close / follow / narrow views, compare
   against the V3 screenshots in `screenshots/`.
6. Commit only: approved PNGs, scripts, docs, manifest updates,
   tests. Never commit model weights, `outputs/raw/`, or temp files.
7. Push to `main` and deploy with the established Vercel CLI workflow,
   then verify the live URL with a fresh bundle hash.
