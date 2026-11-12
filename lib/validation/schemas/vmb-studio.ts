import { z } from "zod";

const v3 = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });

/** A camera the client placed in the studio (scene metres); rendered as one more picture on the next run. */
export const vmbStudioCameraSchema = z.object({
  id: z.string().regex(/^c[a-z0-9]{1,15}$/),
  title: z.string().trim().min(1).max(60),
  position: v3,
  target: v3,
  fovDeg: z.number().min(20).max(100),
});
export type VmbStudioCamera = z.infer<typeof vmbStudioCameraSchema>;

export const vmbStudioCamerasBodySchema = z.object({ cameras: z.array(vmbStudioCameraSchema).max(8) });
