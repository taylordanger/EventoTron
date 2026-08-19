import { withRole } from "../../../_lib/auth";
import { microsoftAuthorizeUrl } from "../../../_lib/microsoft-oauth";
import { generatePkcePair, signState } from "../../../_lib/oauth-state";

export const GET = withRole("admin", async (request: Request, identity) => {
  const { env } = await import("cloudflare:workers");
  if (!env.OAUTH_STATE_SECRET) {
    return Response.json({ error: "OAuth is not configured on this deployment." }, { status: 500 });
  }

  const redirectUri = new URL("/api/calendar-oauth/microsoft/callback", request.url).toString();
  const { verifier, challenge } = await generatePkcePair();
  const state = crypto.randomUUID();

  let authorizeUrl: string;
  try {
    authorizeUrl = microsoftAuthorizeUrl(env, redirectUri, state, challenge);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Microsoft Calendar is not configured." },
      { status: 500 },
    );
  }

  const cookieToken = await signState(
    { state, verifier, adminEmail: identity.email, createdAt: Date.now(), provider: "microsoft" },
    env.OAUTH_STATE_SECRET,
  );
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl,
      "Set-Cookie": `eventotron_oauth_state=${cookieToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
    },
  });
});
