#!/usr/bin/env python3
"""App Store screenshots: each raw simulator capture framed with a headline.

The raw captures are real renders of the shipping app (CI launches it in screenshot mode). This
puts each one on the app's navy, under a short headline in the app's own type colours, at the
exact pixel size Apple accepts for the 6.9-inch display - Apple scales that set down for every
smaller iPhone, so it is the only set the listing needs.

    python3 marketing/store-art/compose.py <raw capture dir> <output dir>

A capture that is missing is reported and skipped rather than fatal, so one bad shot does not
cost the other seven.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1290, 2796
BG_TOP, BG_BOTTOM = (0x12, 0x1E, 0x38), (0x05, 0x08, 0x10)
TEXT = (0xF2, 0xF5, 0xFA)
DIM = (0x94, 0xA6, 0xC4)
ACCENT = (0xFF, 0xB7, 0x4D)      # Theme.accent - "Dial"
ON_AIR = (0x45, 0xD5, 0x41)      # Theme.onAir - the icon's TV light, games on your station

# Order is the order in the listing. The first two are the ones most people ever see, so they
# carry the two things this release added that nobody else does: your games in green, and scores.
# Each headline is (text, colour) runs so one word can carry the accent.
SHOTS = [
    ("06-every-game-list", [("Games you can watch", TEXT), (" in green", ON_AIR)],
     "See at a glance what's on your TV and your services"),
    ("01-this-week", [("Live scores", ACCENT), (" on every game", TEXT)],
     "Where each game stands and which quarter it's in"),
    ("02-game-details", [("Tap", ACCENT), (" to open the full card", TEXT)],
     "Your channel number, your station and when coverage starts"),
    ("07-final-scores", [("Final scores", ACCENT), (" all week", TEXT)],
     "Every result and every record, one line per game"),
    ("05-every-game", [("A sleek new look", TEXT)],
     "Every game, every network, in team colours"),
    ("03-alerts", [("Never miss", TEXT), (" kickoff", ACCENT)],
     "Reminders for pregame coverage and kickoff"),
    ("08-setup", [("Where are you", TEXT), (" watching?", ACCENT)],
     "Your ZIP and your TV provider. That's the whole setup"),
    ("04-settings", [("New TV maps", ON_AIR), (" every Wednesday", TEXT)],
     "Coverage updates on its own, with no app update"),
    # A real phone, not the simulator: week 6 as it looked in West Palm Beach once that week's
    # maps were read. Names under captures/ are files kept in this folder, so a CI run that
    # regenerates the set keeps them.
    ("captures/week6-west-palm (original, no headline)", [("Prepare for the ", TEXT), ("week ahead", ACCENT)],
     "See what's showing in your area"),
]

# Rounded bold first, as close to the app's SF Rounded as a font file gets. DejaVu is only there
# so the script can be tried on a machine without the macOS fonts.
FONT_BOLD = [
    "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf",
    "/Library/Fonts/Arial Rounded Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
FONT_REG = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def font(paths, size):
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def background():
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        d.line([(0, y), (W, y)], fill=lerp(BG_TOP, BG_BOTTOM, (y / (H - 1)) ** 0.9))
    # A soft amber glow behind the headline, screened on so the hue survives the navy.
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W * 0.1, -H * 0.06, W * 0.9, H * 0.16], fill=(60, 38, 10))
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    from PIL import ImageChops
    return ImageChops.screen(img, glow)


def headline(d, runs, y, size):
    f = font(FONT_BOLD, size)
    widths = [d.textlength(t, font=f) for t, _ in runs]
    total = sum(widths)
    if total > W - 120:                       # shrink to fit rather than run off the edge
        return headline(d, runs, y, int(size * (W - 120) / total))
    x = (W - total) / 2
    for (t, c), w in zip(runs, widths):
        d.text((x, y), t, font=f, fill=c)
        x += w
    return size


def compose(raw, runs, sub, out):
    img = background()
    d = ImageDraw.Draw(img)
    size = headline(d, runs, 150, 104)
    fs = font(FONT_REG, 48)
    sw = d.textlength(sub, font=fs)
    if sw > W - 140:
        fs = font(FONT_REG, int(48 * (W - 140) / sw)); sw = d.textlength(sub, font=fs)
    d.text(((W - sw) / 2, 150 + size + 44), sub, font=fs, fill=DIM)

    # The phone screen: 84% of the width, rounded like the hardware, with a lit edge and a shadow,
    # running off the bottom so the shot reads as a device without drawing one.
    shot = Image.open(raw).convert("RGB")
    sw_ = round(W * 0.84)
    sh_ = round(shot.height * sw_ / shot.width)
    shot = shot.resize((sw_, sh_), Image.LANCZOS)
    top = 150 + size + 44 + 48 + 110
    x = (W - sw_) // 2
    radius = round(sw_ * 0.115)
    mask = Image.new("L", (sw_, sh_), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw_ - 1, sh_ - 1], radius, fill=255)

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([x - 6, top + 30, x + sw_ + 6, top + sh_ + 30], radius, fill=(0, 0, 0, 190))
    shadow = shadow.filter(ImageFilter.GaussianBlur(50))
    img = Image.alpha_composite(img.convert("RGBA"), shadow)
    bezel = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(bezel).rounded_rectangle([x - 14, top - 14, x + sw_ + 13, top + sh_ + 13], radius + 14,
                                            fill=(0x0B, 0x10, 0x1C, 255), outline=(0x3A, 0x4E, 0x72, 255), width=4)
    img = Image.alpha_composite(img, bezel)
    img.paste(shot, (x, top), mask)
    img.convert("RGB").save(out, "PNG", optimize=True)


def main(src, dst):
    os.makedirs(dst, exist_ok=True)
    made = 0
    for i, (name, runs, sub) in enumerate(SHOTS, 1):
        here = os.path.dirname(os.path.abspath(__file__))
        raw = os.path.join(here if "/" in name else src, name + ".png")
        if not os.path.exists(raw):
            print(f"MISSING {raw} - skipped")
            continue
        label = os.path.basename(name).split(" (")[0] if "/" in name else name[3:]
        out = os.path.join(dst, f"{i:02d}-{label}.png")
        compose(raw, runs, sub, out)
        made += 1
        print("wrote", out)
    print(f"{made} of {len(SHOTS)} store images")
    return made


if __name__ == "__main__":
    sys.exit(0 if main(sys.argv[1], sys.argv[2]) == len(SHOTS) else 1)
