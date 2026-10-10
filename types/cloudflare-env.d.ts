declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    OAUTH_STATE_SECRET?: string;
    TOKEN_ENCRYPTION_KEY?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    MICROSOFT_CLIENT_ID?: string;
    MICROSOFT_CLIENT_SECRET?: string;
    MICROSOFT_TENANT?: string;
    CF_ACCESS_TEAM_DOMAIN?: string;
    CF_ACCESS_AUD?: string;
    INITIAL_ADMIN_EMAIL?: string;
    EVENTOTRON_LOCAL_MODE?: string;
  }
}
