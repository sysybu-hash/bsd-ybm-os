"use server";

import { sendProvisionCredentialsEmail as sendProvisionCredentialsEmailImpl } from "@/lib/mail";

export async function sendProvisionCredentialsEmail(
  to: string,
  displayName: string | null,
  plainPassword: string,
  orgName: string,
) {
  return sendProvisionCredentialsEmailImpl(to, displayName, plainPassword, orgName);
}
