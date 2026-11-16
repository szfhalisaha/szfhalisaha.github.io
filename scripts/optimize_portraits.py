#!/usr/bin/env python3
"""Publish compressed, transparent, high-resolution card portraits.
The lossless PNG masters and Supabase originals remain untouched.
"""
import json
from pathlib import Path
from PIL import Image

base=Path(__file__).resolve().parents[1]
folder=base/"card-cutouts"
manifest_path=folder/"manifest.json"
manifest=json.loads(manifest_path.read_text(encoding="utf-8"))
originals=manifest["portraits"]
count=0
saved=0
for pid, entry in sorted(originals.items()):
    src=folder/(pid+".png")
    if not src.is_file():
        print("Missing:",src)
        continue
    original_size=src.stat().st_size
    with Image.open(src) as im:
        image=im.convert("RGBA")
        # 600x750 remains sharp for a 290px player card on Retina displays.
        image.thumbnail((600,750),Image.Resampling.LANCZOS)
        target=folder/(pid+".webp")
        image.save(target,format="WEBP",quality=90,method=6,exact=True)
    webp_size=target.stat().st_size
    if webp_size>=original_size:
        print(f"Note: {pid} webp larger than png")
    entry["path"]=f"card-cutouts/{pid}.webp"
    saved += original_size-webp_size
    count += 1
    print(f"{count}: {original_size} -> {webp_size} bytes ({pid})",flush=True)
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(f"Optimized {count} images; saved {saved/1048576:.2f} MiB",flush=True)
if count!=len(originals):
    raise SystemExit("Not all cutouts were optimized")
