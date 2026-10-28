#!/usr/bin/env python3
"""Integrate ONLY approved, validated V4 assets into the game.

Workflow (human visual check first — this script does not replace it):
  1. python generate.py            # outputs/raw/<id>.png + <id>.json
  2. python validate_assets.py     # must pass
  3. Visually inspect outputs/contact-sheet.png. For every asset you
     approve, copy its PNG + record JSON into outputs/approved/.
     Anything you do not approve stays out of outputs/approved/ and
     is NEVER integrated by this script.
  4. python integrate.py           # this script

What this script does, in order:
  (a) Re-validates every file in outputs/approved/ — PNG signature,
      Pillow readability, RGBA mode, a real alpha range (not fully
      opaque, not fully transparent), dimensions matching its
      generation record when present, and a border-transparency check
      (an isolated asset whose outer border is mostly opaque still
      carries its background — a white-halo / unremoved-background
      signal). Character sheets are additionally cell-checked
      (4x3 by default, --sheet-cols/--sheet-rows): every cell must
      contain non-transparent pixels and no cell may be byte-identical
      to its neighbour.
  (b) Copies ONLY the assets that pass to public/v4-assets/ (the
      deployable directory named in asset-manifest.json final_path).
      Failing assets are not copied, are listed in the report, and
      cause a non-zero exit — passing assets are still copied.
  (c) Writes public/v4-assets/manifest.json for the Phaser loader:
      asset id -> file, dimensions, anchor ("bottom-centre", matching
      PhaserScene.img() which uses setOrigin(0.5, 1)), category, and
      generation record (base, LoRA, revisions, seed, steps, guidance).
  (d) Builds outputs/contact-sheet-integrated.png from the copied
      assets for review.
  (e) Updates tools/asset-generation/asset-manifest.json: copied
      assets move from "pending" to "integrated". Assets with no file
      in outputs/approved/ stay "pending" — this script NEVER marks
      an asset generated/integrated without a real, validated file.
  (f) Prints the exact Phaser wiring still needed by hand (see below),
      because auto-editing PhaserScene.ts/textures.ts could break the
      working V3 loader. No silent fallback to procedural art is added
      by this script: if a v4 file is missing at runtime, the existing
      V3/procedural path applies and the developer must check
      public/v4-assets/manifest.json.

Usage:
    python integrate.py [--approved-dir outputs/approved]
    python integrate.py --sheet-cols 4 --sheet-rows 3

Exit 0 only if every file in outputs/approved/ passed and was copied.
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
PNG_SIG = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])


def border_opaque_fraction(im: Image.Image) -> float:
    """Fraction of the outer 1px border that is opaque.

    Isolated assets should have transparent margins; a mostly-opaque
    border means the background was not removed (white halo risk).
    """
    a = im.getchannel("A")
    w, h = im.size
    border = []
    for x in range(w):
        border.append(a.getpixel((x, 0)))
        border.append(a.getpixel((x, h - 1)))
    for y in range(h):
        border.append(a.getpixel((0, y)))
        border.append(a.getpixel((w - 1, y)))
    if not border:
        return 1.0
    return sum(1 for v in border if v == 255) / len(border)


def validate_file(path: Path, sheet_cols: int, sheet_rows: int, errors: list) -> dict | None:
    data = path.read_bytes()
    if data[:8] != PNG_SIG:
        errors.append(f"{path.name}: not a PNG")
        return None
    try:
        im = Image.open(path)
        im.load()
    except Exception as e:  # noqa: BLE001
        errors.append(f"{path.name}: unreadable: {e}")
        return None
    if im.mode != "RGBA":
        errors.append(f"{path.name}: mode is {im.mode}, expected RGBA")
        return None
    lo, hi = im.getchannel("A").getextrema()
    if lo == hi == 255:
        errors.append(f"{path.name}: fully opaque — no transparency")
        return None
    if lo == hi == 0:
        errors.append(f"{path.name}: fully transparent — empty asset")
        return None
    border = border_opaque_fraction(im)
    if border > 0.40:
        errors.append(f"{path.name}: outer border {border:.0%} opaque — "
                      "background likely not removed (white-halo risk)")
        return None
    info = {"file": path.name, "size": im.size, "alpha_range": [lo, hi],
            "border_opaque_fraction": round(border, 3)}
    rec_path = path.parent / (path.stem + ".json")
    if rec_path.exists():
        try:
            rec = json.loads(rec_path.read_text())
            if (rec.get("width"), rec.get("height")) != im.size:
                errors.append(f"{path.name}: size {im.size} != record "
                              f"{(rec.get('width'), rec.get('height'))}")
                return None
            info["record"] = rec
        except Exception as e:  # noqa: BLE001
            errors.append(f"{path.name}: bad generation record: {e}")
            return None
    if path.stem == "v4-character-sheet":
        w, h = im.size
        if w % sheet_cols or h % sheet_rows:
            errors.append(f"{path.name}: {w}x{h} not divisible into "
                          f"{sheet_cols}x{sheet_rows} cells")
            return None
        cw, ch = w // sheet_cols, h // sheet_rows
        prev = None
        for r in range(sheet_rows):
            for c in range(sheet_cols):
                cell = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
                if cell.getchannel("A").getextrema() == (0, 0):
                    errors.append(f"{path.name}: cell ({c},{r}) is empty")
                    return None
                raw = cell.tobytes()
                if prev is not None and raw == prev:
                    errors.append(f"{path.name}: cell ({c},{r}) is "
                                  "byte-identical to previous cell")
                    return None
                prev = raw
    return info


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--approved-dir", default="outputs/approved")
    ap.add_argument("--sheet-cols", type=int, default=4)
    ap.add_argument("--sheet-rows", type=int, default=3)
    args = ap.parse_args()
    approved_dir = (ROOT / args.approved_dir) if not Path(args.approved_dir).is_absolute() else Path(args.approved_dir)
    manifest_path = ROOT / "asset-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    by_output = {Path(a["file"]).name: a for a in manifest["assets"]}
    by_id = {a["id"]: a for a in manifest["assets"]}

    files = sorted(approved_dir.glob("*.png")) if approved_dir.exists() else []
    if not files:
        print(f"no approved assets in {approved_dir} — nothing to integrate.\n"
              "Approve assets first: copy validated PNG + record JSON "
              "from outputs/raw/ into outputs/approved/ after a visual "
              "check (see README.md).", file=sys.stderr)
        return 2
    errors: list = []
    copied = []
    out_dir = REPO / "public" / "v4-assets"
    out_dir.mkdir(parents=True, exist_ok=True)
    (ROOT / "outputs").mkdir(parents=True, exist_ok=True)
    phaser_manifest = []
    for f in files:
        asset = by_output.get(f.name)
        if asset is None:
            errors.append(f"{f.name}: no asset-manifest entry — not integrated")
            continue
        info = validate_file(f, args.sheet_cols, args.sheet_rows, errors)
        if info is None:
            continue
        dest = out_dir / Path(asset["final_path"]).name
        shutil.copyfile(f, dest)
        asset["status"] = "integrated"
        entry = {
            "id": asset["id"], "key": asset["id"].replace("v4-", "v4-"),
            "file": f"/v4-assets/{dest.name}",
            "width": info["size"][0], "height": info["size"][1],
            "category": asset["category"], "anchor": "bottom-centre",
            "transparent": True,
        }
        if "record" in info:
            r = info["record"]
            entry["generation"] = {
                "base_model": r.get("base_model"), "lora": r.get("lora"),
                "base_model_revision": r.get("base_model_revision"),
                "lora_revision": r.get("lora_revision"),
                "seed": r.get("seed"), "steps": r.get("steps"),
                "guidance": r.get("guidance"),
            }
        phaser_manifest.append(entry)
        copied.append(asset["id"])
    # Contact sheet of integrated assets only.
    thumbs = []
    for entry in phaser_manifest:
        t = Image.open(out_dir / Path(entry["file"]).name).convert("RGBA")
        t.thumbnail((240, 240))
        thumbs.append(t)
    if thumbs:
        cols = 4
        rows = (len(thumbs) + cols - 1) // cols
        sheet = Image.new("RGBA", (cols * 240, rows * 240), (20, 20, 20, 255))
        for i, t in enumerate(thumbs):
            sheet.alpha_composite(t, ((i % cols) * 240, (i // cols) * 240))
        sheet.save(ROOT / "outputs" / "contact-sheet-integrated.png")
    (out_dir / "manifest.json").write_text(
        json.dumps({"assets": phaser_manifest}, indent=2))
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(json.dumps({"copied": copied, "errors": errors}, indent=2))
    print("\nPhaser wiring still needed by hand (do not skip):")
    print("  1. src/city/PhaserScene.ts preload(): for each copied asset,")
    for entry in phaser_manifest:
        short = entry["id"].replace("v4-building-", "").replace("v4-", "")
        print(f"       this.load.image('{entry['id']}', '{entry['file']}')  "
              f"// then use buildingImg-style scaling, following the "
              f"existing v3-building-{short} pattern")
    print("  2. src/city/textures.ts: add the copied keys to ASSET_MANIFEST")
    print("     (category/width/height from public/v4-assets/manifest.json).")
    print("  3. Run: npm run build && npm test && npm run test:e2e, then")
    print("     screenshot default / close / follow / narrow views.")
    print("  4. Only then commit the copied PNGs + manifest.json + code,")
    print("     push, and deploy with the Vercel CLI workflow.")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
