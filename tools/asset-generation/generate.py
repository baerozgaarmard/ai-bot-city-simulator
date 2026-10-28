#!/usr/bin/env python3
"""V4 asset generation — development-time only, GPU machine only.

Loads SD 1.5 + the Varo pixel-art LoRA once, generates every asset in
prompts/assets.json with deterministic seeds, and writes one PNG plus one
generation record (JSON) per asset into outputs/raw/.

Resumable: an asset with an existing PNG + record is skipped unless
--force is given. Model weights stay in the Hugging Face cache; nothing
here writes to public/ or to git. Approved assets are copied manually
after validate_assets.py + a visual check (see README.md).

Usage (Windows GPU machine, venv activated):
    python generate.py [--force] [--only v4-building-cafe]

Do NOT run this in the Muse VM: it has no GPU and ~3.6 GB RAM free.
See ENVIRONMENT_AUDIT.md.
"""
import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / "model-config.json").read_text())
ASSETS = json.loads((ROOT / "prompts" / "assets.json").read_text())["assets"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default=None, help="generate only this asset id")
    args = ap.parse_args()

    try:
        import torch
        from diffusers import StableDiffusionPipeline
        from huggingface_hub import snapshot_download
    except ImportError as e:
        print(f"missing dependency: {e} — see RUN_ON_WINDOWS_GPU.md", file=sys.stderr)
        return 2

    if not torch.cuda.is_available():
        print("No CUDA GPU detected. Refusing to run: CPU generation on a "
              "small machine is impractical (see ENVIRONMENT_AUDIT.md).",
              file=sys.stderr)
        return 2

    base = CONFIG["chosen"]["base_model"]
    lora = CONFIG["chosen"]["lora"]
    settings = CONFIG["inference_settings_for_6gb_vram"]
    base_rev = snapshot_download(base, allow_patterns=["*.json", "*.txt"])
    print(f"base model cache: {base_rev}")
    print("Recording exact commit hashes is done per-asset below from the "
          "snapshot paths; verify the LICENSE file in the downloaded repo "
          "before commercial use.")

    pipe = StableDiffusionPipeline.from_pretrained(
        base, torch_dtype=torch.float16, safety_checker=None,
    )
    pipe.load_lora_weights(lora)
    pipe.enable_attention_slicing()
    if settings["enable_vae_slicing"]:
        pipe.enable_vae_slicing()
    pipe = pipe.to("cuda")
    pipe.set_progress_bar_config(disable=True)

    raw = ROOT / "outputs" / "raw"
    raw.mkdir(parents=True, exist_ok=True)
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
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "seconds": round(time.time() - t0, 1),
            "validation_status": "unvalidated",
            # Fill in from snapshot_download output at generation time:
            "base_model_revision": "FILL-IN",
            "lora_revision": "FILL-IN",
        }
        out_json.write_text(json.dumps(record, indent=2))
        print(f"generated: {asset['id']} -> {out_png} "
              f"({record['seconds']}s, seed {asset['seed']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
