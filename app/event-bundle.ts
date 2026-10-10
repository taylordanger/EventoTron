import type { EventoEventContext } from "./event-context";
import type { SuiteSettings } from "./suite-settings";

export type SuiteEventBundle<
  Tabletron = unknown,
  Foodotron = unknown,
  Scheduluotron = unknown,
> = {
  event: EventoEventContext;
  settings: Partial<SuiteSettings> | null;
  applets: {
    tabletron: Tabletron | null;
    foodotron: Foodotron | null;
    scheduluotron: Scheduluotron | null;
  };
  appletRevisions: { tabletron: string | null; foodotron: string | null; scheduluotron: string | null };
  updatedAt: string | null;
  source: "database" | "local-dev";
};

export async function readSuiteEventBundle<
  Tabletron = unknown,
  Foodotron = unknown,
  Scheduluotron = unknown,
>(eventId: string) {
  const response = await fetch(
    `/api/event-bundle?eventId=${encodeURIComponent(eventId)}`,
    { cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Event bundle could not be loaded");
  return response.json() as Promise<
    SuiteEventBundle<Tabletron, Foodotron, Scheduluotron>
  >;
}
