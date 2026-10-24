/**
 * One piece of a plan upload.
 *
 * The platform refuses a request body past about 4.5MB. A part is stored as
 * base64, and one Redis command stays under the 10MB request cap.
 */
export const PLAN_UPLOAD_PART_BYTES = 480_000;

/** Largest drawing the part store will hold. A single request cannot. */
export const PLAN_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
