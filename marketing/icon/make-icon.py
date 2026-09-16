#!/usr/bin/env python3
"""App icon studies for the GameDial rename.

The shipped icon is a rebus of the old name: football (game) + clock (time) + bell (reminder).
That name is gone, and the clock and bell now illustrate a positioning the app has moved away
from - it is no longer "a reminder app", it answers which channel. The new name hands us a much
better metaphor for free: a dial.

Everything here is drawn, not rendered: flat shapes, the app's own palette, no gloss or bevel, and
few enough elements to survive 60x60, which is the only size most people ever see. Drawn at 4x and
downsampled for clean edges.

    python3 marketing/icon/make-icon.py
"""
import math
import os
from PIL import Image, ImageDraw

SS = 4                                   # supersample factor
NAVY_TOP, NAVY_BOT = (0x16, 0x25, 0x42), (0x07, 0x0C, 0x18)
AMBER = (0xFF, 0xB7, 0x4D)
TICK = (0x46, 0x5D, 0x87)
WHITE = (0xF4, 0xF7, 0xFC)
LEATHER = (0xC2, 0x52, 0x2E)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def football(d, cx, cy, half_len, half_wid, angle, fill, laces=True):
    """A football as the lens of two overlapping circles - the real silhouette, pointed ends and
    all, rather than an ellipse with the tips faked on."""
    L, W = half_len, half_wid
    R = (L * L + W * W) / (2 * W)
    off = R - W
    a = math.radians(angle)
    ca, sa = math.cos(a), math.sin(a)

    def place(x, y):
        return (cx + x * ca - y * sa, cy + x * sa + y * ca)

    top, bottom = [], []
    steps = 220
    for i in range(steps + 1):
        x = -L + (2 * L) * i / steps
        y = math.sqrt(max(0.0, R * R - x * x)) - off
        top.append(place(x, -y))
        bottom.append(place(x, y))
    d.polygon(top + bottom[::-1], fill=fill)
    # Blunt the two cusps. A pure lens comes to a point and reads as a leaf; a real ball has a
    # small rounded nose, and that one detail is the difference between football and foliage.
    nose = W * 0.30
    for tip in (-L + nose * 0.55, L - nose * 0.55):
        px, py = place(tip, 0)
        d.ellipse([px - nose, py - nose, px + nose, py + nose], fill=fill)

    if not laces:
        return
    lw = max(3, round(W * 0.17))
    d.line([place(-L * 0.26, 0), place(L * 0.26, 0)], fill=WHITE, width=lw)
    for i in range(4):
        x = -L * 0.21 + (L * 0.42) * i / 3
        d.line([place(x, -W * 0.34), place(x, W * 0.34)], fill=WHITE, width=lw)


def ticks(d, cx, cy, radius, span, count, lit_index, base_len, lit_len):
    """A tuner scale. One tick is lit: the channel you are on."""
    start, end = span
    for i in range(count):
        t = i / (count - 1)
        ang = math.radians(start + (end - start) * t)
        lit = i == lit_index
        ln = lit_len if lit else (base_len * (1.55 if i % 5 == 0 else 1.0))
        w = round(base_len * (0.42 if lit else 0.20))
        x0, y0 = cx + math.cos(ang) * radius, cy + math.sin(ang) * radius
        x1, y1 = cx + math.cos(ang) * (radius - ln), cy + math.sin(ang) * (radius - ln)
        d.line([(x0, y0), (x1, y1)], fill=AMBER if lit else TICK, width=w)


def canvas(size):
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        d.line([(0, y), (size, y)], fill=lerp(NAVY_TOP, NAVY_BOT, (y / (size - 1)) ** 0.9))
    return img, d


def design_tuner(size):
    """Full dial ring, ball level in the middle, one tick lit at twelve o'clock."""
    img, d = canvas(size)
    c = size / 2
    ticks(d, c, c, size * 0.405, (-180, 180), 61, 15, size * 0.045, size * 0.105)
    football(d, c, c * 1.02, size * 0.255, size * 0.150, -14, LEATHER)
    return img


def design_pointer(size):
    """The ball *is* the needle: it points at the lit tick. One idea, three shapes."""
    img, d = canvas(size)
    c = size / 2
    ticks(d, c, c * 1.06, size * 0.415, (-168, -12), 27, 13, size * 0.048, size * 0.115)
    football(d, c, c * 1.10, size * 0.270, size * 0.158, -30, LEATHER)
    return img


def design_minimal(size):
    """No ring at all - just the ball, big, with a single amber arc of scale behind it."""
    img, d = canvas(size)
    c = size / 2
    ticks(d, c, c, size * 0.435, (-150, -30), 13, 6, size * 0.052, size * 0.120)
    football(d, c, c * 1.06, size * 0.310, size * 0.182, -18, LEATHER)
    return img


DESIGNS = {"tuner": design_tuner, "pointer": design_pointer, "minimal": design_minimal}


def render(fn, size):
    return fn(size * SS).resize((size, size), Image.LANCZOS)


def rounded(img, radius_frac=0.2237):        # iOS squircle, near enough for a preview
    r = round(img.size[0] * radius_frac)
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], r, fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def contact_sheet(here):
    """The argument, made visible: every design at the sizes people actually see it.

    A 1024px preview flatters any icon. 60x60 is the home screen and 88x88 is the search result,
    and that is where a busy icon turns to mush."""
    sizes = [180, 120, 88, 60]
    pad, gap, label = 40, 34, 46
    big = 260
    w = pad * 2 + big + gap + sum(sizes) + gap * len(sizes)
    h = pad * 2 + len(DESIGNS) * (big + gap) + label
    sheet = Image.new("RGB", (w, h), (0x0B, 0x10, 0x1C))
    d = ImageDraw.Draw(sheet)
    for row, (name, fn) in enumerate(DESIGNS.items()):
        y = pad + label + row * (big + gap)
        sheet.paste(rounded(render(fn, big)), (pad, y), rounded(render(fn, big)))
        d.text((pad, y - 22), name, fill=(0x94, 0xA6, 0xC4))
        x = pad + big + gap
        for s in sizes:
            ic = rounded(render(fn, s))
            sheet.paste(ic, (x, y + (big - s) // 2), ic)
            if row == 0:
                d.text((x, pad + 20), f"{s}px", fill=(0x94, 0xA6, 0xC4))
            x += s + gap
    path = os.path.join(here, "size-test.png")
    sheet.save(path, "PNG", optimize=True)
    print(f"{os.path.relpath(path)}  {w}x{h}")


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    for name, fn in DESIGNS.items():
        # 1024, square, no alpha, no rounded corners - Apple rejects anything else.
        p = os.path.join(here, f"icon-{name}-1024.png")
        render(fn, 1024).save(p, "PNG", optimize=True)
        print(f"{os.path.relpath(p)}  1024x1024")
    contact_sheet(here)
