import Link from "next/link";
import { eventTabHref } from "./event-context";
import { ClockDisplay } from "./ClockDisplay";

type SuiteArea = "calendar" | "tabletron" | "foodotron" | "scheduluotron";

const tabs: { id: SuiteArea; href: string; label: string }[] = [
  { id: "calendar", href: "/", label: "Calendar" },
  { id: "tabletron", href: "/tabletron", label: "Tabletron" },
  { id: "foodotron", href: "/foodotron", label: "Foodotron" },
  { id: "scheduluotron", href: "/scheduluotron", label: "Scheduluotron" },
];

const names: Record<SuiteArea, { mark: string; title: string }> = {
  calendar: { mark: "E", title: "EVENTOTRON" },
  tabletron: { mark: "T", title: "TABLETRON" },
  foodotron: { mark: "F", title: "FOODOTRON" },
  scheduluotron: { mark: "S", title: "SCHEDULUOTRON" },
};

export function SuiteChrome({ active, eventId }: { active: SuiteArea; eventId?: string }) {
  const current = names[active];
  return (
    <header className="eventotron-ribbon suite-chrome">
      <Link className="eventotron-logo" href="/">
        <span>{current.mark}</span> {current.title}
      </Link>
      <nav className="folder-tabs" aria-label="EventoTron tools">
        {tabs.map((tab) => (
          <Link
            className={`folder-tab ${tab.id === active ? "active" : ""}`}
            href={eventTabHref(tab.href, eventId)}
            key={tab.id}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Link
        className="master-report-link"
        href={`/master-report${eventId ? `?event=${encodeURIComponent(eventId)}` : ""}`}
      >
        MASTER REPORT
      </Link>
      <ClockDisplay />
    </header>
  );
}
