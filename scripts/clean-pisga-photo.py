"""The plot's aerial photograph without the architect's red circle and red frame: python scripts/clean-pisga-photo.py <in.png> <out.jpg>"""
import cv2, numpy as np, sys
img = cv2.imread(sys.argv[1])
r, g, b = (img[..., 2].astype(int), img[..., 1].astype(int), img[..., 0].astype(int))
red = (((r - g) > 70) & ((r - b) > 70)).astype(np.uint8)
red[:8, :] = 1; red[-8:, :] = 1; red[:, :8] = 1; red[:, -8:] = 1
red = cv2.dilate(red, np.ones((5, 5), np.uint8))
# The ring is a ~14 px stroke: inpaint in two passes at a small radius, then match the film grain with a light blur only on the filled pixels.
filled = cv2.inpaint(cv2.inpaint(img, red, 3, cv2.INPAINT_NS), red, 3, cv2.INPAINT_TELEA)
blur = cv2.GaussianBlur(filled, (0, 0), 1.2)
filled = np.where(red[..., None] > 0, blur, filled)
cv2.imwrite(sys.argv[2], filled, [cv2.IMWRITE_JPEG_QUALITY, 92])
