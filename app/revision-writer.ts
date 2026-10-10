export class SharedSaveError extends Error {
  readonly conflict: boolean;
  constructor(message: string, conflict = false) { super(message); this.conflict = conflict; }
}

/** One editor sends snapshots in order; a conflict stops its queue until review. */
export function createRevisionWriter(endpoint: string, revision: string | null, request: typeof fetch = fetch) {
  let current = revision;
  let tail: Promise<unknown> = Promise.resolve();
  let blocked = false;
  let fingerprint = "";
  return {
    get revision() { return current; },
    save(payload: unknown) {
      const serialized = JSON.stringify(payload);
      const task = tail.catch(() => undefined).then(async () => {
        if (blocked) throw new SharedSaveError("Another staff member saved changes. Review before saving.", true);
        if (serialized === fingerprint) return current;
        const response = await request(endpoint, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload, expectedUpdatedAt: current }),
        });
        const data = await response.json() as { error?: string; updatedAt?: string };
        if (!response.ok) {
          blocked = response.status === 409 || response.status === 428;
          throw new SharedSaveError(data.error || "Your changes have not reached the server.", blocked);
        }
        if (typeof data.updatedAt !== "string") { blocked = true; throw new SharedSaveError("The server did not confirm a revision. Reload before saving.", true); }
        current = data.updatedAt;
        fingerprint = serialized;
        return current;
      });
      tail = task;
      return task;
    },
  };
}
