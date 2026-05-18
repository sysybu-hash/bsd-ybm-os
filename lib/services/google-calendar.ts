import { google } from "googleapis";
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
};

export type CalendarEventView = {
  id: string;
  summary: string;
  start: string;
  end: string;
  htmlLink?: string | null;
};

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

  async listEvents(calendarId = "primary", maxResults = 20): Promise<CalendarEventView[]> {
    const res = await this.calendar().events.list({
      calendarId,
      timeMin: new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });

    return (res.data.items ?? []).map((ev) => ({
      id: ev.id ?? "",
      summary: ev.summary ?? "(ללא כותרת)",
      start: ev.start?.dateTime ?? ev.start?.date ?? "",
      end: ev.end?.dateTime ?? ev.end?.date ?? "",
      htmlLink: ev.htmlLink,
    }));
  }

  async createEvent(input: CalendarEventInput, calendarId = "primary") {
    const res = await this.calendar().events.insert({
      calendarId,
      requestBody: {
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.start },
        end: { dateTime: input.end },
      },
    });
    return res.data;
  }
}
