"""One FLUX.2 klein pass (local, OpenVINO, iGPU): python flux_job.py <src> <out.jpg> <prompt.txt> [steps=2] [width=1024]

The source is a render from the free engine; the result keeps its tones (a capped detail fusion, as scripts/pisga-ai does), so the layout and the colours of the render stay and FLUX adds what a
photograph has: texture, light, material.
"""
import os, sys, time
FASTSD = os.environ.get("FASTSD_DIR", r"C:\Users\User\AI\fastsdcpu")
sys.path.insert(0, os.path.join(FASTSD, "src"))
import cv2, numpy as np
from PIL import Image

src, out, prompt_file = sys.argv[1], sys.argv[2], sys.argv[3]
steps = int(sys.argv[4]) if len(sys.argv) > 4 else 2
width = int(sys.argv[5]) if len(sys.argv) > 5 else 1024
MODEL = os.environ.get("KLEIN_DIR", os.path.join(os.path.dirname(FASTSD), "models", "flux2-klein-4b-int4-ov"))

big = cv2.imread(src)
h0, w0 = big.shape[:2]
w = width // 16 * 16
h = int(round(w * h0 / w0 / 16)) * 16
small = cv2.resize(big, (w, h), interpolation=cv2.INTER_AREA)

from backend.openvino.ov_flux2klein_pipeline import OVFlux2KleinPipeline
t = time.time()
pipe = OVFlux2KleinPipeline.from_pretrained(MODEL, local_files_only=True, ov_config={"CACHE_DIR": ""}, device="GPU")
prompt = open(prompt_file, encoding="utf8").read().strip()
r = pipe(image=[Image.fromarray(cv2.cvtColor(small, cv2.COLOR_BGR2RGB))], prompt=prompt, num_inference_steps=steps, guidance_scale=1.0, num_images_per_prompt=1).images[0]
ai = cv2.cvtColor(np.array(r), cv2.COLOR_RGB2BGR)
print(f"flux {time.time() - t:.0f}s")

def lab(i): return cv2.cvtColor(i, cv2.COLOR_BGR2LAB).astype(np.float32)
def fuse(a_img, ai_img, sigma=30, cap=14.0):
    s, a = lab(a_img), lab(ai_img)
    ls, la = cv2.GaussianBlur(s, (0, 0), sigma), cv2.GaussianBlur(a, (0, 0), sigma)
    hs, ha = s - ls, a - la
    o = ls + hs + cap * np.tanh((ha - hs) / cap)
    return cv2.cvtColor(np.clip(o, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)

fused = fuse(small, cv2.resize(ai, (w, h)))
final = cv2.resize(fused, (w0, h0), interpolation=cv2.INTER_LANCZOS4) if w < w0 else fused
cv2.imwrite(out, final, [cv2.IMWRITE_JPEG_QUALITY, 94])
print("saved", out)
