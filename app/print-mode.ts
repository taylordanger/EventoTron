"use client";

function reportDocumentTitle(title?: string) {
  const clean = (title || "EventoTron Report")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${clean || "EventoTron Report"} - Sheppard Semiconductor Systems`;
}

export function printReport(title?: string) {
  const originalTitle = document.title;
  document.title = reportDocumentTitle(title);
  document.documentElement.classList.add("eventotron-printing");
  window.setTimeout(() => {
    window.print();
    window.setTimeout(() => {
      document.documentElement.classList.remove("eventotron-printing");
      document.title = originalTitle;
    }, 500);
  }, 80);
}

export function saveReportPdf(title?: string) {
  printReport(title);
}
