"""One FLUX.2 klein pass (local, OpenVINO, iGPU):
   python flux_job.py <src> <out.jpg> <prompt.txt> [steps=2] [width=1024] [cap=14] [sigma=30] [seed=0]

The source is a render from the free engine; the result keeps its tones (a capped detail fusion), so the layout and the colours of the render stay and FLUX adds what a photograph has:
texture, light, material. `cap` is how far FLUX may move a pixel's fine detail from the render's (smaller = more faithful, larger = freer); `sigma` the scale under which detail is taken from FLUX.
"""
import os, sys, time
FASTSD = os.environ.get("FASTSD_DIR", r"C:\Users\User\AI\fastsdcpu")
sys.path.insert(0, os.path.join(FASTSD, "src"))
import cv2, numpy as np
from PIL import Image

a = sys.argv
src, out, prompt_file = a[1], a[2], a[3]
steps = int(a[4]) if len(a) > 4 else 2
width = int(a[5]) if len(a) > 5 else 1024
cap = float(a[6]) if len(a) > 6 else 14.0
sigma = float(a[7]) if len(a) > 7 else 30.0
seed = int(a[8]) if len(a) > 8 else 0
MODEL = os.environ.get("KLEIN_DIR", os.path.join(os.path.dirname(FASTSD), "models", "flux2-klein-4b-int4-ov"))

big = cv2.imdecode(np.fromfile(src, dtype=np.uint8), cv2.IMREAD_COLOR)
h0, w0 = big.shape[:2]
w = width // 16 * 16
h = int(round(w * h0 / w0 / 16)) * 16
small = cv2.resize(big, (w, h), interpolation=cv2.INTER_AREA)

import torch
from backend.openvino.ov_flux2klein_pipeline import OVFlux2KleinPipeline
t = time.time()
pipe = OVFlux2KleinPipeline.from_pretrained(MODEL, local_files_only=True, ov_config={"CACHE_DIR": ""}, device="GPU")
prompt = open(prompt_file, encoding="utf8").read().strip()
kw = {"generator": torch.Generator().manual_seed(seed)} if seed else {}
r = pipe(image=[Image.fromarray(cv2.cvtColor(small, cv2.COLOR_BGR2RGB))], prompt=prompt, num_inference_steps=steps, guidance_scale=1.0, num_images_per_prompt=1, width=w, height=h, **kw).images[0]
ai = cv2.cvtColor(np.array(r), cv2.COLOR_RGB2BGR)
print(f"flux {time.time() - t:.0f}s")

def lab(i): return cv2.cvtColor(i, cv2.COLOR_BGR2LAB).astype(np.float32)
def fuse(a_img, ai_img):
    s, x = lab(a_img), lab(ai_img)
    ls, lx = cv2.GaussianBlur(s, (0, 0), sigma), cv2.GaussianBlur(x, (0, 0), sigma)
    hs, hx = s - ls, x - lx
    o = ls + hs + cap * np.tanh((hx - hs) / cap)
    return cv2.cvtColor(np.clip(o, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)

fused = fuse(small, cv2.resize(ai, (w, h)))
final = cv2.resize(fused, (w0, h0), interpolation=cv2.INTER_LANCZOS4) if w < w0 else fused
ok, buf = cv2.imencode(".jpg", final, [cv2.IMWRITE_JPEG_QUALITY, 94])
buf.tofile(out)
print("saved", out)
