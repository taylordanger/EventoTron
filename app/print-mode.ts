"use client";

function reportDocumentTitle(title?: string) {
  const clean = (title || "EventoTron Report")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${clean || "EventoTron Report"} - Sheppard Semiconductor Systems`;
}

function afterReportPaint(callback: () => void) {
  if (typeof window.requestAnimationFrame !== "function") {
    window.setTimeout(callback, 120);
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(callback);
  });
}

export function printReport(title?: string) {
  const originalTitle = document.title;
  document.title = reportDocumentTitle(title);
  document.documentElement.classList.add("eventotron-printing");
  afterReportPaint(() => {
    window.print();
    window.setTimeout(() => {
      document.documentElement.classList.remove("eventotron-printing");
      document.title = originalTitle;
    }, 500);
  });
}

export function saveReportPdf(title?: string) {
  printReport(title);
}
