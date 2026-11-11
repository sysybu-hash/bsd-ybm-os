"""FLUX.2 klein over many renders in ONE process (the model is loaded and compiled once, not once per picture):
   python flux_batch.py <prompt.txt> <out dir> <steps> <width> <cap> <sigma> <seed> <src1> [src2 ...]

Same pass and same detail fusion as flux_job.py; each result is <out dir>/<source name without -raw>.jpg and is skipped when it exists.
"""
import os, sys, time
FASTSD = os.environ.get("FASTSD_DIR", r"C:\Users\User\AI\fastsdcpu")
sys.path.insert(0, os.path.join(FASTSD, "src"))
import cv2, numpy as np
from PIL import Image

a = sys.argv
prompt_file, out_dir = a[1], a[2]
steps, width, cap, sigma, seed = int(a[3]), int(a[4]), float(a[5]), float(a[6]), int(a[7])
sources = a[8:]
MODEL = os.environ.get("KLEIN_DIR", os.path.join(os.path.dirname(FASTSD), "models", "flux2-klein-4b-int4-ov"))
os.makedirs(out_dir, exist_ok=True)

import torch
from backend.openvino.ov_flux2klein_pipeline import OVFlux2KleinPipeline
t0 = time.time()
pipe = OVFlux2KleinPipeline.from_pretrained(MODEL, local_files_only=True, ov_config={"CACHE_DIR": ""}, device="GPU")
prompt = open(prompt_file, encoding="utf8").read().strip()
print(f"model loaded {time.time() - t0:.0f}s", flush=True)

def lab(i): return cv2.cvtColor(i, cv2.COLOR_BGR2LAB).astype(np.float32)
def fuse(a_img, ai_img):
    s, x = lab(a_img), lab(ai_img)
    ls, lx = cv2.GaussianBlur(s, (0, 0), sigma), cv2.GaussianBlur(x, (0, 0), sigma)
    hs, hx = s - ls, x - lx
    o = ls + hs + cap * np.tanh((hx - hs) / cap)
    return cv2.cvtColor(np.clip(o, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)

for src in sources:
    name = os.path.basename(src).replace("-raw", "").rsplit(".", 1)[0]
    out = os.path.join(out_dir, name + ".jpg")
    if os.path.exists(out):
        continue
    t = time.time()
    big = cv2.imdecode(np.fromfile(src, dtype=np.uint8), cv2.IMREAD_COLOR)
    h0, w0 = big.shape[:2]
    w = width // 16 * 16
    h = int(round(w * h0 / w0 / 16)) * 16
    small = cv2.resize(big, (w, h), interpolation=cv2.INTER_AREA)
    kw = {"generator": torch.Generator().manual_seed(seed)} if seed else {}
    r = pipe(image=[Image.fromarray(cv2.cvtColor(small, cv2.COLOR_BGR2RGB))], prompt=prompt, num_inference_steps=steps, guidance_scale=1.0, num_images_per_prompt=1, width=w, height=h, **kw).images[0]
    ai = cv2.cvtColor(np.array(r), cv2.COLOR_RGB2BGR)
    fused = fuse(small, cv2.resize(ai, (w, h)))
    final = cv2.resize(fused, (w0, h0), interpolation=cv2.INTER_LANCZOS4) if w < w0 else fused
    ok, buf = cv2.imencode(".jpg", final, [cv2.IMWRITE_JPEG_QUALITY, 94])
    buf.tofile(out)
    print(f"done {name} {time.time() - t:.0f}s", flush=True)
print("ALL DONE", flush=True)
