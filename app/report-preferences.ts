export const REPORT_VIEWS_KEY = "eventotron-report-views-v1";
export const reportSections = ["brief", "playbook", "rooms", "schedule", "food"];
export type ReportView = {
  id: string; name: string; sections: string[]; costs: boolean; layouts: boolean;
  references: boolean; summary: boolean; recipient: string; rooms?: string[];
};
export const departmentViews: ReportView[] = [
  { id: "kitchen", name: "Kitchen", sections: ["brief", "food"], costs: false, layouts: false, references: false, summary: false, recipient: "Kitchen" },
  { id: "setup", name: "Setup crew", sections: ["rooms"], costs: false, layouts: true, references: false, summary: false, recipient: "Setup crew" },
  { id: "front-desk", name: "Front desk", sections: ["brief", "schedule"], costs: false, layouts: false, references: false, summary: true, recipient: "Front desk" },
  { id: "mod", name: "MOD", sections: ["brief", "rooms", "schedule"], costs: false, layouts: false, references: false, summary: false, recipient: "MOD" },
];
export function parseReportViews(value: unknown): ReportView[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ReportView => !!item && typeof item === "object"
    && typeof item.id === "string" && typeof item.name === "string" && !!item.name.trim()
    && Array.isArray(item.sections) && item.sections.every((section: unknown) => typeof section === "string" && reportSections.includes(section))
    && [item.costs, item.layouts, item.references, item.summary].every(flag => typeof flag === "boolean")
    && typeof item.recipient === "string" && (item.rooms === undefined || (Array.isArray(item.rooms) && item.rooms.every((room: unknown) => typeof room === "string"))))
    .slice(0, 30);
}
