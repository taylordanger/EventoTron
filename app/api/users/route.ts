import { AuthError, withRole } from "../_lib/auth";
import { listUsers, updateUser, type SuiteRole, type SuiteUserStatus } from "../_lib/users";

export const GET = withRole("admin", async () => {
  const users = await listUsers();
  return Response.json({ users }, { headers: { "Cache-Control": "no-store" } });
});

export const PATCH = withRole("admin", async (request: Request) => {
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    role?: SuiteRole;
    status?: SuiteUserStatus;
  };
  if (!body.id) {
    return Response.json({ error: "Updating a user requires an ID." }, { status: 400 });
  }
  if (body.role && body.role !== "admin" && body.role !== "staff") {
    return Response.json({ error: "Role must be `admin` or `staff`." }, { status: 400 });
  }
  if (body.status && body.status !== "active" && body.status !== "revoked") {
    return Response.json({ error: "Status must be `active` or `revoked`." }, { status: 400 });
  }

  try {
    const user = await updateUser(body.id, { role: body.role, status: body.status });
    return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "EventoTron could not update that user.", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
