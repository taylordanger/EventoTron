"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRevisionWriter, SharedSaveError } from "./revision-writer";

type Draft<T> = { payload: T; revision: string | null; savedAt: string };
export function downloadDraft(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = `${name.replace(/[^a-z0-9_-]/gi, "-")}-draft.json`; link.click();
  URL.revokeObjectURL(url);
}

export function useGuardedSave<T>(endpoint: string | null, payload: T, revision: string | null | undefined, enabled: boolean, onReload: (value: T) => void, skipInitialSave = false) {
  const [status, setStatus] = useState("READY");
  const [problem, setProblem] = useState("");
  const [recovered, setRecovered] = useState<Draft<T> | null>(null);
  const [reloading, setReloading] = useState(false);
  const [initialized, setInitialized] = useState<string | null>(null);
  const writer = useRef<ReturnType<typeof createRevisionWriter> | null>(null);
  const identity = useRef<string | null>(null);
  const latest = useRef(payload);
  const acknowledged = useRef("");
  const mounted = useRef(true);
  const recoveryPending = useRef(false);
  const key = `eventotron-draft:${endpoint}`;
  useEffect(() => { latest.current = payload; }, [payload]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!endpoint || revision === undefined || !enabled || identity.current === endpoint) return;
    const timer = window.setTimeout(() => {
    identity.current = endpoint;
    writer.current = createRevisionWriter(endpoint, revision);
    if (skipInitialSave) acknowledged.current = JSON.stringify(latest.current);
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const draft = JSON.parse(raw) as Draft<T>;
        if (draft && typeof draft.payload === "object" && JSON.stringify(draft.payload) !== JSON.stringify(latest.current)) {
          setRecovered(draft); setProblem("An unsaved draft from this tab is available."); setStatus("NOT ON SERVER");
          recoveryPending.current = true;
        } else sessionStorage.removeItem(key);
      }
    } catch { setProblem("Draft storage is unavailable. Download a backup before closing."); }
    setInitialized(endpoint);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [endpoint, revision, enabled, key, skipInitialSave]);

  const save = useCallback(async () => {
    if (!endpoint) { setStatus("NO EVENT FILE"); return null; }
    if (!enabled || !writer.current || recoveryPending.current || recovered || reloading) return null;
    const snapshot = latest.current;
    const serialized = JSON.stringify(snapshot);
    const draft = { payload: snapshot, revision: writer.current.revision, savedAt: new Date().toISOString() };
    try { sessionStorage.setItem(key, JSON.stringify(draft)); } catch {}
    setStatus("SAVING");
    try {
      const savingWriter = writer.current;
      const savedRevision = await savingWriter.save(snapshot);
      if (writer.current !== savingWriter) return savedRevision;
      acknowledged.current = serialized;
      if (!mounted.current) return savedRevision;
      if (JSON.stringify(latest.current) === serialized) {
        sessionStorage.removeItem(key); setStatus("SAVED"); setProblem("");
      }
      return savedRevision;
    } catch (error) {
      if (mounted.current) {
        setStatus(error instanceof SharedSaveError && error.conflict ? "CONFLICT - REVIEW" : "NOT ON SERVER");
        setProblem(error instanceof Error ? error.message : "Save failed. Your draft is still open.");
      }
      return null;
    }
  }, [endpoint, enabled, recovered, reloading, key]);

  useEffect(() => {
    if (!enabled || !endpoint || recoveryPending.current || recovered || reloading || !writer.current) return;
    if (JSON.stringify(payload) === acknowledged.current) return;
    try { sessionStorage.setItem(key, JSON.stringify({ payload, revision: writer.current.revision, savedAt: new Date().toISOString() })); } catch {}
    const working = window.setTimeout(() => setStatus("SAVING"), 0);
    const timer = window.setTimeout(() => void save(), 500);
    return () => { window.clearTimeout(working); window.clearTimeout(timer); };
  }, [payload, enabled, endpoint, recovered, reloading, save, key, initialized]);

  useEffect(() => {
    if (!enabled || !endpoint) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!problem && !recovered && JSON.stringify(latest.current) === acknowledged.current) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [problem, recovered, enabled, endpoint]);

  async function reload() {
    if (!endpoint || status === "SAVING") return;
    // Keep a downloadable copy before replacing the editor's working state.
    downloadDraft(recovered ?? { payload: latest.current, revision: writer.current?.revision }, "eventotron");
    setReloading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error("Server copy could not be loaded. Your draft is still open.");
      const data = await response.json() as { updatedAt: string | null; payload: T };
      writer.current = createRevisionWriter(endpoint, data.updatedAt);
      acknowledged.current = JSON.stringify(data.payload);
      sessionStorage.removeItem(key); recoveryPending.current = false; setRecovered(null); onReload(data.payload); setProblem(""); setStatus("SAVED");
    } catch (error) { setProblem(error instanceof Error ? error.message : "Reload failed."); }
    finally { setReloading(false); }
  }
  function restoreDraft() {
    if (!recovered || !endpoint) return;
    writer.current = createRevisionWriter(endpoint, recovered.revision);
    onReload(recovered.payload); recoveryPending.current = false; setRecovered(null); setProblem("");
  }
  return { status, save, problem, recovered: !!recovered, reloading, reload, restoreDraft,
    download: () => downloadDraft(recovered ?? { payload: latest.current, revision: writer.current?.revision }, "eventotron") };
}

export function SaveRecovery({ state }: { state: ReturnType<typeof useGuardedSave> }) {
  if (!state.problem && !state.recovered) return null;
  return <aside className="shared-save-recovery" role="alert">
    <p>{state.problem}</p>
    <button onClick={state.download}>DOWNLOAD MY DRAFT</button>
    {state.recovered ? <button onClick={state.restoreDraft}>RESTORE MY DRAFT</button> : <button onClick={() => void state.save()}>RETRY SAVE</button>}
    <button disabled={state.reloading || state.status === "SAVING"} onClick={() => void state.reload()}>{state.reloading ? "LOADING" : "KEEP DRAFT & LOAD SERVER COPY"}</button>
  </aside>;
}
