import type { ParsedCalendarEvent } from "../calendar-sources/route";
import type { OAuthTokenResult } from "./google-oauth";

export type MicrosoftEnv = {
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  MICROSOFT_TENANT?: string;
};

const SCOPE = "offline_access Calendars.Read User.Read openid email";
const SYNC_PAST_DAYS = 30;
const SYNC_FUTURE_DAYS = 730;
const MAX_EVENTS = 5000;

function tenant(env: MicrosoftEnv) {
  return env.MICROSOFT_TENANT?.trim() || "common";
}

function authorizeEndpoint(env: MicrosoftEnv) {
  return `https://login.microsoftonline.com/${tenant(env)}/oauth2/v2.0/authorize`;
}

function tokenEndpoint(env: MicrosoftEnv) {
  return `https://login.microsoftonline.com/${tenant(env)}/oauth2/v2.0/token`;
}

export function microsoftAuthorizeUrl(env: MicrosoftEnv, redirectUri: string, state: string, codeChallenge: string): string {
  if (!env.MICROSOFT_CLIENT_ID) throw new Error("Microsoft Calendar is not configured on this deployment.");
  const url = new URL(authorizeEndpoint(env));
  url.searchParams.set("client_id", env.MICROSOFT_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function requestMicrosoftToken(env: MicrosoftEnv, body: Record<string, string>): Promise<OAuthTokenResult> {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new Error("Microsoft Calendar is not configured on this deployment.");
  }
  const response = await fetch(tokenEndpoint(env), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      scope: SCOPE,
      ...body,
    }),
  });
  if (!response.ok) throw new Error(`Microsoft token request failed (${response.status})`);
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

export function exchangeMicrosoftCode(env: MicrosoftEnv, code: string, redirectUri: string, codeVerifier: string) {
  return requestMicrosoftToken(env, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
}

export function refreshMicrosoftToken(env: MicrosoftEnv, refreshToken: string) {
  return requestMicrosoftToken(env, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

export async function fetchMicrosoftProfileEmail(accessToken: string): Promise<string> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Microsoft profile request failed (${response.status})`);
  const data = await response.json() as { mail?: string; userPrincipalName?: string };
  return (data.mail || data.userPrincipalName || "").trim().toLowerCase();
}

function parseGraphEventDate(value: { dateTime?: string } | undefined, isAllDay: boolean) {
  if (!value?.dateTime) return { date: "", eventTime: "" };
  const parsed = new Date(`${value.dateTime}Z`);
  if (Number.isNaN(parsed.getTime())) return { date: "", eventTime: "" };
  const date = `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
  if (isAllDay) return { date, eventTime: "All day" };
  return { date, eventTime: parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }) };
}

/** Syncs the primary calendar via calendarview; a calendar picker for secondary calendars is a follow-up. */
export async function fetchMicrosoftCalendarEvents(accessToken: string): Promise<ParsedCalendarEvent[]> {
  const startDateTime = new Date(Date.now() - SYNC_PAST_DAYS * 86_400_000).toISOString();
  const endDateTime = new Date(Date.now() + SYNC_FUTURE_DAYS * 86_400_000).toISOString();
  const firstUrl = new URL("https://graph.microsoft.com/v1.0/me/calendarview");
  firstUrl.searchParams.set("startDateTime", startDateTime);
  firstUrl.searchParams.set("endDateTime", endDateTime);
  firstUrl.searchParams.set("$top", "250");
  firstUrl.searchParams.set("$orderby", "start/dateTime");

  const events: ParsedCalendarEvent[] = [];
  let url: string | null = firstUrl.toString();
  while (url && events.length < MAX_EVENTS) {
    const response: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
    });
    if (!response.ok) throw new Error(`Microsoft Calendar events request failed (${response.status})`);
    const data = await response.json() as {
      value?: Array<{
        id: string;
        subject?: string;
        bodyPreview?: string;
        location?: { displayName?: string };
        start?: { dateTime?: string };
        isAllDay?: boolean;
      }>;
      "@odata.nextLink"?: string;
    };
    for (const item of data.value ?? []) {
      const { date, eventTime } = parseGraphEventDate(item.start, Boolean(item.isAllDay));
      if (!date) continue;
      events.push({
        externalId: item.id,
        title: item.subject || "Untitled",
        date,
        eventTime,
        description: item.bodyPreview ?? "",
        location: item.location?.displayName ?? "",
      });
    }
    url = data["@odata.nextLink"] ?? null;
  }
  return events;
}
