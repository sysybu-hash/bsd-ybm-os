"""
Place each sheet-matched render on its sheet: a plan by its known frame, an
elevation or a section by registering the render's edges onto the drawing's
lines (translation, and scale within ±5%). Writes <id>.placed.png — the render
on a white sheet the size of the sheet image — and <id>.overlay.jpg, the
drawing's lines in red over it, the proof that the two agree.

  python scripts/pisga_compose.py <sheet pngs dir> <views dir> [suffix]

suffix picks the render file: "" for <id>.jpg, "finished" for <id>.finished.jpg.
"""
import json
import sys

import numpy as np
from PIL import Image, ImageFilter

sheets_dir, views_dir = sys.argv[1], sys.argv[2]
suffix = sys.argv[3] if len(sys.argv) > 3 else ""
meta = json.load(open(f"{views_dir}/sheets.json", encoding="utf8"))
K = 1.5


def edges(img: Image.Image) -> np.ndarray:
    g = np.asarray(img.convert("L").filter(ImageFilter.GaussianBlur(1.0)), dtype=np.float32)
    gx = np.zeros_like(g)
    gy = np.zeros_like(g)
    gx[:, 1:-1] = g[:, 2:] - g[:, :-2]
    gy[1:-1, :] = g[2:, :] - g[:-2, :]
    m = np.hypot(gx, gy)
    cut = np.percentile(m, 90)
    return (m > max(cut, 8)).astype(np.float32)


def blur(a: np.ndarray, r: float) -> np.ndarray:
    return np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255


def register(render: Image.Image, target: Image.Image, narrow: bool = False):
    """Best (scale, dx, dy) placing render (at scale) into target's frame."""
    t = blur((np.asarray(target.convert("L")) < 140).astype(np.float32), 1.5)
    t = t - t.mean()
    best = None
    # Coarse over the scales a sheet is plotted at, then fine round the best.
    scales = [1.0] if narrow else list(np.arange(0.78, 1.12, 0.03))
    for s in scales:
        w = int(render.width * s / K)
        h = int(render.height * s / K)
        r = blur(edges(render.resize((w, h))), 1.5)
        r = r - r.mean()
        H = t.shape[0] + r.shape[0]
        W = t.shape[1] + r.shape[1]
        F = np.fft.rfft2(t, (H, W)) * np.conj(np.fft.rfft2(r, (H, W)))
        c = np.fft.irfft2(F, (H, W))
        idx = np.unravel_index(np.argmax(c), c.shape)
        dy = idx[0] if idx[0] < t.shape[0] else idx[0] - H
        dx = idx[1] if idx[1] < t.shape[1] else idx[1] - W
        score = c[idx] / (np.linalg.norm(r) + 1e-6)
        if best is None or score > best[0]:
            best = (score, s, dx, dy)
    if True:
        coarse = best[1]
        best = None
        for s in np.arange(coarse - 0.02, coarse + 0.021, 0.005):
            w = int(render.width * s / K)
            h = int(render.height * s / K)
            r = blur(edges(render.resize((w, h))), 1.5)
            r = r - r.mean()
            H = t.shape[0] + r.shape[0]
            W = t.shape[1] + r.shape[1]
            c = np.fft.irfft2(np.fft.rfft2(t, (H, W)) * np.conj(np.fft.rfft2(r, (H, W))), (H, W))
            idx = np.unravel_index(np.argmax(c), c.shape)
            dy = idx[0] if idx[0] < t.shape[0] else idx[0] - H
            dx = idx[1] if idx[1] < t.shape[1] else idx[1] - W
            score = c[idx] / (np.linalg.norm(r) + 1e-6)
            if best is None or score > best[0]:
                best = (score, s, dx, dy)
    return best


for vid, m in meta.items():
    sheet = Image.open(f"{sheets_dir}/sheet-{m['sheet']:02d}.png").convert("RGB")
    name = f"{views_dir}/{vid}{'.' + suffix if suffix else ''}.jpg"
    try:
        render = Image.open(name).convert("RGB")
    except FileNotFoundError:
        continue
    x0, y0, x1, y1 = m["box"]
    canvas_path = f"{views_dir}/sheet-{m['sheet']:02d}{'.' + suffix if suffix else ''}.placed.png"
    try:
        canvas = Image.open(canvas_path).convert("RGB")
    except FileNotFoundError:
        canvas = Image.new("RGB", (int(sheet.width * K), int(sheet.height * K)), "white")
    if m["kind"] == "plan":
        placed = render.resize((int((x1 - x0) * K), int((y1 - y0) * K)))
        canvas.paste(placed, (int(x0 * K), int(y0 * K)))
        m["place"] = [1.0, 0, 0]
    else:
        if "place" not in m or not suffix:
            score, s, dx, dy = register(render, sheet.crop((x0, y0, x1, y1)), narrow="ratio" in m)
            m["place"] = [float(s), int(dx), int(dy)]
            print(vid, "scale %.2f dx %d dy %d score %.1f" % (s, dx, dy, score))
        s, dx, dy = m["place"]
        w = int(render.width * s)
        h = int(render.height * s)
        big = render.resize((w, h))
        # Only inside the drawing's own box.
        region = Image.new("RGB", (int((x1 - x0) * K), int((y1 - y0) * K)), "white")
        region.paste(big, (int(dx * K), int(dy * K)))
        canvas.paste(region, (int(x0 * K), int(y0 * K)))
    canvas.save(canvas_path)
    # Proof: the drawing's lines over the placed render, inside the box.
    crop = canvas.crop((int(x0 * K), int(y0 * K), int(x1 * K), int(y1 * K)))
    lines = np.asarray(sheet.crop((x0, y0, x1, y1)).convert("L").resize(crop.size)) < 120
    proof = np.asarray(crop).copy()
    proof[lines] = (230, 0, 0)
    Image.fromarray(proof).save(f"{views_dir}/{vid}{'.' + suffix if suffix else ''}.overlay.jpg", quality=85)

json.dump(meta, open(f"{views_dir}/sheets.json", "w", encoding="utf8"), indent=2)
