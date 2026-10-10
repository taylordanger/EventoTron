type StoredSettings = {
  id: string;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
};

const globalKey = "__eventotron_settings_store__";

function store() {
  const root = globalThis as typeof globalThis & {
    [globalKey]?: StoredSettings | null;
  };
  root[globalKey] ??= null;
  return root;
}

export function readLocalSettings() {
  return store()[globalKey] ?? null;
}

export function writeLocalSettings(payload: unknown, now = new Date().toISOString()) {
  const root = store();
  const current = root[globalKey];
  const settings: StoredSettings = {
    id: "workspace",
    payload,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
  root[globalKey] = settings;
  return settings;
}
