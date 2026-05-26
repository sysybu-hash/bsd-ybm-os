import { google } from "googleapis";
import { getGoogleOAuth2ClientForUser } from "@/lib/google-oauth-client";
import { accountHasContactsScope } from "@/lib/google-contacts-oauth";
import { prisma } from "@/lib/prisma";

export type GoogleContactImportRow = {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
};

export async function fetchGoogleContactsForUser(userId: string): Promise<GoogleContactImportRow[]> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { scope: true },
  });
  if (!accountHasContactsScope(account?.scope)) {
    throw new Error("GOOGLE_CONTACTS_NOT_CONNECTED");
  }

  const auth = await getGoogleOAuth2ClientForUser(userId);
  const people = google.people({ version: "v1", auth });

  const rows: GoogleContactImportRow[] = [];
  let pageToken: string | undefined;

  do {
    const res = await people.people.connections.list({
      resourceName: "people/me",
      pageSize: 200,
      personFields: "names,emailAddresses,phoneNumbers,organizations,biographies",
      pageToken,
    });

    const connections = res.data.connections ?? [];
    for (const person of connections) {
      const name =
        person.names?.[0]?.displayName?.trim() ||
        [person.names?.[0]?.givenName, person.names?.[0]?.familyName].filter(Boolean).join(" ").trim();
      if (!name) continue;

      const email = person.emailAddresses?.[0]?.value?.trim();
      const phone = person.phoneNumbers?.[0]?.value?.trim();
      const company = person.organizations?.[0]?.name?.trim();
      const notes = person.biographies?.[0]?.value?.trim();

      rows.push({
        name,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(company ? { company } : {}),
        ...(notes ? { notes } : {}),
      });
    }

    pageToken = res.data.nextPageToken ?? undefined;
    if (rows.length >= 2000) break;
  } while (pageToken);

  return rows;
}
