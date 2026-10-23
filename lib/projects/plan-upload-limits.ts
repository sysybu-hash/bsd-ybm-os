/**
 * One piece of a plan upload.
 *
 * The platform refuses a request body past about 4.5MB. Upstash refuses a
 * single command past about 1MB, and the part is stored as base64, so the raw
 * piece stays well under both.
 */
export const PLAN_UPLOAD_PART_BYTES = 480_000;
