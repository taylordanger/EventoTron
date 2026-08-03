export type SuiteAppletName = "tabletron" | "foodotron" | "scheduluotron";

export async function readSuiteAppletState<T>(
  eventId: string | null | undefined,
  app: SuiteAppletName,
) {
  if (!eventId) return null;
  const response = await fetch(
    `/api/event-app-state?eventId=${encodeURIComponent(eventId)}&app=${encodeURIComponent(app)}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Applet state could not be loaded");
  const data = (await response.json()) as { payload?: T };
  return data.payload ?? null;
}

export async function saveSuiteAppletState(
  eventId: string | null | undefined,
  app: SuiteAppletName,
  payload: unknown,
) {
  if (!eventId) return null;
  const response = await fetch(
    `/api/event-app-state?eventId=${encodeURIComponent(eventId)}&app=${encodeURIComponent(app)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    },
  );
  if (!response.ok) throw new Error("Applet state could not be saved");
  return response.json();
}
