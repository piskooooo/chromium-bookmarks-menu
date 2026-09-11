#!/usr/bin/env python3
"""Generate the extension icons (Helium-blue heart on a white square) as PNGs.

No third-party deps: supersampled coverage masks -> RGBA PNG via zlib + struct
from the stdlib.

Colours are Helium's own product-logo palette, sampled from
/opt/helium-browser-bin/product_logo_256.png: a flat #3450D1 blue with a
near-white glyph. The white rounded square is the deliberate inverse of
Bitwarden's blue square + white glyph, so the two sit together in the toolbar.
"""

import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"
SIZES = (16, 32, 48, 128)
SS = 6  # supersampling factor

FILL = (52, 80, 209, 255)  # Helium blue (heart)
EDGE = (34, 54, 152, 255)  # darker heart rim so it reads on light backgrounds
GLINT = (251, 252, 255, 255)  # Helium near-white, used for the sheen
WHITE = (255, 255, 255, 255)  # the square itself
# Ring around the square: at 16px a pale hairline vanishes against a light
# toolbar, so this is dark enough to define the (identical-value) white square
# on a white/grey background while staying quiet on a dark one.
BORDER = (166, 172, 184, 255)

# --- square: inset and corner radius, in canvas pixels -----------------------
SQUARE_INSET: dict[int, float] = {16: 0.5, 32: 0.75, 48: 1.0, 128: 3.0}
SQUARE_RADIUS = 0.18  # fraction of the square's side, ~Bitwarden's rounding
BORDER_WIDTH: dict[int, float] = {16: 1.0, 32: 1.0, 48: 1.5, 128: 3.0}
FALLBACK_INSET = 0.02  # fraction of the size, for any unlisted size
FALLBACK_BORDER = 1.0

# --- heart ------------------------------------------------------------------
# The classic implicit curve (x^2 + y^2 - 1)^3 - x^2 y^3 <= 0. Its lobes bulge
# wider than the unit circle (measured max |u| = 1.139 at v ~ 0.54), so the
# horizontal extent is normalised by U_MAX rather than 1.
U_MAX = 1.139
HEART_RATIO = 0.68  # heart width as a fraction of the square's side
HEART_RIM = 0.94  # inside this fraction of the heart is "fill", outside "rim"

# Below this the sheen turns to mush: at 16-32px a light pixel inside the blue
# reads as dust, so those sizes ship flat.
GLINT_MIN_SIZE = 48
GLINT_ALPHA = 0.55  # blend toward white so it never reads as a pasted sticker


def _heart(u, v):
    """u, v in heart space, v up. True inside the heart."""
    return (u * u + v * v - 1) ** 3 - u * u * v * v * v <= 0


def _glint(u, v):
    """Sheen on the upper-left lobe: 0 outside, ramping to 1 at its centre.

    A binary ellipse with a one-pixel edge reads as a pasted sticker, so the
    falloff is quadratic and gets averaged over the supersamples.
    """
    angle = math.radians(-38)
    du, dv = u + 0.60, v - 0.58
    ru = du * math.cos(angle) - dv * math.sin(angle)
    rv = du * math.sin(angle) + dv * math.cos(angle)
    d2 = (ru / 0.16) ** 2 + (rv / 0.26) ** 2
    return 0.0 if d2 >= 1 else 1 - d2


def _in_round_rect(px, py, x0, y0, x1, y1, r):
    """Point-in-rounded-rectangle, where (x0, y0)-(x1, y1) is the outer box."""
    if px < x0 or px > x1 or py < y0 or py > y1:
        return False
    cx = min(max(px, x0 + r), x1 - r)
    cy = min(max(py, y0 + r), y1 - r)
    dx, dy = px - cx, py - cy
    return dx * dx + dy * dy <= r * r


def _mix(base, top, a):
    return tuple(round(base[i] * (1 - a) + top[i] * a) for i in range(3))


def render(size):
    w = h = size
    inset = SQUARE_INSET.get(size, FALLBACK_INSET * size)
    side = size - 2 * inset
    radius = SQUARE_RADIUS * side
    border = BORDER_WIDTH.get(size, FALLBACK_BORDER)

    # heart geometry: bbox width = HEART_RATIO * square side, aspect from U_MAX
    scale = (HEART_RATIO * side) / 2 / U_MAX
    center = size / 2
    samples = SS * SS
    px = bytearray(w * h * 4)

    for y in range(h):
        for x in range(w):
            square_hits = heart_hits = rim_hits = 0
            border_hits = 0
            glint = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    fx = x + (sx + 0.5) / SS
                    fy = y + (sy + 0.5) / SS
                    if not _in_round_rect(fx, fy, inset, inset, size - inset, size - inset, radius):
                        continue
                    square_hits += 1
                    # hairline ring hugging the square's edge
                    in_border = not _in_round_rect(
                        fx,
                        fy,
                        inset + border,
                        inset + border,
                        size - inset - border,
                        size - inset - border,
                        max(radius - border, 0.0),
                    )
                    u = (fx - center) / scale
                    v = -(fy - center) / scale
                    if _heart(u, v):
                        heart_hits += 1
                        if not _heart(u / HEART_RIM, v / HEART_RIM):
                            rim_hits += 1
                        if size >= GLINT_MIN_SIZE:
                            glint += _glint(u, v)
                    elif in_border:
                        border_hits += 1

            if not square_hits:
                continue
            heart_cover = heart_hits / samples
            border_cover = border_hits / samples
            color = WHITE
            if border_cover:
                color = _mix(color, BORDER, min(border_cover, 1.0))
            if heart_cover:
                heart_color = (
                    EDGE
                    if heart_hits == samples and rim_hits > samples / 2
                    else FILL
                )
                if glint:
                    heart_color = _mix(
                        heart_color, GLINT, min((glint / heart_hits) * GLINT_ALPHA, 1.0)
                    )
                color = _mix(color, heart_color, min(heart_cover, 1.0))
            i = (y * w + x) * 4
            px[i : i + 4] = bytes(
                (*color, int(round(min(square_hits / samples, 1.0) * 255)))
            )
    return px


def png(path, size, pixels):
    raw = b"".join(
        b"\x00" + bytes(pixels[y * size * 4 : (y + 1) * size * 4]) for y in range(size)
    )

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    blob = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(blob)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        path = OUT / f"icon-{size}.png"
        png(path, size, render(size))
        print(f"{path}  {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
