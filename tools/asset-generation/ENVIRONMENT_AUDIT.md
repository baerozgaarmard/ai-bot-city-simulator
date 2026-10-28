# Environment audit — Muse VM, 2026-10-28

Re-audited at the start of V4 (not assumed from the user's target PC).

## Detected hardware / software

- CPU: 2 vCPU, AMD EPYC 9D25, 1 thread per core
- RAM: 7.7 GB total, ~3.6-3.9 GB available, **0 swap**
- GPU: none. `nvidia-smi` not found, no `/dev/nvidia*`, no CUDA
- Disk: 144 GB free under /home/hatch
- OS: Linux x86_64
- Python: 3.12.3, pip 24.0, **torch NOT installed**
- Repo: clean at fbf1aa9 (V3), branch main

## Feasibility verdict: local HF generation is NOT practical here

- Full SD 1.5: ~4.27 GB ema-only fp16 weights, plus torch + diffusers
  + text encoder + VAE in memory. On CPU with 2 cores and ~3.6 GB
  free RAM, a single 512x512 image would take tens of minutes at
  best and risks OOM (no swap to fall back on).
- Smallest distilled alternative (nota-ai/bk-sdm-tiny-2m, 0.50B total):
  the tiny-SD documentation states ~8 GB RAM + 12 CPU cores for slow
  CPU generation, and 16-32 GB RAM and/or a GPU for practical speed.
  This VM fails both thresholds (2 cores, 3.6 GB free).
- Therefore: **no weights were downloaded, no torch install was
  started, no test generation was run, and no runaway process was
  left running.** Starting a multi-GB download + CPU inference on
  this box would have consumed the session for an unverifiable,
  likely OOM-killed result.

## What was done instead

- A complete, reusable pipeline for the user's RTX 4050 (6 GB VRAM)
  machine: model-config, style spec, prompts, generate.py,
  validate_assets.py, asset manifest, and RUN_ON_WINDOWS_GPU.md.
- V3 work is untouched and remains live. No asset was faked, and no
  V4 deployment was made on the basis of ungenerated art.

## User's target hardware (for the pipeline, not this VM)

- Intel 5 210H, NVIDIA RTX 4050 6 GB VRAM, 16 GB RAM, Windows.
- On that machine, fp16 + attention slicing + VAE slicing, batch 1,
  512x512, 28 steps is the expected working configuration; see
  model-config.json. Sequential CPU offload only if 6 GB OOMs.
