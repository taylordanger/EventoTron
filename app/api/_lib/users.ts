import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suiteUsers } from "@/db/schema";
import { AuthError } from "./errors.ts";
import type { SuiteRole } from "./role.ts";

export type { SuiteRole } from "./role.ts";
export type SuiteUserStatus = "active" | "revoked";

export type SuiteUser = {
  id: string;
  email: string;
  role: SuiteRole;
  status: SuiteUserStatus;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProvisionEnv = { INITIAL_ADMIN_EMAIL?: string };

function toSuiteUser(row: typeof suiteUsers.$inferSelect): SuiteUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role === "admin" ? "admin" : "staff",
    status: row.status === "revoked" ? "revoked" : "active",
    lastSeenAt: row.lastSeenAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Looks up the `suite_users` row for an Access-verified email, creating one on
 * first sight. Any brand-new email is provisioned as `staff`, except a match
 * against `INITIAL_ADMIN_EMAIL`, which becomes the first `admin`. This relies
 * on Cloudflare Access already restricting who can reach the app at all.
 */
export async function loadOrProvisionUser(email: string, env: ProvisionEnv): Promise<SuiteUser> {
  const db = await getDb();
  const now = new Date().toISOString();
  const existing = await db.select().from(suiteUsers).where(eq(suiteUsers.email, email)).get();
  if (existing) {
    await db.update(suiteUsers).set({ lastSeenAt: now }).where(eq(suiteUsers.id, existing.id));
    return toSuiteUser({ ...existing, lastSeenAt: now });
  }

  const initialAdmin = env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const role: SuiteRole = initialAdmin && initialAdmin === email ? "admin" : "staff";
  const row = {
    id: `user_${crypto.randomUUID()}`,
    email,
    role,
    status: "active" as const,
    lastSeenAt: now,
    payload: {},
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(suiteUsers).values(row).onConflictDoNothing();
  const persisted = await db.select().from(suiteUsers).where(eq(suiteUsers.email, email)).get();
  return toSuiteUser(persisted ?? row);
}

export async function listUsers(): Promise<SuiteUser[]> {
  const db = await getDb();
  const rows = await db.select().from(suiteUsers);
  return rows.map(toSuiteUser).sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Updates a user's role/status. Refuses to leave the workspace with zero
 * active admins, so an admin can never accidentally lock everyone out.
 */
export async function updateUser(
  id: string,
  changes: { role?: SuiteRole; status?: SuiteUserStatus },
): Promise<SuiteUser> {
  const db = await getDb();
  const target = await db.select().from(suiteUsers).where(eq(suiteUsers.id, id)).get();
  if (!target) throw new AuthError(404, "That person is no longer in EventoTron. Refresh the page to see the current list.");

  const nextRole = changes.role ?? (target.role === "admin" ? "admin" : "staff");
  const nextStatus = changes.status ?? (target.status === "revoked" ? "revoked" : "active");
  const losingAdmin = target.role === "admin" && target.status === "active"
    && (nextRole !== "admin" || nextStatus !== "active");
  if (losingAdmin) {
    const rows = await db.select().from(suiteUsers);
    const remainingAdmins = rows.filter((row) =>
      row.id !== id && row.role === "admin" && row.status === "active"
    ).length;
    if (remainingAdmins === 0) {
      throw new AuthError(400, "EventoTron needs at least one admin. Make someone else an admin first, then change this one.");
    }
  }

  const now = new Date().toISOString();
  await db.update(suiteUsers)
    .set({ role: nextRole, status: nextStatus, updatedAt: now })
    .where(eq(suiteUsers.id, id));
  return toSuiteUser({ ...target, role: nextRole, status: nextStatus, updatedAt: now });
}
