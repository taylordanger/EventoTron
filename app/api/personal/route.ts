import { getSuiteD1 } from "@/db";
import { withRole } from "../_lib/auth";
import { supportBody } from "../_lib/support-body";
import { createPersonal, deletePersonal, exportPersonal, listPersonal, readPersonal, updatePersonal } from "../_lib/personal-store";
import { personalOwner, validPersonalId, validatePersonalDraft } from "../../personal-data";

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie, Cf-Access-Jwt-Assertion" };
const invalid = () => Response.json({ error: "Check the title, date, times and field lengths before saving." }, { status: 400, headers });

export const GET = withRole("staff", async (request, identity) => {
  const db = await getSuiteD1(); const owner = personalOwner(identity);
  const params = new URL(request.url).searchParams;
  if (params.has("id")) {
    const id = params.get("id");
    if (!validPersonalId(id)) return invalid();
    const item = await readPersonal(db, owner, id);
    return item ? Response.json({ item }, { headers }) : Response.json({ error: "Item not found." }, { status: 404, headers });
  }
  if (params.get("export") === "1") return Response.json({ format: "eventotron-personal", version: 1, exportedAt: new Date().toISOString(), items: await exportPersonal(db, owner) }, { headers });
  return Response.json({ items: await listPersonal(db, owner), source: identity.source, account: identity.source === "local" ? "Local operator" : identity.email }, { headers });
});

export const POST = withRole("staff", async (request, identity) => {
  const body = await supportBody(request, 60000).catch(() => null);
  const draft = validatePersonalDraft(body);
  if (!draft) return invalid();
  const result = await createPersonal(await getSuiteD1(), personalOwner(identity), draft);
  return Response.json(result, { status: result.status, headers });
});

export const PATCH = withRole("staff", async (request, identity) => {
  const body = await supportBody(request, 60000).catch(() => null) as { item?: unknown; expectedUpdatedAt?: unknown } | null;
  const draft = validatePersonalDraft(body?.item);
  if (!draft || typeof body?.expectedUpdatedAt !== "string" || !body.expectedUpdatedAt || body.expectedUpdatedAt.length > 100) return invalid();
  const result = await updatePersonal(await getSuiteD1(), personalOwner(identity), draft, body.expectedUpdatedAt);
  return Response.json(result, { status: result.status, headers });
});

export const DELETE = withRole("staff", async (request, identity) => {
  const body = await supportBody(request, 2000).catch(() => null) as { id?: unknown; expectedUpdatedAt?: unknown } | null;
  if (!validPersonalId(body?.id) || typeof body?.expectedUpdatedAt !== "string" || !body.expectedUpdatedAt || body.expectedUpdatedAt.length > 100) return invalid();
  const result = await deletePersonal(await getSuiteD1(), personalOwner(identity), body.id, body.expectedUpdatedAt);
  return result.status === 204 ? new Response(null, { status: 204, headers }) : Response.json(result, { status: result.status, headers });
});
