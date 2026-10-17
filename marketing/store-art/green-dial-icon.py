#!/usr/bin/env python3
"""Turn the orange "Dial" in the app icon artwork green, to match the wordmark in the app (1.0.9).

Only the neon letters and their glow change. Pixels in the orange-to-red range above the top edge
of the football are rotated to green, keeping their saturation and brightness, so the glow stays
a glow. The football's edge was traced by hand from a gridded close-up - it sits a few pixels
under the letters, and every automatic cut-off either missed the glow or tinted the leather.

    python3 marketing/store-art/green-dial-icon.py   (run once, from the original orange artwork)
"""
import colorsys
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "..", "..", "ios", "NFLGameReminder", "Assets.xcassets", "AppIcon.appiconset", "artwork.png")

# (x, y) along the football's top edge, in artwork pixels (1072x976).
BALL_TOP = [(570, 277), (600, 272), (620, 268), (650, 265), (700, 264), (730, 265),
            (760, 268), (790, 273), (810, 278), (830, 285), (850, 295), (870, 310), (890, 330)]


def ball_top(x):
    for (x0, y0), (x1, y1) in zip(BALL_TOP, BALL_TOP[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return 330


def main():
    im = Image.open(ART).convert("RGBA")
    px = im.load()
    for x in range(570, 890):
        stop = int(ball_top(x)) - 2
        for y in range(110, stop):
            r, g, b, a = px[x, y]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            h *= 360
            if (h <= 60 or h >= 330) and s > 0.10 and v > 0.04:
                if h >= 330:
                    h -= 360
                nr, ng, nb = colorsys.hsv_to_rgb((118 + (h - 25) * 0.25) / 360, s, v)
                px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    im.save(ART)
    print("recoloured", os.path.relpath(ART))


if __name__ == "__main__":
    main()
