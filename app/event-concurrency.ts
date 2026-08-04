export type RevisionedEvent = {
  id: string;
  revision?: string;
};

const metadataFields = new Set(["revision"]);

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function eventFingerprint(event: RevisionedEvent) {
  const values = event as Record<string, unknown>;
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(values)
        .filter(([key]) => !metadataFields.has(key))
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

export function mergeConcurrentEvent<T extends RevisionedEvent>(
  base: T,
  local: T,
  remote: T,
) {
  const merged = { ...remote } as T;
  const baseValues = base as Record<string, unknown>;
  const localValues = local as Record<string, unknown>;
  const remoteValues = remote as Record<string, unknown>;
  const mergedValues = merged as Record<string, unknown>;
  const conflictFields: string[] = [];
  const keys = new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ]);

  for (const key of keys) {
    if (key === "id" || metadataFields.has(key)) continue;
    const baseValue = baseValues[key];
    const localValue = localValues[key];
    const remoteValue = remoteValues[key];
    const localChanged = !sameValue(localValue, baseValue);
    const remoteChanged = !sameValue(remoteValue, baseValue);

    if (localChanged && remoteChanged && !sameValue(localValue, remoteValue)) {
      conflictFields.push(key);
      continue;
    }
    if (localChanged) mergedValues[key] = localValue;
  }

  return { merged, conflictFields: conflictFields.sort() };
}
