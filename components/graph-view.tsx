"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { GraphData } from "@/lib/graph/queries";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const COLORS: Record<string, string> = {
  Challenge: "#0ea5e9",
  Business: "#f59e0b",
  Dataset: "#8b5cf6",
  City: "#64748b",
  Skill: "#10b981",
  Builder: "#ec4899",
  Team: "#ef4444",
  Delivery: "#22c55e",
  Stakeholder: "#a16207",
  Venue: "#0d9488",
  Funder: "#4f46e5",
};

export function GraphView({ data, height = 420, unavailableLabel }: { data: GraphData; height?: number; unavailableLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!data.available) {
    return <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">{unavailableLabel}</p>;
  }
  const labels = [...new Set(data.nodes.map((n) => n.label))];
  return (
    <div ref={ref} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <ForceGraph2D
        width={width}
        height={height}
        graphData={{ nodes: data.nodes.map((n) => ({ ...n })), links: data.links.map((l) => ({ ...l })) }}
        nodeLabel={(n) => `${(n as { label: string }).label}: ${(n as { name: string }).name}`}
        nodeColor={(n) => COLORS[(n as { label: string }).label] ?? "#94a3b8"}
        nodeRelSize={5}
        linkLabel={(l) => (l as { type: string }).type}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        nodeCanvasObjectMode={() => "after"}
        nodeCanvasObject={(node, ctx, scale) => {
          if (scale < 1.2) return;
          const n = node as { x: number; y: number; name: string };
          ctx.font = `${10 / scale}px sans-serif`;
          ctx.fillStyle = "#475569";
          ctx.fillText(n.name.slice(0, 24), n.x + 6, n.y + 3);
        }}
      />
      <div className="flex flex-wrap gap-3 border-t border-slate-200 p-3 text-xs dark:border-slate-800">
        {labels.map((l) => (
          <span key={l} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[l] ?? "#94a3b8" }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
