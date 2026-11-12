import { z } from "zod";

/** Google's token endpoint response (authorization-code flow). */
export const googleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  id_token: z.string().min(1),
  expires_in: z.number().optional(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});
export type GoogleTokenResponse = z.infer<typeof googleTokenResponseSchema>;

/** Claims we rely on in Google's ID token. */
export const googleIdClaimsSchema = z.object({
  iss: z.enum(["https://accounts.google.com", "accounts.google.com"]),
  aud: z.string().min(1),
  sub: z.string().min(1),
  exp: z.number(),
  email: z.string().email(),
  email_verified: z.boolean(),
  nonce: z.string().optional(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
});
export type GoogleIdClaims = z.infer<typeof googleIdClaimsSchema>;

export const vmbEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

export const vmbLoginBodySchema = z.object({
  email: vmbEmail,
  password: z.string().min(1).max(200),
});

export const vmbRegisterBodySchema = z.object({
  email: vmbEmail,
  password: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(120).optional(),
});
