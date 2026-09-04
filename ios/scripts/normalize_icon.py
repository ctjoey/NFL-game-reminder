"""Make any uploaded artwork App Store-legal: 1024x1024, opaque, full-bleed.
Drop your artwork at ios/NFLGameReminder/Assets.xcassets/AppIcon.appiconset/artwork.png (any size,
rounded corners and transparency OK). CI runs this and writes icon-1024.png next to it.
Pixels that are near-white or transparent outside a rounded rectangle (i.e. the empty corners of a
rounded-square export) are replaced with the artwork's edge color."""
import sys, os
from PIL import Image, ImageDraw
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA")
# crop to square, centered
w, h = im.size; s = min(w, h); im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((1024, 1024), Image.LANCZOS)
px = im.load()
# sample the background color just inside the rounded corner (e.g. 6% in from the corner along the diagonal)
sample = px[int(1024 * 0.10), int(1024 * 0.10)]
bg = tuple(sample[:3]) if sample[3] > 200 and sum(sample[:3]) < 600 else (14, 27, 58)
# mask: rounded rect with ~22% radius; outside it, replace white/transparent with bg
mask = Image.new("L", (1024, 1024), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, 1023, 1023), radius=int(1024 * 0.22), fill=255)
mp = mask.load()
for y in range(1024):
    for x in range(1024):
        r, g, b, a = px[x, y]
        outside = mp[x, y] < 128
        if a < 250 or (outside and r > 225 and g > 225 and b > 225):
            px[x, y] = (*bg, 255)
Image.new("RGB", (1024, 1024), bg).paste(im, (0, 0), im)
out = Image.new("RGB", (1024, 1024), bg); out.paste(im, (0, 0), im); out.save(dst, "PNG")
print("normalized", src, "->", dst)
