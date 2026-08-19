import { withRole } from "../../../_lib/auth";
import { deleteOAuthAccount } from "../../../_lib/calendar-oauth-accounts";

export const DELETE = withRole("admin", async (
  request: Request,
  _identity,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  await deleteOAuthAccount(id);
  return Response.json({ deleted: true, id }, { headers: { "Cache-Control": "no-store" } });
});
