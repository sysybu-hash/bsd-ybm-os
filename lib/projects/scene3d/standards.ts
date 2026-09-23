import { FURNITURE_HEIGHTS_M } from "@/lib/projects/floorplan-furniture-heights";

/**
 * Every number in the 3D engine that the drawing does not state.
 *
 * The engine draws a flat from measurements. Height is the one dimension a
 * floor plan never gives, and a handful of other facts — how tall a door is,
 * where a window sill sits, how high a railing stands — are building standards
 * rather than anything about this apartment. They live here, named, so that
 * "what did we invent" has a single, short, reviewable answer.
 *
 * The rule the rest of the directory follows: if a dimension is not measured
 * and not exported from this file, it does not exist. A test enforces it.
 */

/** Ceiling height. The viewer has drawn 2.70 since it was written. */
export const WALL_HEIGHT_M = 2.7;

/**
 * Door and cased-opening head height.
 *
 * The viewer used a 0.35 m lintel, which under a 2.70 m ceiling leaves a
 * 0.25 m strip of daylight above every interior door — a lintel is what is
 * left above the opening, not a fixed band. 2.10 is the Israeli standard door
 * height, so the band above it is 0.60.
 */
export const DOOR_HEAD_M = 2.1;

/** A window's head sits on the same line as the doors, as it is built. */
export const WINDOW_HEAD_M = 2.1;

/** Sill height in a room people live in. */
export const WINDOW_SILL_M = 0.9;

/** Sill height where privacy asks for it: bathroom, utility. */
export const WINDOW_SILL_WET_M = 1.4;

/**
 * Clear width at which an exterior opening onto a measured terrace is a
 * slider rather than a window — and therefore reaches the floor.
 */
export const SLIDER_MIN_CLEAR_M = 1.2;

/** Balustrade height on a terrace. */
export const RAILING_H_M = 1.05;

/** Thickness of a glass balustrade panel and of window glazing. */
export const GLASS_T_M = 0.012;

/** The metal capping on top of a glass balustrade. */
export const RAIL_CAP_M = 0.05;

/** Skirting: how tall, and how far it stands proud of the wall face. */
export const SKIRTING_H_M = 0.08;
export const SKIRTING_PROUD_M = 0.015;

/** A floor slab's own thickness, and how far a terrace sits below it. */
export const FLOOR_T_M = 0.04;
export const TERRACE_DROP_M = 0.02;

/** The frame around a door or window opening, and how far it is set in. */
export const FRAME_T_M = 0.05;
export const FRAME_INSET_M = 0.02;

/**
 * Where the walls are cut for a bird's-eye still.
 *
 * Full-height walls hide the near third of the flat at any camera angle that
 * still reads as three-dimensional. Cut too low and a window loses its head
 * and stops reading as a window. At 1.35 m a partition is still a wall, every
 * room is open to the camera, and a window is legible because its sill band
 * stops at 0.90 and the glazing above it is what the cut passes through.
 */
export const CUTAWAY_OVERVIEW_M = 1.35;

/** How far a wall body may be from the footprint edge and still be envelope. */
export const ENVELOPE_TOLERANCE_M = 0.5;

/** How close a neighbour must be to decide which way a piece of furniture faces. */
export const FACING_REACH_M = 0.15;

/** A bed wider than this is a double; narrower, a single. */
export const DOUBLE_BED_MIN_M = 1.4;

/** A modest single mattress: what a haredi still renders, whatever was drawn. */
export const TWIN_MATTRESS_W_M = 0.9;
export const TWIN_MATTRESS_L_M = 2.0;

/** One wardrobe door per this much width. */
export const WARDROBE_DOOR_W_M = 0.6;

/** How tall each kind of piece stands. Shared with the oblique SVG plate. */
export const FURNITURE_HEIGHT_M = FURNITURE_HEIGHTS_M;

/** The height used for a piece whose kind is not in the table. */
export const DEFAULT_FURNITURE_HEIGHT_M = 0.5;
