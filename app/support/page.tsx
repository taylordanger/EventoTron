"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { SuiteChrome } from "../SuiteChrome";
import { SUPPORT_APPS, TICKET_STATUSES, ticketNumber, type DiagnosticRecord, type SupportTicket, type TicketStatus } from "../support-data";
import { RELEASE } from "../release";

type Summary = Omit<SupportTicket, "payload">;
const label = (value: string) => value.replaceAll("-", " ");
const date = (value: string) => new Date(value).toLocaleString();
export default function SupportPage() {
  const params = useSearchParams();
  const selectedId = params.get("ticket") ?? "";
  const [admin, setAdmin] = useState(false);
  const [mode, setMode] = useState<"tickets" | "diagnostics">("tickets");
  const [tickets, setTickets] = useState<Summary[]>([]);
  const [logs, setLogs] = useState<DiagnosticRecord[]>([]);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [linked, setLinked] = useState<DiagnosticRecord[]>([]);
  const [status, setStatus] = useState(""); const [app, setApp] = useState(""); const [search, setSearch] = useState("");
  const [reference, setReference] = useState(""); const [severity, setSeverity] = useState("");
  const [offset, setOffset] = useState(0); const [more, setMore] = useState(false);
  const [reload, setReload] = useState(0); const [loading, setLoading] = useState(false); const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState(""); const [detailProblem, setDetailProblem] = useState("");
  const [message, setMessage] = useState(""); const [nextStatus, setNextStatus] = useState<TicketStatus>("new"); const [assignee, setAssignee] = useState("");
  const detailRequest = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/session", { signal: controller.signal, cache: "no-store" }).then(async response => { if (!response.ok) return; const session = await response.json() as { role: string }; setAdmin(session.role === "admin"); }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setProblem("");
      try {
        const query = new URLSearchParams({ app, offset: String(offset), ...(mode === "tickets" ? { status, q: search } : { reference, severity }) });
        const response = await fetch(`/api/${mode === "tickets" ? "support-tickets" : "diagnostics"}?${query}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { tickets?: Summary[]; entries?: DiagnosticRecord[]; hasMore: boolean; error?: string };
        if (!response.ok) throw new Error(data.error || "Support inbox could not be loaded.");
        if (mode === "tickets") setTickets(data.tickets ?? []); else setLogs(data.entries ?? []);
        setMore(data.hasMore);
      } catch (error) { if (!controller.signal.aborted) setProblem(error instanceof Error ? error.message : "Support inbox unavailable."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [mode, app, status, search, reference, severity, offset, reload]);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void fetch(`/api/support-tickets?id=${encodeURIComponent(selectedId)}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json() as { ticket: SupportTicket; diagnostics: DiagnosticRecord[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Report could not be loaded.");
      setTicket(data.ticket); setLinked(data.diagnostics); setNextStatus(data.ticket.status); setAssignee(data.ticket.assignee);
    }).catch(error => { if (!controller.signal.aborted) setDetailProblem(error.message); });
    return () => controller.abort();
  }, [selectedId]);
  async function open(id: string, preserveComment = false) {
    if (pending) return;
    const sequence = ++detailRequest.current;
    setDetailProblem(""); if (!preserveComment) setMessage("");
    try {
      const response = await fetch(`/api/support-tickets?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json() as { ticket: SupportTicket; diagnostics: DiagnosticRecord[]; error?: string };
      if (sequence !== detailRequest.current) return;
      if (!response.ok) throw new Error(data.error || "Report could not be loaded.");
      setTicket(data.ticket); setLinked(data.diagnostics); setNextStatus(data.ticket.status); setAssignee(data.ticket.assignee);
    } catch (error) { if (sequence === detailRequest.current) setDetailProblem(error instanceof Error ? error.message : "Report unavailable."); }
  }
  async function update(verify = false) {
    if (!ticket || pending) return; setPending(true); setDetailProblem("");
    try {
      const response = await fetch("/api/support-tickets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ticket.id, expectedUpdatedAt: ticket.updatedAt, message, ...(admin ? { status: nextStatus, assignee } : verify ? { status: "verified" } : {}) }) });
      const data = await response.json() as { ticket: SupportTicket; error?: string };
      if (!response.ok) throw new Error(data.error || "Update not confirmed.");
      setTicket(data.ticket); setNextStatus(data.ticket.status); setMessage(""); setReload(value => value + 1);
    } catch (error) { setDetailProblem(error instanceof Error ? error.message : "Update failed. Your comment is still open."); }
    finally { setPending(false); }
  }
  function filter(action: () => void) { action(); setOffset(0); }
  return <div className="suite-frame support-frame"><SuiteChrome active="support" /><main className="support-workspace">
    <header className="support-heading"><div><h1>Beta support</h1><small>Release {RELEASE}</small></div><button onClick={() => setReload(value => value + 1)}>Refresh</button></header>
    <nav className="support-modes" aria-label="Support views"><button aria-pressed={mode === "tickets"} onClick={() => filter(() => setMode("tickets"))}>{admin ? "All reports" : "My reports"}</button>{admin && <button aria-pressed={mode === "diagnostics"} onClick={() => filter(() => setMode("diagnostics"))}>Diagnostics</button>}</nav>
    <div className="support-filters">{mode === "diagnostics" && <><label>Error reference<input aria-label="Error reference" maxLength={40} value={reference} onChange={event => filter(() => setReference(event.target.value))} /></label><label>Severity<select aria-label="Severity" value={severity} onChange={event => filter(() => setSeverity(event.target.value))}><option value="">All levels</option><option value="error">Error</option><option value="warning">Warning</option></select></label></>}{mode === "tickets" && <label>Search titles<input value={search} onChange={event => filter(() => setSearch(event.target.value))} maxLength={160} /></label>}<label>Tool<select value={app} onChange={event => filter(() => setApp(event.target.value))}><option value="">All tools</option>{SUPPORT_APPS.map(value => <option key={value}>{value}</option>)}</select></label>{mode === "tickets" && <label>Status<select value={status} onChange={event => filter(() => setStatus(event.target.value))}><option value="">All statuses</option>{TICKET_STATUSES.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>}</div>
    {problem && <p role="alert" className="support-error">{problem}</p>}
    <div className={`support-content ${ticket && mode === "tickets" ? "with-detail" : ""}`}>
      <section className="support-list" aria-label={mode === "tickets" ? "Reports" : "Diagnostics"} aria-busy={loading}>
        {mode === "tickets" ? tickets.map(item => <button className={`support-ticket-row ${ticket?.id === item.id ? "is-selected" : ""}`} key={item.id} onClick={() => void open(item.id)}><span className="support-ticket-number">{ticketNumber(item.number)}</span><span><strong>{item.title}</strong><small>{item.app} · {label(item.impact)} · {date(item.updatedAt)}</small></span><span className={`support-status status-${item.status}`}>{label(item.status)}</span></button>) : logs.map(log => <Diagnostic key={log.id} log={log} />)}
        {!loading && !problem && !(mode === "tickets" ? tickets.length : logs.length) && <p className="support-empty">{mode === "tickets" ? "No reports match." : "No diagnostics match."}</p>}
        <footer className="support-pagination"><button disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 50))}>Previous</button><span>Page {Math.floor(offset / 50) + 1}</span><button disabled={loading || !more} onClick={() => setOffset(value => value + 50)}>Next</button></footer>
      </section>
      {mode === "tickets" && ticket && <article className="support-detail" aria-label="Report details">
        <header><h2>{ticketNumber(ticket.number)} · {ticket.title}</h2><button aria-label="Close report details" onClick={() => setTicket(null)}>×</button></header>
        <dl><dt>Reported by</dt><dd>{ticket.reporter}</dd><dt>Tool / impact</dt><dd>{ticket.app} / {label(ticket.impact)}</dd><dt>Release / browser</dt><dd>{ticket.payload.release} / {ticket.payload.browser}</dd><dt>Status</dt><dd>{label(ticket.status)}</dd></dl>
        <h3>What went wrong</h3><p className="support-prose">{ticket.payload.description}</p>
        {ticket.payload.expected && <><h3>Expected result</h3><p className="support-prose">{ticket.payload.expected}</p></>}
        {ticket.payload.steps && <><h3>Reproduction</h3><p className="support-prose">{ticket.payload.steps}</p></>}
        {ticket.payload.screenshot && <><Image className="support-screenshot" src={ticket.payload.screenshot} unoptimized width={1400} height={900} style={{ width: "auto", height: "auto" }} alt="Reporter-selected screenshot" /><a className="support-attachment-download" href={ticket.payload.screenshot} download={`${ticketNumber(ticket.number)}.${ticket.payload.screenshot.startsWith("data:image/png") ? "png" : ticket.payload.screenshot.startsWith("data:image/webp") ? "webp" : "jpg"}`}>Download screenshot</a></>}
        {admin && <section className="support-linked"><h3>Error references</h3>{linked.map(log => <Diagnostic key={log.id} log={log} />)}{ticket.payload.references.filter(ref => !linked.some(log => log.id === ref)).map(ref => <p key={ref}>{ref} · expired or unavailable</p>)}{!ticket.payload.references.length && <p>No linked diagnostics.</p>}</section>}
        <h3>Updates</h3>{ticket.payload.updates.map(entry => <div className="support-update" key={entry.id}><small>{entry.actor} · {date(entry.createdAt)} · {label(entry.status)}</small><p className="support-prose">{entry.message || "Status or assignment updated."}</p></div>)}
        <form onSubmit={event => { event.preventDefault(); void update(); }}>
          <fieldset disabled={pending}>{admin && <div className="support-form-row"><label>Report status<select aria-label="Report status" value={nextStatus} onChange={event => setNextStatus(event.target.value as TicketStatus)}>{TICKET_STATUSES.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label><label>Assigned to<input aria-label="Assigned to" maxLength={120} value={assignee} onChange={event => setAssignee(event.target.value)} /></label></div>}<label>Update for reporter<textarea aria-label="Update for reporter" maxLength={2000} value={message} onChange={event => setMessage(event.target.value)} /></label></fieldset>
          {detailProblem && <p role="alert" className="support-error">{detailProblem}</p>}
          <footer><button type="button" disabled={pending} onClick={() => void open(ticket.id, true)}>Reload report</button><button disabled={pending || (!admin && !message.trim())} type="submit">{pending ? "Saving…" : "Post update"}</button>{!admin && ticket.status === "fixed" && <button type="button" disabled={pending} onClick={() => void update(true)}>Verify fix</button>}</footer>
        </form>
      </article>}
      {detailProblem && !ticket && <p role="alert" className="support-error">{detailProblem}</p>}
    </div>
  </main></div>;
}

function Diagnostic({ log }: { log: DiagnosticRecord }) {
  return <details className="support-log"><summary><span className={`support-severity severity-${log.severity}`}>{log.severity}</span><strong>{label(log.code)}</strong><span>{log.app} · {log.count} occurrence{log.count === 1 ? "" : "s"}</span><small>{date(log.lastSeenAt)}</small></summary><dl><dt>Reference</dt><dd>{log.id}</dd><dt>Release</dt><dd>{log.release}</dd><dt>Source / route</dt><dd>{log.source} / {log.metadata.route}</dd><dt>Request</dt><dd>{log.metadata.method ?? "—"} · {log.metadata.status ?? "—"} · {log.metadata.durationMs ?? "—"} ms</dd><dt>Error category</dt><dd>{log.metadata.errorType ?? "—"}</dd></dl>{log.metadata.frames?.map(frame => <code key={frame}>{frame}</code>)}</details>;
}
