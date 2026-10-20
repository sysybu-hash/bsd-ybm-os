import sys, os, glob, time, json
sys.path.insert(0, r"C:\Users\User\AI")
from klein_lib import *
import cv2, numpy as np, torch
SRC = sys.argv[1]; DST = sys.argv[2]; os.makedirs(DST, exist_ok=True)
only = sys.argv[3:]
W, H = int(os.environ.get("W", 1536)), int(os.environ.get("H", 960))
KEEP = ("Nothing is added, removed, moved or resized: every object in the picture keeps its count, position, size and shape, and every empty surface (terraces, roofs, paving, road, ground) stays empty. "
        "Every colour family stays: white stays white, grey paving stays grey, timber stays timber, green trees stay green, asphalt stays dark grey. Crisp focus across the whole picture.")
EXT = "Restyle this 3D render of a building as a photograph by giving its existing surfaces realistic limestone, glass, paving, asphalt and soil textures under natural sunlight. " + KEEP
INT = "Restyle this 3D render of a room as a photograph by giving its existing surfaces realistic plaster, glass, flooring and furniture textures under natural daylight. " + KEEP
INTERIOR = ("lobby", "hall", "design", "event-hall", "classroom", "workshop", "computers")
def lab(i): return cv2.cvtColor(i, cv2.COLOR_BGR2LAB).astype(np.float32)
def fuse(src, ai, sigma=24, cap=14.0):
    """Source low frequencies (colour, tone) + the source's own fine detail + the AI's deviation from it, capped: texture is added, an invented object cannot be."""
    s, a = lab(src), lab(ai)
    ls, la = cv2.GaussianBlur(s, (0, 0), sigma), cv2.GaussianBlur(a, (0, 0), sigma)
    hs, ha = s - ls, a - la
    out = ls + hs + cap * np.tanh((ha - hs) / cap)
    return cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
def qa(src, ai):
    """Tile-wise edge agreement: recall (source lines kept) and precision (lines not invented), 8x5 tiles."""
    g = lambda im: cv2.Canny(cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), (3, 3), 0), 60, 150) > 0
    a, b = g(src), g(ai); k = np.ones((9, 9), np.uint8)
    da, db = cv2.dilate(a.astype(np.uint8), k) > 0, cv2.dilate(b.astype(np.uint8), k) > 0
    h, w = a.shape; rec, pre = [], []
    for j in range(5):
        for i in range(8):
            ys, xs = slice(j * h // 5, (j + 1) * h // 5), slice(i * w // 8, (i + 1) * w // 8)
            if a[ys, xs].sum() > 150: rec.append((a[ys, xs] & db[ys, xs]).sum() / a[ys, xs].sum())
            if b[ys, xs].sum() > 150: pre.append((b[ys, xs] & da[ys, xs]).sum() / b[ys, xs].sum())
    return float(np.mean(rec)), float(min(rec)), float(np.mean(pre)), float(min(pre))
pipe = load("GPU")
for f in sorted(glob.glob(os.path.join(SRC, "*.jpg"))):
    name = os.path.basename(f)[:-4].replace("pisga-", "")
    if only and name not in only: continue
    inter = name in INTERIOR
    big = cv2.imread(f); src = cv2.resize(big, (W, H), interpolation=cv2.INTER_AREA)
    best = None
    for seed in (11, 23):
        t = time.time()
        r = pipe(image=[Image.fromarray(cv2.cvtColor(src, cv2.COLOR_BGR2RGB))], prompt=INT if inter else EXT, num_inference_steps=4, guidance_scale=1.0, num_images_per_prompt=1, width=W, height=H, generator=torch.Generator().manual_seed(seed)).images[0]
        ai = cv2.cvtColor(np.array(r), cv2.COLOR_RGB2BGR)
        fz = fuse(src, ai)
        mr, minr, mp, minp = qa(src, fz)
        score = mr + 0.6 * minr
        print(f"{name} seed {seed}: {time.time()-t:.0f}s recall {mr:.2f} (min tile {minr:.2f}) precision {mp:.2f} (min {minp:.2f}) score {score:.2f}", flush=True)
        if best is None or score > best[0]: best = (score, seed, ai, fz, (mr, minr, mp, minp))
        if mr >= 0.85 and minr >= 0.5: break
    score, seed, ai, fz, q = best
    up = lambda im: cv2.resize(im, (big.shape[1], big.shape[0]), interpolation=cv2.INTER_LANCZOS4)
    final = fuse(big, up(ai), sigma=36)
    cv2.imwrite(os.path.join(DST, name + ".png"), final)
    cv2.imwrite(os.path.join(DST, name + "-flux-raw.png"), ai)
    sheet = np.hstack([cv2.resize(big, (1200, 750)), np.full((750, 8, 3), 255, np.uint8), cv2.resize(final, (1200, 750))])
    cv2.imwrite(os.path.join(DST, name + "-compare.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 90])
    json.dump({"seed": seed, "recall": q[0], "min_tile_recall": q[1], "precision": q[2], "min_tile_precision": q[3]}, open(os.path.join(DST, name + ".json"), "w"))
    print(f"== {name} kept seed {seed} q {q}", flush=True)
