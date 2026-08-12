import { google, people_v1 } from "googleapis";
import { getGoogleOAuth2ClientForUser } from "@/lib/google-oauth-client";

export type GoogleContactPreview = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

const PERSON_FIELDS = "names,emailAddresses,phoneNumbers";
const MAX_CONTACTS = 200;

function displayName(person: people_v1.Schema$Person): string {
  const primary = person.names?.find((n) => n.metadata?.primary) ?? person.names?.[0];
  if (primary?.displayName?.trim()) return primary.displayName.trim();
  const given = primary?.givenName?.trim() ?? "";
  const family = primary?.familyName?.trim() ?? "";
  const combined = `${given} ${family}`.trim();
  return combined || "—";
}

function primaryEmail(person: people_v1.Schema$Person): string | null {
  const entry =
    person.emailAddresses?.find((e) => e.metadata?.primary) ?? person.emailAddresses?.[0];
  const value = entry?.value?.trim();
  return value || null;
}

function primaryPhone(person: people_v1.Schema$Person): string | null {
  const entry =
    person.phoneNumbers?.find((p) => p.metadata?.primary) ?? person.phoneNumbers?.[0];
  const value = entry?.value?.trim();
  return value || null;
}

function mapPerson(person: people_v1.Schema$Person): GoogleContactPreview | null {
  const resourceName = person.resourceName?.trim();
  if (!resourceName) return null;
  const name = displayName(person);
  if (!name || name === "—") return null;
  return {
    id: resourceName,
    name,
    email: primaryEmail(person),
    phone: primaryPhone(person),
  };
}

export class GoogleContactsService {
  private auth;

  constructor(auth: InstanceType<typeof google.auth.OAuth2>) {
    this.auth = auth;
  }

  static async forUser(userId: string) {
    const auth = await getGoogleOAuth2ClientForUser(userId);
    return new GoogleContactsService(auth);
  }

  private people() {
    return google.people({ version: "v1", auth: this.auth });
  }

  async listConnections(limit = MAX_CONTACTS): Promise<GoogleContactPreview[]> {
    const pageSize = Math.min(Math.max(1, limit), MAX_CONTACTS);
    const res = await this.people().people.connections.list({
      resourceName: "people/me",
      personFields: PERSON_FIELDS,
      pageSize,
      sortOrder: "LAST_MODIFIED_DESCENDING",
    });

    const items = res.data.connections ?? [];
    const mapped: GoogleContactPreview[] = [];
    for (const person of items) {
      const row = mapPerson(person);
      if (row) mapped.push(row);
      if (mapped.length >= pageSize) break;
    }
    return mapped;
  }
}
