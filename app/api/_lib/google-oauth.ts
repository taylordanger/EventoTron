import type { ParsedCalendarEvent } from "../calendar-sources/route";

export type OAuthTokenResult = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scope: string;
};

export type GoogleEnv = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const CALENDAR_EVENTS_BASE = "https://www.googleapis.com/calendar/v3/calendars";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly openid email";
const SYNC_PAST_DAYS = 30;
const SYNC_FUTURE_DAYS = 730;
const MAX_EVENTS = 5000;

export function googleAuthorizeUrl(env: GoogleEnv, redirectUri: string, state: string, codeChallenge: string): string {
  if (!env.GOOGLE_CLIENT_ID) throw new Error("Google Calendar is not configured on this deployment.");
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function requestGoogleToken(env: GoogleEnv, body: Record<string, string>): Promise<OAuthTokenResult> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google Calendar is not configured on this deployment.");
  }
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      ...body,
    }),
  });
  if (!response.ok) throw new Error(`Google token request failed (${response.status})`);
  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    scope: data.scope,
  };
}

export function exchangeGoogleCode(env: GoogleEnv, code: string, redirectUri: string, codeVerifier: string) {
  return requestGoogleToken(env, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
}

export function refreshGoogleToken(env: GoogleEnv, refreshToken: string) {
  return requestGoogleToken(env, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

export async function fetchGoogleProfileEmail(accessToken: string): Promise<string> {
  const response = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google profile request failed (${response.status})`);
  const data = await response.json() as { email?: string };
  return (data.email ?? "").trim().toLowerCase();
}

function parseGoogleEventDate(value: { date?: string; dateTime?: string } | undefined) {
  if (!value) return { date: "", eventTime: "" };
  if (value.date) return { date: value.date, eventTime: "All day" };
  if (value.dateTime) {
    const parsed = new Date(value.dateTime);
    if (Number.isNaN(parsed.getTime())) return { date: "", eventTime: "" };
    const date = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
    return { date, eventTime: parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) };
  }
  return { date: "", eventTime: "" };
}

/** Syncs the account's primary calendar only; picking among multiple calendars is a follow-up, not this pass. */
export async function fetchGoogleCalendarEvents(accessToken: string, calendarId: string): Promise<ParsedCalendarEvent[]> {
  const timeMin = new Date(Date.now() - SYNC_PAST_DAYS * 86_400_000).toISOString();
  const timeMax = new Date(Date.now() + SYNC_FUTURE_DAYS * 86_400_000).toISOString();
  const events: ParsedCalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${CALENDAR_EVENTS_BASE}/${encodeURIComponent(calendarId || "primary")}/events`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Google Calendar events request failed (${response.status})`);
    const data = await response.json() as {
      items?: Array<{
        id: string;
        summary?: string;
        description?: string;
        location?: string;
        start?: { date?: string; dateTime?: string };
      }>;
      nextPageToken?: string;
    };
    for (const item of data.items ?? []) {
      const { date, eventTime } = parseGoogleEventDate(item.start);
      if (!date) continue;
      events.push({
        externalId: item.id,
        title: item.summary || "Untitled",
        date,
        eventTime,
        description: item.description ?? "",
        location: item.location ?? "",
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken && events.length < MAX_EVENTS);
  return events;
}
