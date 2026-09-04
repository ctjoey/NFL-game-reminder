"""Make any uploaded artwork App Store-legal: 1024x1024, opaque, full-bleed.
Drop artwork at ios/NFLGameReminder/Assets.xcassets/AppIcon.appiconset/artwork.png (any size; a
rounded-square export with white corners and a bevel edge is fine). CI writes icon-1024.png next to
it. Steps: center-square crop, trim a margin so a baked-in rounded frame falls outside the square,
then replace transparent / white / light-bevel pixels outside a rounded rect with the artwork's
own background color so iOS's corner mask shows solid color, not white slivers."""
import sys
from PIL import Image, ImageDraw
src, dst = sys.argv[1], sys.argv[2]
MARGIN = float(sys.argv[3]) if len(sys.argv) > 3 else 0.05     # fraction trimmed from each side
RADIUS = float(sys.argv[4]) if len(sys.argv) > 4 else 0.26     # rounded-rect radius as fraction of size
im = Image.open(src).convert("RGBA")
w, h = im.size; s = min(w, h); im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
m = int(s * MARGIN); im = im.crop((m, m, s - m, s - m)).resize((1024, 1024), Image.LANCZOS)
px = im.load()
sample = px[int(1024 * 0.12), int(1024 * 0.12)]
bg = tuple(sample[:3]) if sample[3] > 200 and sum(sample[:3]) < 450 else (6, 21, 48)
mask = Image.new("L", (1024, 1024), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, 1023, 1023), radius=int(1024 * RADIUS), fill=255)
mp = mask.load()
for y in range(1024):
    for x in range(1024):
        r, g, b, a = px[x, y]
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        if a < 250 or (mp[x, y] < 128 and lum > 110):
            px[x, y] = (*bg, 255)
out = Image.new("RGB", (1024, 1024), bg); out.paste(im, (0, 0), im); out.save(dst, "PNG")
print("normalized", src, "->", dst, "bg", bg)
