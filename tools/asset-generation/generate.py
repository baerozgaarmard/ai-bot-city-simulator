#!/usr/bin/env python3
"""V4 asset generation — development-time only, GPU machine only.

Loads SD 1.5 + the Varo pixel-art LoRA once, generates every asset in
prompts/assets.json with deterministic seeds, and writes one PNG plus one
generation record (JSON) per asset into outputs/raw/.

Resumable: an asset with an existing PNG + record is skipped unless
--force is given. Model weights are cached locally (HF_HOME, defaulting
to tools/asset-generation/models/ unless HF_HOME is already set) via
huggingface_hub snapshot_download, so a re-run does not download a
duplicate copy. Nothing here writes to public/ or to git. Approved
assets are copied only by integrate.py after validate_assets.py + a
human visual check (see README.md).

Revisions: the exact base/LoRA commit hashes are resolved with
HfApi().model_info().sha at run time and written into every record and
into outputs/models.json. They are never left as "FILL-IN".

Usage (Windows GPU machine, via run-windows.bat, or venv activated):
    python generate.py [--force] [--only v4-building-cafe]

Do NOT run this in the Muse VM: it has no GPU and ~3.6 GB RAM free.
See ENVIRONMENT_AUDIT.md. This script refuses to run without CUDA.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# Cache weights locally, in one place, gitignored (see .gitignore:
# tools/asset-generation/models/). Respect an existing HF_HOME.
if not os.environ.get("HF_HOME"):
    os.environ["HF_HOME"] = str(ROOT / "models")
CONFIG = json.loads((ROOT / "model-config.json").read_text())
ASSETS = json.loads((ROOT / "prompts" / "assets.json").read_text())["assets"]


def resolve_revision(api, repo_id):
    """Return the current commit hash for a HF repo, or None."""
    try:
        return api.model_info(repo_id).sha
    except Exception as e:  # noqa: BLE001 — revision is recorded, not fatal
        print(f"warning: could not resolve revision for {repo_id}: {e}",
              file=sys.stderr)
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default=None, help="generate only this asset id")
    args = ap.parse_args()

    try:
        import torch
        from diffusers import StableDiffusionPipeline
        from huggingface_hub import HfApi, snapshot_download
    except ImportError as e:
        print(f"missing dependency: {e} — see RUN_ON_WINDOWS_GPU.md", file=sys.stderr)
        return 2

    if not torch.cuda.is_available():
        print("No CUDA GPU detected. Refusing to run: CPU generation on a "
              "small machine is impractical (see ENVIRONMENT_AUDIT.md).",
              file=sys.stderr)
        return 2
    vram_gb = torch.cuda.get_device_properties(0).total / (1024 ** 3)
    print(f"GPU: {torch.cuda.get_device_name(0)} ({vram_gb:.1f} GB VRAM)")
    if vram_gb < 5.5:
        print("WARNING: less than 5.5 GB VRAM — a 6 GB configuration may "
              "OOM. Enable sequential CPU offload in model-config.json "
              "(much slower) or stop here.", file=sys.stderr)

    base = CONFIG["chosen"]["base_model"]
    lora = CONFIG["chosen"]["lora"]
    settings = CONFIG["inference_settings_for_6gb_vram"]
    # Download once into the shared HF cache (resumable, no duplicates).
    # Patterns cover weights + config; from_pretrained reuses this cache.
    api = HfApi()
    base_rev = resolve_revision(api, base)
    lora_rev = resolve_revision(api, lora)
    print(f"base model: {base} @ {base_rev}")
    print(f"LoRA: {lora} @ {lora_rev}")
    snapshot_download(base, allow_patterns=["*.json", "*.txt", "*.safetensors", "*.bin"])
    snapshot_download(lora, allow_patterns=["*.json", "*.txt", "*.safetensors", "*.bin"])
    print(f"model cache: {os.environ['HF_HOME']} (verify the LICENSE file "
          "in each downloaded repo before commercial use)")

    pipe = StableDiffusionPipeline.from_pretrained(
        base, torch_dtype=torch.float16, safety_checker=None,
    )
    pipe.load_lora_weights(lora)
    pipe.enable_attention_slicing()
    if settings["enable_vae_slicing"]:
        pipe.enable_vae_slicing()
    # CPU offload ONLY when the config explicitly asks for it (6 GB OOM
    # fallback). Otherwise the pipeline runs on CUDA, which is far faster.
    if settings.get("enable_sequential_cpu_offload"):
        print("sequential CPU offload enabled (slow fallback)")
        pipe.enable_sequential_cpu_offload()
    else:
        pipe = pipe.to("cuda")
    pipe.set_progress_bar_config(disable=True)

    raw = ROOT / "outputs" / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    (ROOT / "outputs" / "models.json").write_text(json.dumps({
        "base_model": base, "base_model_revision": base_rev,
        "lora": lora, "lora_revision": lora_rev,
        "cache_dir": os.environ["HF_HOME"],
        "recorded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }, indent=2))
    for asset in ASSETS:
        if args.only and asset["id"] != args.only:
            continue
        out_png = raw / asset["output"]
        out_json = raw / (asset["id"] + ".json")
        if out_png.exists() and out_json.exists() and not args.force:
            print(f"skip (already generated): {asset['id']}")
            continue
        t0 = time.time()
        image = pipe(
            prompt=asset["prompt"],
            negative_prompt=asset["negative_prompt"],
            height=asset["height"], width=asset["width"],
            num_inference_steps=asset["steps"],
            guidance_scale=asset["guidance"],
            generator=torch.Generator("cuda").manual_seed(asset["seed"]),
        ).images[0]
        image.save(out_png)
        record = {
            **asset,
            "base_model": base, "lora": lora,
            "torch_dtype": "float16", "device": "cuda",
            "attention_slicing": True, "vae_slicing": settings["enable_vae_slicing"],
            "sequential_cpu_offload": bool(settings.get("enable_sequential_cpu_offload")),
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "seconds": round(time.time() - t0, 1),
            "validation_status": "unvalidated",
            "base_model_revision": base_rev,
            "lora_revision": lora_rev,
        }
        out_json.write_text(json.dumps(record, indent=2))
        print(f"generated: {asset['id']} -> {out_png} "
              f"({record['seconds']}s, seed {asset['seed']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
