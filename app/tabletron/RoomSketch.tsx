"use client";

import { useRef, useState } from "react";
import { normalizeSketches, sketchPoint, type SketchStroke } from "./sketch-data";

export function SketchMap({ strokes, width, height }: { strokes?: SketchStroke[]; width: number; height: number }) {
  return <svg className="room-sketch-map" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Room annotations">
    {normalizeSketches(strokes).map(stroke => <g key={stroke.id}><polyline points={stroke.points.map(point => `${point.x},${point.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />{stroke.label && <text x={stroke.points[0].x} y={Math.max(1, stroke.points[0].y - 0.5)} fontSize={Math.min(width, height) / 30} fill="currentColor">{stroke.label}</text>}</g>)}
  </svg>;
}

export function RoomSketch({ strokes = [], width, height, drawing, label, onChange }: { strokes?: SketchStroke[]; width: number; height: number; drawing: boolean; label: string; onChange: (strokes: SketchStroke[]) => void }) {
  const [draft, setDraft] = useState<SketchStroke | null>(null);
  const active = useRef<SketchStroke | null>(null);
  const pointer = useRef<number | null>(null);
  return <div className={`room-sketch-layer ${drawing ? "drawing" : ""}`}
    onPointerDown={event => {
      if (!drawing || active.current || event.button !== 0) return;
      event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); pointer.current = event.pointerId;
      active.current = { id: crypto.randomUUID(), label: label.trim().slice(0, 80), points: [sketchPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), width, height)] };
      setDraft(active.current);
    }}
    onPointerMove={event => {
      if (!active.current || pointer.current !== event.pointerId) return;
      const point = sketchPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), width, height);
      const prior = active.current.points.at(-1)!;
      if (Math.hypot(point.x - prior.x, point.y - prior.y) < 0.05 || active.current.points.length >= 2000) return;
      active.current = { ...active.current, points: [...active.current.points, point] }; setDraft(active.current);
    }}
    onPointerUp={event => {
      if (pointer.current !== event.pointerId) return;
      if (active.current && active.current.points.length > 1) onChange([...strokes, active.current].slice(-200));
      active.current = null; pointer.current = null; setDraft(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { active.current = null; pointer.current = null; setDraft(null); }}>
    <SketchMap strokes={draft ? [...strokes, draft] : strokes} width={width} height={height} />
  </div>;
}
