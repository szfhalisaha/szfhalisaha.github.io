#!/usr/bin/env python3
"""Reframe immutable cutout PNG masters into chest-up, centered WEBP card images.
Does not modify Supabase images, existing PNG masters or scoring data.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parents[1]
FOLDER=ROOT/"card-cutouts"
MANIFEST=FOLDER/"manifest.json"
data=json.loads(MANIFEST.read_text("utf-8"))
WIDTH,HEIGHT=800,1000

# Per-player optical scale: hands/arms are cropped out in the final card frame.
SCALE={
 "ede12ef4-f7e6-4f10-a9f5-4a2b88e37350":1.19, # Ozan
 "36ce0697-2ce2-4435-ba3a-41d82ba98f78":1.40, # Zafer
 "4d128ade-36d5-4b6c-a07d-f623e7cce3b4":1.31, # Necati
 "d794aef3-f4dd-44ba-9944-d5e2e3ed8ffd":1.07, # Samed, close-up already
 "c08c1de5-28c0-4a45-9933-98929ad7a812":.96, # Mehmet, face is large
}
OZAN="ede12ef4-f7e6-4f10-a9f5-4a2b88e37350"
SAMED="d794aef3-f4dd-44ba-9944-d5e2e3ed8ffd"
ZAFER="36ce0697-2ce2-4435-ba3a-41d82ba98f78"

def fade_cut(image,mask):
    alpha=image.getchannel("A")
    alpha=Image.composite(Image.new("L",image.size,0),alpha,mask)
    image.putalpha(alpha)

def remove_artifacts(image,player):
    # Accurate, limited erasures on known problematic parts of the source cuts.
    # Pillow polygon mask values: 255 remove / 0 keep.
    if player==SAMED:
        # Extraneous banner/fixture above his hair; trace top edge of haircut.
        mask=Image.new("L",image.size,0)
        d=ImageDraw.Draw(mask)
        d.polygon([(0,0),(800,0),(800,335),(710,307),(675,286),
                   (631,259),(592,245),(550,237),(510,228),(470,225),
                   (430,228),(391,238),(347,262),(300,301),(0,335)],fill=255)
        # Sharp boundary with slight edge antialias; hair retains natural outline.
        mask=mask.filter(ImageFilter.GaussianBlur(2))
        fade_cut(image,mask)
    elif player==OZAN:
        # Both upraised hands show obvious segmentation artifacts. Keep head,
        # ear and torso, omit upper forearms outside the face silhouette.
        mask=Image.new("L",image.size,0)
        d=ImageDraw.Draw(mask)
        d.polygon([(0,0),(245,0),(250,105),(245,200),(241,290),
                  (237,385),(220,460),(0,490)],fill=255)
        d.polygon([(562,0),(800,0),(800,498),(665,473),
                   (614,435),(579,382),(557,310),(555,180)],fill=255)
        mask=mask.filter(ImageFilter.GaussianBlur(4))
        fade_cut(image,mask)
    elif player==ZAFER:
        # Fence/stand texture contaminates the right sleeve under the arm.
        # Clear it rather than leaving dark scribbles floating below the torso.
        mask=Image.new("L",image.size,0)
        d=ImageDraw.Draw(mask)
        d.polygon([(685,756),(800,748),(800,1000),(606,1000),
                   (610,909),(630,843)],fill=255)
        mask=mask.filter(ImageFilter.GaussianBlur(8))
        fade_cut(image,mask)

def reframe(png,pid):
    img=Image.open(png).convert("RGBA")
    remove_artifacts(img,pid)
    # Ignore small semitransparent fringe noise when finding the face/torso bounds.
    alpha=img.getchannel("A").point(lambda x:255 if x>=32 else 0)
    bbox=alpha.getbbox()
    if not bbox:raise ValueError(f"Empty cutout: {pid}")
    left,top,right,bottom=bbox
    # Crop at upper chest (about 70% down the visible person), rather than
    # including a full torso or legs. The cutoff becomes the nameplate edge.
    chest_y=min(img.height,int(top+(bottom-top)*0.71))
    if pid==SAMED:chest_y=min(img.height,int(top+(bottom-top)*0.86))
    if pid=="c08c1de5-28c0-4a45-9933-98929ad7a812":
        chest_y=min(img.height,int(top+(bottom-top)*0.87))
    roi=img.crop((0,top,img.width,max(top+20,chest_y)))
    alpha=roi.getchannel("A")
    bb=alpha.point(lambda x:255 if x>=32 else 0).getbbox()
    if not bb:raise ValueError(f"No foreground after crop {pid}")
    # Horizontal center is anchored on the visible upper body, not scenery.
    center=(bb[0]+bb[2])/2
    if pid==OZAN:center=400
    if pid==ZAFER:center=400
    if pid==SAMED:center=410
    factor=SCALE.get(pid,1.12)
    # Preserve pixel detail: crop first, then one Lanczos resize only.
    new_w=round(roi.width*factor)
    new_h=round(roi.height*factor)
    roi=roi.resize((new_w,new_h),Image.Resampling.LANCZOS)
    frame=Image.new("RGBA",(WIDTH,HEIGHT),(0,0,0,0))
    # Place the bottom edge flush against the name divider.
    dest_x=round(WIDTH/2-center*factor)
    dest_y=HEIGHT-new_h
    frame.paste(roi,(dest_x,dest_y),roi)
    return frame

count=0
for pid,item in data["portraits"].items():
    path=FOLDER/f"{pid}.png"
    if not path.exists():raise FileNotFoundError(path)
    result=reframe(path,pid)
    target=FOLDER/f"{pid}.webp"
    result.save(target,"WEBP",quality=92,method=6,exact=True)
    item["path"]=f"card-cutouts/{pid}.webp"
    count+=1
    print(f"Completed chest-up portrait {count}/{len(data['portraits'])}: {pid} ({target.stat().st_size} bytes)",flush=True)
MANIFEST.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(f"Reframed {count} portraits; originals are untouched.")
