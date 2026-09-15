/**
 * Preparing a floor-plan source for the model.
 *
 * Split by stage: what the bytes are, where the drawing sits on the paper,
 * what is sheet chrome rather than apartment, the pair of rasters a booklet
 * compares, the upload itself, and the hint images the model is handed.
 * This file is the door every caller already imports through.
 */
export * from "@/lib/projects/photo-prep/mime";
export * from "@/lib/projects/photo-prep/ink-crop";
export * from "@/lib/projects/photo-prep/sheet-frame";
export * from "@/lib/projects/photo-prep/compare";
export * from "@/lib/projects/photo-prep/source";
export * from "@/lib/projects/photo-prep/hints";
