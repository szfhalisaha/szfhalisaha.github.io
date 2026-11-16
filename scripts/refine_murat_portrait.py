#!/usr/bin/env python3
"""Optical Murat Alptekin crop matched to Deniz's head / torso proportions.
Only writes Murat's cutout WebP; keeps all PNG masters and other player files.
"""
from pathlib import Path
from PIL import Image

base=Path(__file__).resolve().parents[1]/"card-cutouts"
pid="ed6c37d5-da9c-49d6-9be8-c4bb06e8b7a4"
source=base/(pid+".png")
target=base/(pid+".webp")
with Image.open(source) as img:
    img=img.convert("RGBA")
    # Keep more of the chest than previous 71% crop, and enlarge face & shoulders.
    alpha=img.getchannel("A").point(lambda p:255 if p>25 else 0)
    bbox=alpha.getbbox()
    if not bbox:raise ValueError("Murat photo foreground missing")
    top=bbox[1]
    bottom=min(img.height,top+round((bbox[3]-top)*.80))
    src=img.crop((0,top,img.width,bottom))
    scale=1.12
    nw,nh=round(src.width*scale),round(src.height*scale)
    res=src.resize((nw,nh),Image.Resampling.LANCZOS)
    frame=Image.new("RGBA",(800,1000),(0,0,0,0))
    frame.paste(res,((800-nw)//2,1000-nh),res)
    frame.save(target,"WEBP",quality=93,method=6,exact=True)
    print(f"Murat crop: source 800x1000 y={top}:{bottom}; scale={scale}; result={target.stat().st_size} bytes")
