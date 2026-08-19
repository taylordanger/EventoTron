import { withRole } from "../../_lib/auth";
import { listOAuthAccounts } from "../../_lib/calendar-oauth-accounts";

export const GET = withRole("admin", async () => {
  const accounts = await listOAuthAccounts();
  return Response.json({ accounts }, { headers: { "Cache-Control": "no-store" } });
});
