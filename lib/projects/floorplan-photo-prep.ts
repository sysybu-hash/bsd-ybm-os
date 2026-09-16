/**
 * Preparing a floor-plan source for the model.
 *
 * Split by stage: what the bytes are, where the paper and the ink sit, what is
 * sheet chrome rather than apartment, the pair of rasters a booklet compares,
 * the upload itself, and the hint images the model is handed. This file is the
 * door every caller already imports through.
 */
export * from "@/lib/projects/photo-prep/mime";
export * from "@/lib/projects/photo-prep/paper-box";
export * from "@/lib/projects/photo-prep/ink-box";
export * from "@/lib/projects/photo-prep/title-block";
export * from "@/lib/projects/photo-prep/edge-frame";
export * from "@/lib/projects/photo-prep/sheet-crop";
export * from "@/lib/projects/photo-prep/raster-pair";
export * from "@/lib/projects/photo-prep/source";
export * from "@/lib/projects/photo-prep/hints";
