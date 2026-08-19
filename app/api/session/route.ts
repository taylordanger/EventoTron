import { AuthError, resolveIdentity } from "../_lib/auth";

export async function GET(request: Request) {
  try {
    const identity = await resolveIdentity(request);
    return Response.json(identity, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    throw error;
  }
}
