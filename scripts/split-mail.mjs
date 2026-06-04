import fs from "node:fs";

const lines = fs.readFileSync("lib/mail.ts", "utf8").split(/\r?\n/);
const core = lines.slice(0, 218).join("\n");
const campaigns = lines.slice(218).join("\n");

const coreFile = `${core}

export { isMailTransportConfigured, getMailFrom, getMailReplyTo } from "@/lib/mail-config";
`;

const campaignsFile = `import { Resend } from "resend";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { env } from "@/lib/env";
import { osAdminEmails } from "@/lib/is-admin";
import { createLogger } from "@/lib/logger";
import { getCanonicalSiteUrl } from "@/lib/site-metadata";
import {
  EMAIL_DIGEST_CATEGORY,
  type DigestLineItem,
} from "@/lib/email-digest-types";
import type { SiteFeedbackInput } from "@/lib/validation/schemas/site-feedback";
import {
  getMailFrom,
  getMailReplyTo,
  isMailTransportConfigured,
  isResendConfigured,
  isSmtpConfigured,
} from "@/lib/mail-config";
import {
  sendTransactionalEmail,
  sendTransactionalEmailWithAttachments,
  wrapBrandedHtml,
  escapeHtml,
  mailSiteUrl,
} from "@/lib/mail-core";

const log = createLogger("mail-campaigns");

${campaigns.replace(/^const log = createLogger\("mail"\);/m, "")}
`;

// Rewrite lib/mail-core.ts from core with exports
const coreExports = core
  .replace('const log = createLogger("mail");', 'const log = createLogger("mail-core");')
  .replace(
    'export { isMailTransportConfigured, getMailFrom, getMailReplyTo } from "@/lib/mail-config";',
    "",
  );

fs.writeFileSync(
  "lib/mail-core.ts",
  `${coreExports}
export function mailSiteUrl(): string {
  return getCanonicalSiteUrl().replace(/\\/$/, "");
}
export { escapeHtml, wrapBrandedHtml };
`,
);

fs.writeFileSync("lib/mail-campaigns.ts", campaignsFile);

fs.writeFileSync(
  "lib/mail.ts",
  `/** @deprecated Import from @/lib/mail-core or @/lib/mail-campaigns — barrel kept for compatibility */
export * from "@/lib/mail-core";
export * from "@/lib/mail-campaigns";
`,
);

console.log("mail split ok");
