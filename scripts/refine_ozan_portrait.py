#!/usr/bin/env python3
"""Fix Ozan's raised-hands segmentation artifacts, leaving originals intact."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageChops
root=Path(__file__).resolve().parents[1]/"card-cutouts"
pid="ede12ef4-f7e6-4f10-a9f5-4a2b88e37350"
src=root/(pid+".png")
dst=root/(pid+".webp")
with Image.open(src) as im:
    img=im.convert("RGBA")
    # Ozan's upraised hands were missegmented against a dark background.
    # Keep a face/ears/neck corridor above the shoulders, then expand to full
    # shoulder width below. This avoids fuzzy hand ghosts around both ears.
    w,h=img.size
    corridor=Image.new("L",(w,h),0)
    d=ImageDraw.Draw(corridor)
    d.polygon([
      (278,0),(528,0),
      (536,130),(546,245),(552,340),(556,455),
      (562,520),(604,585),(696,660),(800,705),
      (800,1000),(0,1000),(0,705),(108,650),(200,585),
      (236,520),(234,440),(243,330),(249,230),(262,125)
    ],fill=255)
    corridor=corridor.filter(ImageFilter.GaussianBlur(2))
    img.putalpha(ImageChops.multiply(img.getchannel("A"),corridor))
    # Crop to lower chest, with body reaching the divider like Deniz.
    bbox=img.getchannel("A").point(lambda v:255 if v>22 else 0).getbbox()
    if not bbox: raise RuntimeError("Ozan cutout unexpectedly empty")
    top=bbox[1]
    bottom=min(h,round(top+0.86*(bbox[3]-top)))
    upper=img.crop((0,top,w,bottom))
    scale=1.10
    upper=upper.resize((round(upper.width*scale),round(upper.height*scale)),Image.Resampling.LANCZOS)
    frame=Image.new("RGBA",(800,1000),(0,0,0,0))
    # Alpha compositing (not paste with duplicate alpha) for clean contours.
    frame.alpha_composite(upper,(round((800-upper.width)/2),1000-upper.height))
    frame.save(dst,"WEBP",quality=93,method=6,exact=True)
    print(f"Saved clean Ozan portrait: {dst}, {dst.stat().st_size} bytes")
