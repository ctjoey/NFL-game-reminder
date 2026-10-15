#!/usr/bin/env python3
"""Event art for App Store In-App Events.

Updated for 1.0.7: the background alone read as a blank navy card, which says nothing about the
app. Each image now carries a phone showing the real week list (a capture from a real phone, the
games you can watch in green), set clear of the corner Apple puts its own text in.

Apple overlays the event name and description on top of whatever you upload, and its own
guidance is to keep text and logos out of the image. So this makes backgrounds, not posters:
one 16:9 event card and one 9:16 details page, in the app's own palette, deliberately calm
where the type lands and interesting where it doesn't.

Text-free also means one pair of files covers every event of the season. Re-run only if the
palette changes.

    python3 marketing/event-art/make-art.py
"""
import os
from PIL import Image, ImageChops, ImageDraw, ImageFilter

BG_TOP, BG_BOTTOM = (0x12, 0x1E, 0x38), (0x06, 0x0A, 0x14)
HAIRLINE = (0x3A, 0x4E, 0x72)
ACCENT = (0xFF, 0xB7, 0x4D)      # Theme.accent
FIELD = (0x4E, 0xD8, 0x8A)       # Theme.ok


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def glow(size, centre, colour, radius, strength):
    """A soft disc of light on black, for screening onto the base.

    Screen rather than alpha-composite: laying a translucent warm colour over near-black greys
    it out, which is how an amber accent ends up looking like mud. Adding light keeps the hue.
    """
    w, h = size
    layer = Image.new("RGB", size, (0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = round(w * centre[0]), round(h * centre[1])
    r = round(min(w, h) * radius)
    steps = 64
    for i in range(steps, 0, -1):
        t = i / steps
        rr = round(r * t)
        k = strength * (1 - t) ** 1.7
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                  fill=tuple(round(c * k) for c in colour))
    return layer.filter(ImageFilter.GaussianBlur(min(w, h) * 0.06))


SHOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "store-art", "captures",
                    "week6-west-palm (original, no headline).png")


def phone(img, centre, height, angle):
    """A phone showing the week list, with a lit bezel and a soft shadow, rotated slightly.

    The screen is cropped below the status bar and above the tab bar: at card size those are
    noise, and the rows of games are the point.
    """
    shot = Image.open(SHOT).convert("RGB")
    sw, sh = shot.size
    shot = shot.crop((0, round(sh * 0.10), sw, round(sh * 0.86)))
    ph = round(height)
    pw = round(ph * shot.width / shot.height)
    shot = shot.resize((pw, ph), Image.LANCZOS)
    pad = round(pw * 0.035)
    radius = round(pw * 0.11)

    layer = Image.new("RGBA", (pw + pad * 2, ph + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([0, 0, layer.width - 1, layer.height - 1], radius + pad,
                        fill=(0x0B, 0x10, 0x1C, 255), outline=(0x4A, 0x60, 0x88, 255), width=max(3, pad // 4))
    mask = Image.new("L", shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw - 1, ph - 1], radius, fill=255)
    layer.paste(shot, (pad, pad), mask)
    layer = layer.rotate(angle, resample=Image.BICUBIC, expand=True)

    w, h = img.size
    x = round(w * centre[0] - layer.width / 2)
    y = round(h * centre[1] - layer.height / 2)
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sm = layer.split()[3].point(lambda a: 200 if a else 0)
    shadow.paste((0, 0, 0, 255), (x + round(pw * 0.03), y + round(pw * 0.06)), sm)
    shadow = shadow.filter(ImageFilter.GaussianBlur(pw * 0.08))
    out = Image.alpha_composite(img.convert("RGBA"), shadow)
    out.alpha_composite(layer, (x, y))
    return out.convert("RGB")


def build(w, h, accent_at, field_at, path, phone_at=None):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):                                   # vertical gradient, top lighter
        d.line([(0, y), (w, y)], fill=lerp(BG_TOP, BG_BOTTOM, (y / (h - 1)) ** 0.85))

    # Yard lines: every 1/20th of the width, brighter every fifth. A football field read at a
    # glance without drawing one.
    lines = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lines)
    for i in range(1, 20):
        x = round(i * w / 20)
        strong = i % 5 == 0
        ld.line([(x, 0), (x, h)], fill=HAIRLINE + (150 if strong else 70,),
                width=max(2, round(w / 480)) if strong else max(1, round(w / 960)))
    img = Image.alpha_composite(img.convert("RGBA"), lines).convert("RGB")

    img = ImageChops.screen(img, glow((w, h), accent_at, ACCENT, 0.52, 0.62))
    img = ImageChops.screen(img, glow((w, h), field_at, FIELD, 0.40, 0.22))

    # Gentle vignette so overlaid white type keeps its contrast at the edges.
    vig = Image.new("L", (w, h), 0)
    ImageDraw.Draw(vig).ellipse([-w * 0.18, -h * 0.18, w * 1.18, h * 1.18], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(min(w, h) * 0.14))
    img = Image.composite(img, Image.new("RGB", (w, h), BG_BOTTOM), vig)
    if phone_at:
        img = phone(img, *phone_at)

    img.save(path, "PNG", optimize=True)
    print(f"{os.path.relpath(path)}  {w}x{h}")


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    # Apple sets the event name low-left on the card and low on the details page, so the light
    # goes high and right of it.
    # The phone sits in the light: right of centre on the card, upper half on the details page.
    build(1920, 1080, (0.78, 0.26), (0.18, 0.72), os.path.join(here, "event-card-16x9.png"),
          phone_at=((0.76, 0.56), 1080 * 1.05, -8))
    build(1080, 1920, (0.72, 0.22), (0.20, 0.58), os.path.join(here, "event-details-9x16.png"),
          phone_at=((0.54, 0.33), 1920 * 0.56, -6))
