import { google, calendar_v3 } from "googleapis";
import {
  getGoogleOAuth2ClientForUser,
  GoogleOAuthNotLinkedError,
  GoogleOAuthRefreshError,
} from "@/lib/google-oauth-client";

export { GoogleOAuthNotLinkedError, GoogleOAuthRefreshError };

export type CalendarEventInput = {
  summary: string;
  description?: string;
  start: string;
  end: string;
  allDay?: boolean;
};

export type CalendarEventView = {
  id: string;
  summary: string;
  start: string;
  end: string;
  htmlLink?: string | null;
  etag?: string | null;
  status?: string | null;
};

export type CalendarListItem = {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string | null;
  foregroundColor?: string | null;
};

export type CalendarSyncResult = {
  events: CalendarEventView[];
  nextSyncToken?: string | null;
};

const BSD_PRIVATE_KEYS = {
  orgId: "bsdYbmOrgId",
  taskId: "bsdYbmTaskId",
  linkId: "bsdYbmLinkId",
} as const;

export class GoogleCalendarService {
  private auth;

  constructor(auth: InstanceType<typeof google.auth.OAuth2>) {
    this.auth = auth;
  }

  static async forUser(userId: string) {
    const auth = await getGoogleOAuth2ClientForUser(userId);
    return new GoogleCalendarService(auth);
  }

  private calendar() {
    return google.calendar({ version: "v3", auth: this.auth });
  }

  async listCalendars(): Promise<CalendarListItem[]> {
    const res = await this.calendar().calendarList.list({ maxResults: 100 });
    return (res.data.items ?? [])
      .filter((c): c is calendar_v3.Schema$CalendarListEntry & { id: string } => Boolean(c.id))
      .map((c) => ({
        id: c.id!,
        summary: c.summary ?? c.id!,
        primary: c.primary ?? false,
        backgroundColor: c.backgroundColor ?? null,
        foregroundColor: c.foregroundColor ?? null,
      }));
  }

  async listEvents(calendarId = "primary", maxResults = 20): Promise<CalendarEventView[]> {
    const res = await this.calendar().events.list({
      calendarId,
      timeMin: new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });
    return (res.data.items ?? []).map((ev) => this.mapEvent(ev));
  }

  async listEventsIncremental(
    calendarId: string,
    syncToken?: string | null,
  ): Promise<CalendarSyncResult> {
    try {
      const res = await this.calendar().events.list({
        calendarId,
        syncToken: syncToken ?? undefined,
        showDeleted: true,
        singleEvents: true,
        maxResults: 250,
      });
      return {
        events: (res.data.items ?? []).map((ev) => this.mapEvent(ev)),
        nextSyncToken: res.data.nextSyncToken ?? syncToken ?? null,
      };
    } catch (err: unknown) {
      const status = (err as { code?: number })?.code;
      if (status === 410 && syncToken) {
        const res = await this.calendar().events.list({
          calendarId,
          timeMin: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
          showDeleted: true,
          singleEvents: true,
          maxResults: 250,
        });
        return {
          events: (res.data.items ?? []).map((ev) => this.mapEvent(ev)),
          nextSyncToken: res.data.nextSyncToken ?? null,
        };
      }
      throw err;
    }
  }

  async createEvent(
    input: CalendarEventInput,
    calendarId: string,
    privateProps?: { orgId: string; taskId?: string; linkId?: string },
  ) {
    const res = await this.calendar().events.insert({
      calendarId,
      requestBody: this.buildEventBody(input, privateProps),
    });
    return res.data;
  }

  async patchEvent(
    calendarId: string,
    eventId: string,
    input: CalendarEventInput,
    privateProps?: { orgId: string; taskId?: string; linkId?: string },
  ) {
    const res = await this.calendar().events.patch({
      calendarId,
      eventId,
      requestBody: this.buildEventBody(input, privateProps),
    });
    return res.data;
  }

  async deleteEvent(calendarId: string, eventId: string) {
    await this.calendar().events.delete({ calendarId, eventId });
  }

  private mapEvent(ev: calendar_v3.Schema$Event): CalendarEventView {
    return {
      id: ev.id ?? "",
      summary: ev.summary ?? "(ללא כותרת)",
      start: ev.start?.dateTime ?? ev.start?.date ?? "",
      end: ev.end?.dateTime ?? ev.end?.date ?? "",
      htmlLink: ev.htmlLink,
      etag: ev.etag,
      status: ev.status,
    };
  }

  private buildEventBody(
    input: CalendarEventInput,
    privateProps?: { orgId: string; taskId?: string; linkId?: string },
  ): calendar_v3.Schema$Event {
    const start = input.allDay
      ? { date: input.start.slice(0, 10) }
      : { dateTime: input.start };
    const end = input.allDay ? { date: input.end.slice(0, 10) } : { dateTime: input.end };

    const body: calendar_v3.Schema$Event = {
      summary: input.summary,
      description: input.description,
      start,
      end,
    };

    if (privateProps) {
      body.extendedProperties = {
        private: {
          [BSD_PRIVATE_KEYS.orgId]: privateProps.orgId,
          ...(privateProps.taskId ? { [BSD_PRIVATE_KEYS.taskId]: privateProps.taskId } : {}),
          ...(privateProps.linkId ? { [BSD_PRIVATE_KEYS.linkId]: privateProps.linkId } : {}),
        },
      };
    }

    return body;
  }
}

export function parseBsdPrivateProps(
  ev: calendar_v3.Schema$Event | CalendarEventView,
): { orgId?: string; taskId?: string; linkId?: string } {
  const priv =
    "extendedProperties" in ev && ev.extendedProperties?.private
      ? ev.extendedProperties.private
      : undefined;
  if (!priv) return {};
  return {
    orgId: priv[BSD_PRIVATE_KEYS.orgId],
    taskId: priv[BSD_PRIVATE_KEYS.taskId],
    linkId: priv[BSD_PRIVATE_KEYS.linkId],
  };
}
