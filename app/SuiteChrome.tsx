import Link from "next/link";
import { eventTabHref } from "./event-context";
import { ClockDisplay } from "./ClockDisplay";
import { SuiteIdentityBadge } from "./SuiteIdentityBadge";
import { ReportProblemButton } from "./BetaSupport";

type SuiteArea = "calendar" | "personal" | "tabletron" | "foodotron" | "scheduluotron" | "settings" | "support";

const tabs: { id: SuiteArea; href: string; label: string }[] = [
  { id: "calendar", href: "/", label: "Calendar" },
  { id: "personal", href: "/personal", label: "My Workspace" },
  { id: "tabletron", href: "/tabletron", label: "Tabletron" },
  { id: "foodotron", href: "/foodotron", label: "Foodotron" },
  { id: "scheduluotron", href: "/scheduluotron", label: "Scheduluotron" },
  { id: "settings", href: "/settings", label: "Settings" },
  { id: "support", href: "/support", label: "Support" },
];

const names: Record<SuiteArea, { mark: string; title: string }> = {
  calendar: { mark: "E", title: "EVENTOTRON" },
  personal: { mark: "P", title: "MY WORKSPACE" },
  tabletron: { mark: "T", title: "TABLETRON" },
  foodotron: { mark: "F", title: "FOODOTRON" },
  scheduluotron: { mark: "S", title: "SCHEDULUOTRON" },
  settings: { mark: "S", title: "SETTINGS" },
  support: { mark: "S", title: "SUPPORT" },
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
            href={tab.id === "support" || tab.id === "personal" ? tab.href : eventTabHref(tab.href, eventId)}
            key={tab.id}
            aria-current={tab.id === active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <details className="suite-more">
        <summary>More</summary>
        <div className="suite-more-panel">
          <ReportProblemButton />
          <Link
            className="master-report-link"
            href={`/master-report${eventId ? `?event=${encodeURIComponent(eventId)}` : ""}`}
          >
            MASTER REPORT
          </Link>
          <SuiteIdentityBadge />
        </div>
      </details>
      <ClockDisplay />
    </header>
  );
}
