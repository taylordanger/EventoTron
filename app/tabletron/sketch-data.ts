export type SketchPoint = { x: number; y: number };
export type SketchStroke = { id: string; points: SketchPoint[]; label?: string };
export function normalizeSketches(value: unknown): SketchStroke[] {
  if (!Array.isArray(value)) return [];
  return value.filter((stroke): stroke is SketchStroke => !!stroke && typeof stroke.id === "string"
    && Array.isArray(stroke.points) && stroke.points.length >= 2
    && stroke.points.every((point: SketchPoint) => Number.isFinite(point?.x) && Number.isFinite(point?.y)))
    .slice(0, 200).map(stroke => ({ id: stroke.id, points: stroke.points.slice(0, 2000), label: typeof stroke.label === "string" ? stroke.label.slice(0, 80) : "" }));
}
export function sketchPoint(clientX: number, clientY: number, bounds: { left: number; top: number; width: number; height: number }, width: number, height: number): SketchPoint {
  return { x: Math.max(0, Math.min(width, (clientX - bounds.left) / bounds.width * width)), y: Math.max(0, Math.min(height, (clientY - bounds.top) / bounds.height * height)) };
}
