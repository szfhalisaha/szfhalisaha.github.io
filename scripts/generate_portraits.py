#!/usr/bin/env python3
"""Create lossless transparent football card cutouts without altering original avatars."""
from __future__ import annotations

import io
import json
import os
import pathlib
import time
import urllib.parse
import urllib.request

from PIL import Image, ImageOps
from rembg import new_session, remove

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = ROOT / "portrait-source-manifest.json"
OUT = ROOT / "card-cutouts"
OUT.mkdir(exist_ok=True)
PROJECT = "fshumlcwqnrafoicuhlf"
MAX_IMAGE_SIDE = 1800
OUTPUT_WIDTH = 800
OUTPUT_HEIGHT = 1000
results = {}
errors = []
session = new_session("isnet-general-use")


def fetch_avatar(path: str) -> bytes:
    # Files remain in Supabase; public URLs are used solely to read them.
    url = f"https://{PROJECT}.supabase.co/storage/v1/object/public/avatars/" + urllib.parse.quote(path, safe="/")
    req = urllib.request.Request(url, headers={"User-Agent": "SZF-Portrait-Generator/1.0"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        body = resp.read(12_000_000)
        if len(body) > 11_900_000:
            raise ValueError("Input photo too large")
        return body


def make_cutout(source: bytes) -> Image.Image:
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(source))).convert("RGB")
    if max(img.size) > MAX_IMAGE_SIDE:
        img.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.Resampling.LANCZOS)
    rgba = remove(img, session=session, alpha_matting=False).convert("RGBA")
    alpha = rgba.getchannel("A")
    bbox = alpha.point(lambda p: 255 if p > 14 else 0).getbbox()
    if bbox is None:
        raise ValueError("No foreground detected")
    subject = rgba.crop(bbox)
    # Fit without distortion: keep a visible border above the head and
    # place the bottom of the shirt directly against the card name divider.
    max_w = int(OUTPUT_WIDTH * .94)
    max_h = int(OUTPUT_HEIGHT * .95)
    scale = min(max_w / subject.width, max_h / subject.height)
    nw, nh = max(1, round(subject.width * scale)), max(1, round(subject.height * scale))
    if (nw, nh) != subject.size:
        subject = subject.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (OUTPUT_WIDTH, OUTPUT_HEIGHT), (0, 0, 0, 0))
    left = (OUTPUT_WIDTH - nw) // 2
    top = OUTPUT_HEIGHT - nh
    out.alpha_composite(subject, (left, top))
    return out


profiles = json.loads(SOURCES.read_text(encoding="utf-8"))["profiles"]
for n, player in enumerate(profiles, 1):
    pid, path = player["id"], player["avatar_path"]
    dest = OUT / f"{pid}.png"
    print(f"[{n}/{len(profiles)}] Processing {player['display_name']}", flush=True)
    try:
        # Rebuild all images when this action is rerun; originals are unchanged.
        src = fetch_avatar(path)
        cutout = make_cutout(src)
        cutout.save(dest, format="PNG", optimize=True)
        results[pid] = {"path": f"card-cutouts/{pid}.png", "source": path}
    except Exception as e:
        errors.append({"id": pid, "name": player["display_name"], "error": str(e)})
        print(f"  ERROR: {e}", flush=True)
        if dest.exists():
            dest.unlink()

(OUT / "manifest.json").write_text(json.dumps({"portraits": results, "errors": errors}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Completed: {len(results)}/{len(profiles)}; failures: {len(errors)}", flush=True)
if not results:
    raise SystemExit("No cutouts created; existing card images must stay intact.")
