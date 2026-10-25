import cv2, numpy as np, sys, itertools
P = sys.argv[1]
img = cv2.imread(P); H, W = img.shape[:2]
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
s, v = hsv[..., 1], hsv[..., 2]
# asphalt: grey (low saturation), mid-dark
asph = ((s < 55) & (v > 55) & (v < 150)).astype(np.float32)
roof = (((img[..., 2].astype(np.float32) - img[..., 0]) > 30) & (s > 70) & (v > 90)).astype(np.float32)
roof = cv2.GaussianBlur(roof, (0, 0), 3.0)
asph = cv2.GaussianBlur(asph, (0, 0), 2.0)
red = ((img[..., 2] > 190) & (img[..., 1] < 70) & (img[..., 0] < 70))
asph[cv2.dilate(red.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0] = 0.5
PLOT = np.array([[-16, 21.4], [-10.99, 21.27], [4.44, 20.92], [20.78, 21.77], [38.18, 24.0], [61.32, 29.41], [75, 32.6]])
def plot_z(x): return np.interp(x, PLOT[:, 0], PLOT[:, 1])
xs = np.arange(-8, 70, 1.0)
def band(o0, o1, n=5):
    pts = []
    for x in xs:
        # normal offset south
        z = plot_z(x); dz = (plot_z(x + 0.5) - plot_z(x - 0.5)) / 1.0
        L = np.hypot(1, dz); nx, nz = -dz / L, 1 / L
        for o in np.linspace(o0, o1, n): pts.append((x + nx * o, z + nz * o))
    return np.array(pts)
B_ROAD, B_N, B_S = band(2.5, 10.5), band(-10, -0.5), band(12, 19)
def sample(m, pts, S, CU, CV, th, CXM=27, CZM=29.4):
    c, sn = np.cos(th), np.sin(th)
    dx, dz = pts[:, 0] - CXM, pts[:, 1] - CZM
    u = (dx * c + dz * sn) / S + CU; vv = (-dx * sn + dz * c) / S + CV
    ok = (u >= 0) & (u < W - 1) & (vv >= 0) & (vv < H - 1)
    out = np.zeros(len(pts), np.float32)
    out[ok] = cv2.remap(m, u[ok].reshape(1, -1).astype(np.float32), vv[ok].reshape(1, -1).astype(np.float32), cv2.INTER_LINEAR)[0]
    return out.mean()
FOOT = np.array([[x, z] for x in np.linspace(0.88, 53.92, 30) for z in np.linspace(1.02, 16.58, 8)])
def score(S, CU, CV, th):
    return sample(asph, B_ROAD, S, CU, CV, th) - 0.5 * sample(asph, B_N, S, CU, CV, th) - 0.5 * sample(asph, B_S, S, CU, CV, th) - 1.5 * sample(roof, FOOT, S, CU, CV, th)
best = (-9, None)
for S in np.arange(0.26, 0.345, 0.01):
    for th in np.radians(np.arange(-3, 3.1, 1)):
        for CU in range(780, 1010, 10):
            for CV in range(370, 470, 5):
                sc = score(S, CU, CV, th)
                if sc > best[0]: best = (sc, (S, CU, CV, th))
print("coarse", best[0], best[1][0], best[1][1], best[1][2], np.degrees(best[1][3]))
S0, CU0, CV0, th0 = best[1]
for it in range(3):
    step = [0.01, 6, 3, np.radians(0.8)][:4] if it == 0 else [0.004, 2, 1, np.radians(0.3)]
    for S in np.arange(S0 - 2 * step[0], S0 + 2.01 * step[0], step[0] / 2):
        for th in np.arange(th0 - 2 * step[3], th0 + 2.01 * step[3], step[3]):
            for CU in np.arange(CU0 - 4 * step[1], CU0 + 4.01 * step[1], step[1]):
                for CV in np.arange(CV0 - 4 * step[2], CV0 + 4.01 * step[2], step[2]):
                    sc = score(S, CU, CV, th)
                    if sc > best[0]: best = (sc, (S, CU, CV, th))
    S0, CU0, CV0, th0 = best[1]
print("fine", round(best[0], 3), "S", round(S0, 4), "CU", CU0, "CV", CV0, "rot deg", round(np.degrees(th0), 2))
print("baseline", round(score(0.30, 887, 420, 0.0), 3))

def draw(S, CU, CV, th, name):
    out = img.copy(); c, sn = np.cos(th), np.sin(th)
    def px(x, z):
        dx, dz = x - 27, z - 29.4
        return int((dx * c + dz * sn) / S + CU), int((-dx * sn + dz * c) / S + CV)
    for o, col in ((0, (0, 224, 255)), (2.5, (255, 229, 0)), (10.5, (255, 229, 0))):
        pts = []
        for x in np.arange(-12, 72, 1.0):
            z = plot_z(x); dz = (plot_z(x + .5) - plot_z(x - .5)); L = np.hypot(1, dz)
            pts.append(px(x - dz / L * o, z + 1 / L * o))
        cv2.polylines(out, [np.array(pts)], False, col, 2)
    r = [px(.88, 1.02), px(53.92, 1.02), px(53.92, 16.58), px(.88, 16.58)]
    cv2.polylines(out, [np.array(r)], True, (40, 40, 255), 3)
    cv2.imwrite(name, out[250:620, 560:1250])
draw(0.30, 887, 420, 0.0, sys.argv[2] + "/base.png")
draw(S0, CU0, CV0, th0, sys.argv[2] + "/opt.png")
