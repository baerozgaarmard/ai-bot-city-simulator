#!/usr/bin/env python3
"""Validate generated V4 assets. Exits non-zero on any failure.

Checks, per file in outputs/raw/*.png (plus any --file given):
- PNG signature and Pillow readability (file integrity)
- dimensions > 0, and matching the generation record when present
- RGBA colour type with a real alpha range (not an opaque image
  pretending to be transparent)
- no fully-transparent image (empty asset)

For sheets (--sheet <png> --cols N --rows M): every cell must have the
expected dimensions and contain non-transparent pixels, and no cell may
be byte-identical to its neighbour (a sign of a duplicated / sliced
wrong frame). Also builds outputs/contact-sheet.png for visual review.

Usage:
    python validate_assets.py
    python validate_assets.py --file outputs/raw/v4-building-cafe.png
    python validate_assets.py --sheet outputs/raw/v4-character-sheet.png --cols 4 --rows 3

This script never integrates an asset — it only reports. Integration
is a separate manual step after a human visual check.
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
PNG_SIG = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])


def check_png(path: Path, errors: list) -> dict | None:
    data = path.read_bytes()
    if data[:8] != PNG_SIG:
        errors.append(f"{path}: not a PNG")
        return None
    try:
        im = Image.open(path)
        im.load()
    except Exception as e:  # noqa: BLE001 — report, don't crash the run
        errors.append(f"{path}: unreadable: {e}")
        return None
    info = {"file": str(path), "size": im.size, "mode": im.mode}
    if im.size[0] <= 0 or im.size[1] <= 0:
        errors.append(f"{path}: non-positive dimensions {im.size}")
    if im.mode != "RGBA":
        errors.append(f"{path}: mode is {im.mode}, expected RGBA "
                      "(pipeline alpha required; do not white-key at runtime)")
    else:
        alpha = im.getchannel("A")
        lo, hi = alpha.getextrema()
        info["alpha_range"] = [lo, hi]
        if lo == hi == 255:
            errors.append(f"{path}: fully opaque — no transparency")
        if lo == hi == 0:
            errors.append(f"{path}: fully transparent — empty asset")
    # Generation record must exist and agree on dimensions when present.
    # Record files are named <id>.json, PNGs <id>.png, in the same dir.
    rec = path.parent / (path.stem + ".json")
    if rec.exists():
        try:
            r = json.loads(rec.read_text())
            if (r.get("width"), r.get("height")) != im.size:
                errors.append(f"{path}: size {im.size} != record "
                              f"{(r.get('width'), r.get('height'))}")
            info["record"] = r.get("id")
        except Exception as e:  # noqa: BLE001
            errors.append(f"{path}: bad generation record: {e}")
    else:
        info["record"] = None
    return info


def check_sheet(path: Path, cols: int, rows: int, errors: list) -> None:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    if w % cols or h % rows:
        errors.append(f"{path}: {w}x{h} is not divisible into "
                      f"{cols}x{rows} cells")
        return
    cw, ch = w // cols, h // rows
    prev = None
    for r in range(rows):
        for c in range(cols):
            cell = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            alpha = cell.getchannel("A")
            if alpha.getextrema() == (0, 0):
                errors.append(f"{path}: cell ({c},{r}) is empty")
            raw = cell.tobytes()
            if prev is not None and raw == prev:
                errors.append(f"{path}: cell ({c},{r}) is byte-identical "
                              "to the previous cell (bad slice?)")
            prev = raw


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", action="append", default=[])
    ap.add_argument("--sheet", default=None)
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--rows", type=int, default=3)
    args = ap.parse_args()
    errors: list = []
    files = [Path(f) for f in args.file] or sorted(
        (ROOT / "outputs" / "raw").glob("*.png"))
    if not files and not args.sheet:
        print("no assets to validate (outputs/raw/ is empty)", file=sys.stderr)
        return 2
    infos = []
    for f in files:
        info = check_png(f, errors)
        if info:
            infos.append(info)
    if args.sheet:
        check_sheet(Path(args.sheet), args.cols, args.rows, errors)
    # Contact sheet for visual review (thumbnails, 4 per row).
    out_dir = ROOT / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)
    if infos:
        thumbs = []
        for info in infos:
            try:
                t = Image.open(info["file"]).convert("RGBA")
                t.thumbnail((240, 240))
                thumbs.append(t)
            except Exception:  # noqa: BLE001 — already reported above
                pass
        if thumbs:
            cols = 4
            rows = (len(thumbs) + cols - 1) // cols
            sheet = Image.new("RGBA", (cols * 240, rows * 240), (20, 20, 20, 255))
            for i, t in enumerate(thumbs):
                sheet.alpha_composite(t, ((i % cols) * 240, (i // cols) * 240))
            sheet.save(out_dir / "contact-sheet.png")
    report = {"files_checked": len(infos), "errors": errors}
    (out_dir / "validation-report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
