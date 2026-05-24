"""Generate MyFit home-screen icons: white bold 'MF' on the title-area dark navy.
Full-bleed square (iOS applies its own rounded mask). Rendered at 4x then
downscaled for crisp anti-aliasing. Run: python make_icon.py"""
import os
from PIL import Image, ImageDraw, ImageFont

BG = (26, 26, 46)      # #1A1A2E  (title-area background, dark theme)
FG = (255, 255, 255)   # white
TEXT = "MF"
FONT = os.path.join(os.environ["WINDIR"], "Fonts", "arialbd.ttf")
MASTER = 1024

def render(size):
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    # grow font until "MF" fills ~74% of the width
    fs = int(size * 0.5)
    while fs < size:
        f = ImageFont.truetype(FONT, fs)
        b = d.textbbox((0, 0), TEXT, font=f)
        if (b[2] - b[0]) >= size * 0.74:
            break
        fs += 2
    f = ImageFont.truetype(FONT, fs)
    b = d.textbbox((0, 0), TEXT, font=f)
    w, h = b[2] - b[0], b[3] - b[1]
    x = (size - w) / 2 - b[0]
    y = (size - h) / 2 - b[1]
    d.text((x, y), TEXT, font=f, fill=FG)
    return img

master = render(MASTER)
for name, sz in [("apple-touch-icon.png", 180), ("icon-512.png", 512), ("icon-192.png", 192)]:
    master.resize((sz, sz), Image.LANCZOS).save(name)
    print("wrote", name, sz)
