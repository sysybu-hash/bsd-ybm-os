import cv2, numpy as np, glob, os, sys
FREE = r"C:\Users\User\Desktop\BSD-YBM-OS\previews\pisga-final2\free"; FL = r"C:\Users\User\Desktop\BSD-YBM-OS\previews\pisga-final2\flux"
OUT = r"C:\Users\User\Desktop\BSD-YBM-OS\previews\pisga-final2\final"; os.makedirs(OUT, exist_ok=True)
def match(ch, ref):
    s, bi, c = np.unique(ch.ravel(), return_inverse=True, return_counts=True); r, rc = np.unique(ref.ravel(), return_counts=True)
    sc = np.cumsum(c) / ch.size; rcdf = np.cumsum(rc) / ref.size
    return np.interp(sc, rcdf, r)[bi].reshape(ch.shape)
for f in sorted(glob.glob(os.path.join(FL, "*.png"))):
    n = os.path.basename(f)
    if "-flux-raw" in n: continue
    name = n[:-4]; src = cv2.imread(os.path.join(FREE, "pisga-" + name + ".jpg")); fz = cv2.imread(f)
    fz = cv2.resize(fz, (src.shape[1], src.shape[0]), interpolation=cv2.INTER_LANCZOS4) if fz.shape != src.shape else fz
    ls = cv2.cvtColor(src, cv2.COLOR_BGR2LAB); lf = cv2.cvtColor(fz, cv2.COLOR_BGR2LAB)
    lf[..., 0] = np.clip(match(lf[..., 0].astype(np.float32), ls[..., 0].astype(np.float32)), 0, 255).astype(np.uint8)   # tone: the source's contrast
    out = cv2.cvtColor(lf, cv2.COLOR_LAB2BGR)
    cv2.imwrite(os.path.join(OUT, name + ".jpg"), out, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(name, "L std src %.1f fused %.1f out %.1f" % (ls[..., 0].std(), cv2.cvtColor(fz, cv2.COLOR_BGR2LAB)[..., 0].std(), cv2.cvtColor(out, cv2.COLOR_BGR2LAB)[..., 0].std()))
