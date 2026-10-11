"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { installDiagnostics, supportContext } from "./support-client";
import { appFromPath, browserLabel, SUPPORT_APPS, TICKET_IMPACTS, ticketNumber, validateTicket, type TicketDraft } from "./support-data";
import { RELEASE } from "./release";

const DRAFT_KEY = "eventotron-support-draft";
export function ReportProblemButton() {
  return <button className="support-ribbon-trigger" onClick={event => window.dispatchEvent(new CustomEvent("eventotron-report", { detail: event.currentTarget }))}>Report a problem</button>;
}
export function BetaSupport() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TicketDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [attachmentPending, setAttachmentPending] = useState(false);
  const upload = useRef(0);
  const [problem, setProblem] = useState("");
  const [receipt, setReceipt] = useState<{ id: string; number: number } | null>(null);
  const [existing, setExisting] = useState<{ id: string; number: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => installDiagnostics(), []);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  useEffect(() => { if (draft) { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {} } }, [draft]);
  const start = useCallback(() => {
    let saved: TicketDraft | null = null;
    try {
      const parsed = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null");
      if (parsed && typeof parsed.title === "string" && typeof parsed.description === "string") {
        const checked = validateTicket({ ...parsed, title: parsed.title || "Draft", description: parsed.description || "Draft" });
        if (checked) saved = { ...checked, title: parsed.title, description: parsed.description };
      }
    } catch {}
    upload.current++; setAttachmentPending(false);
    setDraft(saved ?? { id: crypto.randomUUID(), title: "", description: "", expected: "", steps: "", impact: "blocked", app: appFromPath(location.pathname), release: RELEASE, browser: browserLabel(navigator.userAgent), references: supportContext().flatMap(entry => entry.reference ? [entry.reference] : []) });
    setReceipt(null); setExisting(null); setProblem(""); setOpen(true);
  }, []);
  useEffect(() => {
    const onReport = (event: Event) => { trigger.current = (event as CustomEvent<HTMLButtonElement>).detail; start(); };
    window.addEventListener("eventotron-report", onReport);
    return () => window.removeEventListener("eventotron-report", onReport);
  }, [start]);
  function close() { if (pending) return; setOpen(false); trigger.current?.focus(); }
  function update(patch: Partial<TicketDraft>) { setDraft(current => current ? { ...current, ...patch } : current); }
  async function screenshot(file?: File) {
    const attempt = ++upload.current; const reportId = draft?.id;
    if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10_000_000) { setAttachmentPending(false); setProblem("Choose a PNG, JPEG or WebP screenshot under 10 MB."); return; }
    setAttachmentPending(true);
    try {
      const bitmap = await createImageBitmap(file); const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d"); if (!context) throw new Error("Screenshot could not be read.");
      context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      let image = canvas.toDataURL("image/jpeg", .75);
      if (image.length > 550_000) image = canvas.toDataURL("image/jpeg", .45);
      if (image.length > 550_000) throw new Error("Choose a smaller screenshot.");
      if (upload.current === attempt) { setDraft(current => current && current.id === reportId ? { ...current, screenshot: image } : current); setProblem(""); }
    } catch (error) { if (upload.current === attempt) setProblem(error instanceof Error ? error.message : "Screenshot could not be read."); }
    finally { if (upload.current === attempt) setAttachmentPending(false); }
  }
  async function submit() {
    if (!draft || pending || attachmentPending) return;
    if (!validateTicket(draft)) { setProblem("Add a title and description before submitting."); return; }
    setPending(true); setProblem("");
    try {
      const submitting = { ...draft, references: [...new Set([...draft.references, ...supportContext().flatMap(entry => entry.reference ? [entry.reference] : [])])].slice(-10) };
      setDraft(submitting);
      const response = await fetch("/api/support-tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submitting), redirect: "error", signal: AbortSignal.timeout(15000) });
      const result = await response.json() as { id?: string; number?: number; error?: string; existing?: { id: string; number: number } };
      if (response.status === 409 && result.existing) setExisting(result.existing);
      if (!response.ok || !result.id || !Number.isInteger(result.number)) throw new Error(result.error || "Report submission was not confirmed. Your draft is still here.");
      setReceipt({ id: result.id, number: result.number! }); setDraft(null); sessionStorage.removeItem(DRAFT_KEY);
    } catch (error) { setProblem(error instanceof Error ? error.message : "Report submission failed. Your draft is still here."); }
    finally { setPending(false); }
  }
  function download() {
    const blob = new Blob([JSON.stringify({ format: "eventotron-support-report", release: RELEASE, exportedAt: new Date().toISOString(), report: draft, diagnostics: supportContext() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `eventotron-support-${draft?.id ?? "report"}.json`; a.click(); URL.revokeObjectURL(url);
  }
  return <>
    <button ref={trigger} className="support-launcher" onClick={event => { trigger.current = event.currentTarget; start(); }}>Report a problem</button>
    <dialog ref={dialog} className="support-dialog" aria-labelledby="support-report-heading" onCancel={event => { event.preventDefault(); close(); }}>
      <header><h2 id="support-report-heading">{receipt ? "Report received" : "Report a problem"}</h2><button type="button" onClick={close} disabled={pending} aria-label="Close problem report">×</button></header>
      {receipt ? <section className="support-receipt"><strong>{ticketNumber(receipt.number)}</strong><Link href={`/support?ticket=${receipt.id}`} onClick={close}>View report</Link></section> : draft && <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        <fieldset disabled={pending}>
          <label>Title<input autoFocus required maxLength={160} value={draft.title} onChange={event => update({ title: event.target.value })} /></label>
          <div className="support-form-row"><label>Tool<select aria-label="Tool" value={draft.app} onChange={event => update({ app: event.target.value as TicketDraft["app"] })}>{SUPPORT_APPS.map(app => <option key={app}>{app}</option>)}</select></label><label>Impact<select aria-label="Impact" value={draft.impact} onChange={event => update({ impact: event.target.value as TicketDraft["impact"] })}>{TICKET_IMPACTS.map(impact => <option key={impact} value={impact}>{impact.replaceAll("-", " ")}</option>)}</select></label></div>
          <label>What went wrong? (omit passwords and client contact details)<textarea required maxLength={4000} value={draft.description} onChange={event => update({ description: event.target.value })} /></label>
          <label>Expected result<textarea maxLength={2000} value={draft.expected} onChange={event => update({ expected: event.target.value })} /></label>
          <label>Steps to reproduce<textarea maxLength={4000} value={draft.steps} onChange={event => update({ steps: event.target.value })} /></label>
          <label>Screenshot (optional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void screenshot(event.target.files?.[0]); event.target.value = ""; }} /></label>
          {draft.screenshot && <div className="support-attachment"><Image src={draft.screenshot} unoptimized width={1400} height={900} style={{ width: "auto", height: "auto" }} alt="Screenshot selected for this report" /><button type="button" onClick={() => update({ screenshot: undefined })}>Remove screenshot</button></div>}
          <small className="support-release">Release {draft.release} · {draft.references.length} error references</small>
        </fieldset>
        {problem && <p role="alert" className="support-error">{problem}</p>}
        {existing && <Link className="support-attachment-download" href={`/support?ticket=${existing.id}`} onClick={() => { download(); sessionStorage.removeItem(DRAFT_KEY); setDraft(null); close(); }}>Keep draft &amp; open {ticketNumber(existing.number)}</Link>}
        <footer><button type="button" onClick={download}>Download report</button><button type="submit" disabled={pending || attachmentPending}>{pending ? "Submitting…" : attachmentPending ? "Preparing screenshot…" : "Submit report"}</button></footer>
      </form>}
    </dialog>
  </>;
}
