#!/usr/bin/env python3
"""The GameDial app icon.

One idea: a ball tuned in on a dial. The name's own metaphor, the app's own palette, and few
enough shapes that it still says both things at 60x60 - which is the size that decides whether
anyone taps it, and the size the icon it replaces was never checked at.

Flat by intention. No leather photography, no bevel, no gloss: the shading is a single soft
vertical ramp that gives the ball form without pretending to be a photograph.

    python3 marketing/icon/make-logo.py
"""
import math
import os
from PIL import Image, ImageChops, ImageDraw, ImageFilter

SS = 4                                        # supersample, then downsample for clean edges

NAVY_TOP, NAVY_BOT = (0x17, 0x27, 0x45), (0x06, 0x0B, 0x16)
AMBER = (0xFF, 0xB7, 0x4D)
TICK = (0x4A, 0x62, 0x8D)
WHITE = (0xF6, 0xF9, 0xFD)
BALL_TOP, BALL_BOT = (0xD9, 0x5F, 0x33), (0x9C, 0x36, 0x1B)

BALL_ANGLE = -16
LIT = math.radians(-90)                        # the channel you are on, straight up


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def vgrad(size, top, bottom, gamma=1.0):
    img = Image.new("RGB", size)
    d = ImageDraw.Draw(img)
    for y in range(size[1]):
        d.line([(0, y), (size[0], y)], fill=lerp(top, bottom, (y / max(1, size[1] - 1)) ** gamma))
    return img


def ball_outline(cx, cy, L, W, angle, steps=320):
    """The real silhouette: the lens of two overlapping circles, with the cusps blunted. A pure
    lens comes to a point and reads as a leaf."""
    R = (L * L + W * W) / (2 * W)
    off = R - W
    a = math.radians(angle)
    ca, sa = math.cos(a), math.sin(a)
    place = lambda x, y: (cx + x * ca - y * sa, cy + x * sa + y * ca)
    top, bot = [], []
    for i in range(steps + 1):
        x = -L + 2 * L * i / steps
        y = math.sqrt(max(0.0, R * R - x * x)) - off
        top.append(place(x, -y))
        bot.append(place(x, y))
    return top + bot[::-1], place


def glow(size, centre, colour, radius, strength):
    """Light added rather than laid over: a translucent warm colour on near-black greys out."""
    layer = Image.new("RGB", size, (0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = centre
    steps = 48
    for i in range(steps, 0, -1):
        t = i / steps
        r = radius * t
        k = strength * (1 - t) ** 1.8
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=tuple(round(c * k) for c in colour))
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.22))


def build(S):
    img = vgrad((S, S), NAVY_TOP, NAVY_BOT, 0.88)
    c = S / 2
    dial_cx, dial_cy = c, S * 0.520
    radius = S * 0.395

    # Amber wash coming off the lit tick, so the dial reads as switched on rather than printed.
    img = ImageChops.screen(img, glow((S, S), (dial_cx + math.cos(LIT) * radius,
                                               dial_cy + math.sin(LIT) * radius),
                                      AMBER, S * 0.42, 0.30))

    d = ImageDraw.Draw(img)

    # The scale. Long marks every fifth, one lit: a tuner, not a clock - a clock is what the old
    # icon had and it illustrated a word no longer in the name.
    span, count = (-158, -22), 21
    for i in range(count):
        ang = math.radians(span[0] + (span[1] - span[0]) * i / (count - 1))
        lit = i == count // 2
        ln = S * (0.105 if lit else (0.058 if i % 5 == 0 else 0.038))
        w = round(S * (0.022 if lit else (0.0105 if i % 5 == 0 else 0.008)))
        p0 = (dial_cx + math.cos(ang) * radius, dial_cy + math.sin(ang) * radius)
        p1 = (dial_cx + math.cos(ang) * (radius - ln), dial_cy + math.sin(ang) * (radius - ln))
        d.line([p0, p1], fill=AMBER if lit else TICK, width=w)

    # The ball, optically centred: a touch below the dial's centre, because the squircle mask
    # crops the corners and the eye reads the remaining mass as sitting high.
    L, W = S * 0.288, S * 0.186
    bx, by = c, S * 0.578
    poly, place = ball_outline(bx, by, L, W, BALL_ANGLE)

    # Blunt the two cusps by blurring the mask and re-thresholding it. That is morphological
    # rounding: sharp convex corners lose area and soften, straight edges hold their position.
    # Two things that do not work, both tried: a circle at each tip leaves the ball with a pair of
    # visible lobes, and stroking the outline with a thick round pen spikes at every one of the
    # several hundred vertices and gives it a furry edge.
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(W * 0.16)).point(lambda v: 255 if v >= 116 else 0)

    ball = vgrad((S, S), BALL_TOP, BALL_BOT, 1.15)
    bd = ImageDraw.Draw(ball)
    # The two white rings a real ball carries near each end. Kept thin: at 60px they should read
    # as a hint of form, never as clutter.
    ring = round(S * 0.013)
    for x in (-L * 0.57, L * 0.57):
        bd.line([place(x, -W * 1.00), place(x, W * 1.00)], fill=WHITE, width=ring)
    lw = round(S * 0.019)
    bd.line([place(-L * 0.25, 0), place(L * 0.25, 0)], fill=WHITE, width=lw)
    for i in range(4):
        x = -L * 0.20 + (L * 0.40) * i / 3
        bd.line([place(x, -W * 0.33), place(x, W * 0.33)], fill=WHITE, width=lw)

    img.paste(ball, (0, 0), mask)
    return img


def render(size):
    return build(size * SS).resize((size, size), Image.LANCZOS)


def rounded(img, frac=0.2237):
    r = round(img.size[0] * frac)
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], r, fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), m)
    return out


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    # Square, no alpha, no rounded corners: Apple rejects anything else outright.
    master = render(1024)
    master.save(os.path.join(here, "icon-gamedial-1024.png"), "PNG", optimize=True)
    print("icon-gamedial-1024.png  1024x1024")

    sizes = [180, 120, 88, 60]
    pad, gap, big = 48, 40, 420
    w = pad * 2 + big + gap + sum(sizes) + gap * len(sizes)
    h = pad * 2 + big
    sheet = Image.new("RGB", (w, h), (0x0A, 0x0F, 0x1A))
    sheet.paste(rounded(master.resize((big, big), Image.LANCZOS)), (pad, pad),
                rounded(master.resize((big, big), Image.LANCZOS)))
    x = pad + big + gap
    for s in sizes:
        ic = rounded(render(s))
        sheet.paste(ic, (x, pad + (big - s) // 2), ic)
        x += s + gap
    sheet.save(os.path.join(here, "gamedial-sizes.png"), "PNG", optimize=True)
    print(f"gamedial-sizes.png  {w}x{h}")
