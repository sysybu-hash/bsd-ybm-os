import sys, os, time
sys.path.insert(0, r"C:\Users\User\AI\fastsdcpu\src")
import numpy as np, cv2
from PIL import Image
OUT = r"C:\Users\User\AI\out"
def load(dev="GPU"):
    from backend.openvino.ov_flux2klein_pipeline import OVFlux2KleinPipeline
    return OVFlux2KleinPipeline.from_pretrained(r"C:\Users\User\AI\models\flux2-klein-4b-int4-ov", local_files_only=True, ov_config={"CACHE_DIR": ""}, device=dev)
def edit(pipe, img, prompt, steps):
    return pipe(image=[img], prompt=prompt, num_inference_steps=steps, guidance_scale=1.0, num_images_per_prompt=1).images[0]
def edges(im):
    g = cv2.cvtColor(np.array(im.convert("RGB")), cv2.COLOR_RGB2GRAY); g = cv2.GaussianBlur(g, (3, 3), 0)
    return cv2.Canny(g, 60, 150) > 0
def fidelity(src, res, tol=4):
    a, b = edges(src), edges(res.resize(src.size, Image.LANCZOS))
    k = np.ones((2 * tol + 1, 2 * tol + 1), np.uint8)
    da, db = cv2.dilate(a.astype(np.uint8), k) > 0, cv2.dilate(b.astype(np.uint8), k) > 0
    recall = (a & db).sum() / max(1, a.sum())      # source lines still there
    precision = (b & da).sum() / max(1, b.sum())   # result lines that were in the source
    return recall, precision
