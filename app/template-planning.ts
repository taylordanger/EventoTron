import type { OperationsTemplate } from "./suite-settings";

export type PlanningTask = { id: string; title: string; done: boolean };
export function templateTasks(template?: OperationsTemplate): PlanningTask[] {
  const titles = [...new Set((template?.checklist ?? []).map(title => title.trim()).filter(Boolean))];
  return titles.map((title, index) => ({ id: `template:${template!.id}:${index}`, title, done: false }));
}
export function templateFood(template?: OperationsTemplate) {
  return {
    hospitalityNotes: template?.preset?.food?.notes ?? (template?.category === "food" ? [template.summary, ...template.checklist].join("\n") : ""),
    shoppingExtras: [...new Set(template?.preset?.food?.shoppingItems?.map(item => item.trim()).filter(Boolean) ?? [])],
  };
}
