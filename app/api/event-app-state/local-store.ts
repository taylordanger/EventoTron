type AppletState = {
  id: string;
  eventId: string;
  appName: string;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
};

const globalKey = "__eventotron_applet_state_store__";

function store() {
  const root = globalThis as typeof globalThis & {
    [globalKey]?: Map<string, AppletState>;
  };
  root[globalKey] ??= new Map();
  return root[globalKey];
}

export function readLocalAppletState(eventId: string, appName: string) {
  return store().get(`${appName}:${eventId}`) ?? null;
}

export function writeLocalAppletState(eventId: string, appName: string, payload: unknown) {
  const now = new Date().toISOString();
  const key = `${appName}:${eventId}`;
  const existing = store().get(key);
  const state: AppletState = {
    id: `${appName}_${eventId}`,
    eventId,
    appName,
    payload,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  store().set(key, state);
  return state;
}

export function deleteLocalAppletState(eventId: string, appName: string) {
  return store().delete(`${appName}:${eventId}`);
}
