"""Render the selected SpaceTally mark to native Windows icon assets.

The path geometry and colors mirror icons/concept-d-path.svg. Pillow is used
here so icon generation does not depend on a browser or a native SVG library.
"""

from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets"
PUBLIC = ROOT / "src" / "renderer" / "public"
SCALE = 4
SIZE = 256 * SCALE


def rgba(hex_color: str) -> tuple[int, int, int, int]:
    return tuple(bytes.fromhex(hex_color.removeprefix("#"))) + (255,)


def bezier(start, control1, control2, end, steps=40):
    points = []
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        points.append((
            u ** 3 * start[0] + 3 * u ** 2 * t * control1[0] + 3 * u * t ** 2 * control2[0] + t ** 3 * end[0],
            u ** 3 * start[1] + 3 * u ** 2 * t * control1[1] + 3 * u * t ** 2 * control2[1] + t ** 3 * end[1],
        ))
    return points


def render():
    background = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bg_pixels = background.load()
    top = (37, 61, 155)
    bottom = (17, 31, 98)
    for y in range(SIZE):
        for x in range(SIZE):
            t = min(1, max(0, (x + y - 36 * SCALE) / (420 * SCALE)))
            bg_pixels[x, y] = tuple(round(a * (1 - t) + b * t) for a, b in zip(top, bottom)) + (255,)
    background_mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(background_mask).rounded_rectangle((8 * SCALE, 8 * SCALE, 248 * SCALE, 248 * SCALE), radius=56 * SCALE, fill=255)
    icon = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    icon.paste(background, (0, 0), background_mask)

    points = [(188, 65), (98, 65)]
    points += bezier((98, 65), (74, 65), (61, 78), (61, 98))
    points += bezier((61, 98), (61, 118), (75, 128), (99, 128))
    points.append((157, 128))
    points += bezier((157, 128), (181, 128), (195, 139), (195, 159))
    points += bezier((195, 159), (195, 179), (181, 192), (157, 192))
    points.append((66, 192))
    path_mask = Image.new("L", (SIZE, SIZE), 0)
    draw_mask = ImageDraw.Draw(path_mask)
    draw_mask.line([(round(x * SCALE), round(y * SCALE)) for x, y in points], fill=255, width=26 * SCALE, joint="curve")
    for x, y in (points[0], points[-1]):
        draw_mask.ellipse(((x - 13) * SCALE, (y - 13) * SCALE, (x + 13) * SCALE, (y + 13) * SCALE), fill=255)
    path_fill = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 255))
    fill_pixels = path_fill.load()
    for y in range(SIZE):
        t = y / SIZE
        color = tuple(round(255 * (1 - t) + c * t) for c in (215, 226, 255)) + (255,)
        for x in range(SIZE):
            fill_pixels[x, y] = color
    icon.paste(path_fill, (0, 0), path_mask)
    draw = ImageDraw.Draw(icon)
    for x, y in ((188, 65), (66, 192)):
        draw.ellipse(((x - 14) * SCALE, (y - 14) * SCALE, (x + 14) * SCALE, (y + 14) * SCALE), fill=rgba("#57E2D3"))

    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    png = icon.resize((256, 256), Image.Resampling.LANCZOS)
    png.save(OUT / "icon.png")
    png.save(PUBLIC / "icon.png")
    icon.save(OUT / "icon.ico", format="ICO", sizes=[(s, s) for s in (16, 20, 24, 32, 40, 48, 64, 128, 256)])
    print("Generated assets/icon.png, assets/icon.ico, and renderer icon.png")


if __name__ == "__main__":
    render()
