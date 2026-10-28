# Run V4 generation on the Windows GPU machine

Target hardware: Intel 5 210H, NVIDIA RTX 4050 (6 GB VRAM), 16 GB RAM,
Windows. Do NOT run this on the Muse VM (no GPU, 2 cores, ~3.6 GB RAM
free) — see ENVIRONMENT_AUDIT.md.

## 0. The one command (recommended — do this, not the manual steps)

From the repo root, in Command Prompt or PowerShell:

```
tools\asset-generation\run-windows.bat
```

That launcher, in order: (1) checks Python 3.10+, (2) creates/uses
`.venv-v4` and installs `requirements.txt`, (3) checks `nvidia-smi`
and reports driver + GPU, (4) checks CUDA-enabled PyTorch,
(5) checks VRAM ≥ 5.5 GB, (6) checks free disk ≥ 15 GB, (7) sets
`HF_HOME` to `tools\asset-generation\models\` unless already set,
(8) runs `generate.py`, (9) runs `validate_assets.py`, (10) prints
the integrate step. Every check fails with a clear, actionable
message (what to install/update) instead of a traceback dump, and
the launcher refuses to run generation on CPU. It needs no Muse, no
VM, and no manual Python steps beyond running it.

**Time estimate (not a promise):** on an RTX 4050, model load is
roughly 30–60 seconds, and each 512×512 image at 28 steps is roughly
5–30 seconds, so 12 assets are roughly **5–20 minutes of generation**
after setup — plus the one-time ~4.3 GB weight download, whose time
depends entirely on your internet connection. If a single image takes
tens of minutes, stop and check GPU utilisation — the run is probably
on CPU. Resume after interruption by re-running the same command:
already-generated assets are skipped, weights are cached (no duplicate
downloads), and `generate.py --only <id>` regenerates one asset.

## 1. Manual install (only if the launcher cannot run)

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
LoRA. The launcher requires at least 15 GB free (weights + outputs).

## 2. Verify licences before commercial use

- Base model `stable-diffusion-v1-5/stable-diffusion-v1-5`: reported as
  CreativeML OpenRAIL-M. Open the repo page and read its LICENSE file.
- LoRA `VaroDZAKY/Varo_pixel_Art`: **no licence was stated in the
  fetched model card.** Read the repo's licence/metadata before
  redistributing anything built with it. If no licence is found, treat
  the LoRA as unverified for commercial use and pick an alternative
  with a stated licence.

## 3. Generate (resumable, one image per batch, 512x512, fp16)

If you used the launcher, generation already ran. Manually:

```powershell
cd tools\asset-generation
python generate.py
```

This writes `outputs\raw\<id>.png` + `outputs\raw\<id>.json` per asset.
`generate.py` now resolves the exact base/LoRA commit hashes with
`HfApi().model_info().sha` and writes them into every record and into
`outputs\models.json` — no more "FILL-IN" revisions. Weights are
cached once in `HF_HOME` (`tools\asset-generation\models\` by
default, gitignored) via `snapshot_download`, so re-runs do not
download duplicates. Re-running skips already-generated assets
unless `--force` is passed; `python generate.py --only <id>`
regenerates one asset. If a run OOMs on 6 GB, enable sequential
CPU offload in `model-config.json` (much slower) or reduce steps —
do not raise resolution or batch size.

## 4. Validate, inspect, approve

```powershell
python validate_assets.py
python validate_assets.py --sheet outputs\raw\v4-character-sheet.png --cols 4 --rows 3
```

Open `outputs\contact-sheet.png` and inspect every asset side by side:
perspective, scale, transparency, identity across character frames,
no text, no malformed doors/windows. Reject anything that fails —
move it to `outputs\rejected\` with a reason, do not integrate it.
For each asset you approve, copy its PNG + record JSON from
`outputs\raw\` into `outputs\approved\`.

## 5. Integrate (only approved assets)

```powershell
python integrate.py
```

`integrate.py` re-validates everything in `outputs\approved\`
(integrity, RGBA alpha, record dimensions, border-transparency /
white-halo check, character-sheet cell checks), copies ONLY passing
assets to `public\v4-assets\`, writes
`public\v4-assets\manifest.json` (id → file, dimensions, anchor
`bottom-centre`, category, generation record), builds
`outputs\contact-sheet-integrated.png`, marks copied assets
`integrated` in `asset-manifest.json` (everything else stays
`pending` — nothing is marked generated without a real file), and
prints the exact Phaser preload wiring to add by hand. Then:

1. Add that wiring in `src/city/PhaserScene.ts` `preload()` and the
   keys in `src/city/textures.ts` `ASSET_MANIFEST`, following the
   existing `v3-building-*` pattern, with the procedural texture as
   fallback only if a file is missing — and log that missing-file
   case (do not silently ship a placeholder in production without
   a diagnostic).
2. Keep collision/navigation geometry in `src/simulation/map.ts`
   untouched. Keep registry/inspector avatars on the same character
   identity as the city sprites.
3. Run `npm run build`, `npm test`, `npm run test:e2e` — all must pass.
4. Screenshot default / close / follow / narrow views, compare
   against the V3 screenshots in `screenshots/`.
5. Commit only: approved PNGs, scripts, docs, manifest updates,
   tests. Never commit model weights, `outputs/raw/`, or temp files.
6. Push to `main` and deploy with the established Vercel CLI workflow,
   then verify the live URL with a fresh bundle hash — and only
   after the integrated result passes verification.
