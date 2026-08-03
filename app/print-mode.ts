"use client";

export function printReport() {
  document.documentElement.classList.add("eventotron-printing");
  window.setTimeout(() => {
    window.print();
    window.setTimeout(() => document.documentElement.classList.remove("eventotron-printing"), 500);
  }, 80);
}
