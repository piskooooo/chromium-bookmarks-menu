#!/usr/bin/env python3
"""Generate the extension icons (bookmark ribbon) as PNGs, no third-party deps.

Supersampled coverage mask -> RGBA PNG via zlib + struct from the stdlib.
"""

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"
SIZES = (16, 32, 48, 128)
SS = 4  # supersampling factor
FILL = (91, 106, 240, 255)  # accent blue
EDGE = (58, 68, 170, 255)  # darker rim so it reads on light backgrounds


def inside(x, y, w, h):
    """Bookmark ribbon: rounded-top rect with a V notch at the bottom."""
    pad_x = w * 0.22
    pad_y = h * 0.16
    left, right = pad_x, w - pad_x
    top, bottom = pad_y, h - pad_y
    if x < left or x > right or y < top or y > bottom:
        return False
    # bottom notch: triangle cut reaching up from the middle of the bottom edge
    notch_w = (right - left) * 0.36
    cx = (left + right) / 2
    if y > bottom - (bottom - top) * 0.42:
        depth = (y - (bottom - (bottom - top) * 0.42)) / ((bottom - top) * 0.42)
        if abs(x - cx) < notch_w * (1 - depth) / 2 + 1e-9:
            return False
    return True


def render(size):
    w = h = size
    big = size * SS
    px = bytearray(w * h * 4)
    for y in range(h):
        for x in range(w):
            hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    if inside((x * SS + sx + 0.5) / big * w, (y * SS + sy + 0.5) / big * h, w, h):
                        hits += 1
            if not hits:
                continue
            cover = hits / (SS * SS)
            # rim: low coverage pixels get the edge colour
            r, g, b, _ = FILL if cover > 0.65 * cover or hits == SS * SS else EDGE
            r, g, b, _ = (FILL if hits == SS * SS else EDGE)
            i = (y * w + x) * 4
            px[i : i + 4] = bytes((r, g, b, int(cover * 255)))
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
