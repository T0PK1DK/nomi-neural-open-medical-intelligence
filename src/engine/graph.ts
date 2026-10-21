import type { GraphEdge, GraphNode } from "../types";

export interface LaidOutNode extends GraphNode {
  x: number;
  y: number;
}

/**
 * Fruchterman-Reingold-style layout with many cooling ticks.
 * Prefer a settled layout over a cheap random scatter.
 */
export function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  ticks = 280
): LaidOutNode[] {
  const n = nodes.length;
  if (n === 0) return [];
  const area = width * height;
  const k = Math.sqrt(area / n);
  const laid: LaidOutNode[] = nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / n;
    return {
      ...node,
      x: width / 2 + Math.cos(angle) * width * 0.28,
      y: height / 2 + Math.sin(angle) * height * 0.28
    };
  });

  for (let t = 0; t < ticks; t++) {
    const temp = ((ticks - t) / ticks) * k;
    const disp = laid.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = laid[i].x - laid[j].x;
        let dy = laid[i].y - laid[j].y;
        const dist = Math.max(0.01, Math.hypot(dx, dy));
        const force = (k * k) / dist;
        dx /= dist;
        dy /= dist;
        disp[i].x += dx * force;
        disp[i].y += dy * force;
        disp[j].x -= dx * force;
        disp[j].y -= dy * force;
      }
    }

    for (const edge of edges) {
      const i = laid.findIndex((p) => p.id === edge.from);
      const j = laid.findIndex((p) => p.id === edge.to);
      if (i < 0 || j < 0) continue;
      let dx = laid[i].x - laid[j].x;
      let dy = laid[i].y - laid[j].y;
      const dist = Math.max(0.01, Math.hypot(dx, dy));
      const force = (dist * dist) / k;
      dx /= dist;
      dy /= dist;
      disp[i].x -= dx * force;
      disp[i].y -= dy * force;
      disp[j].x += dx * force;
      disp[j].y += dy * force;
    }

    for (let i = 0; i < n; i++) {
      const mag = Math.max(0.01, Math.hypot(disp[i].x, disp[i].y));
      laid[i].x += (disp[i].x / mag) * Math.min(mag, temp);
      laid[i].y += (disp[i].y / mag) * Math.min(mag, temp);
      laid[i].x = Math.min(width - 24, Math.max(24, laid[i].x));
      laid[i].y = Math.min(height - 24, Math.max(24, laid[i].y));
    }
  }

  return laid;
}

export function neighborsOf(
  id: string,
  edges: GraphEdge[]
): string[] {
  const next = new Set<string>();
  for (const e of edges) {
    if (e.from === id) next.add(e.to);
    if (e.to === id) next.add(e.from);
  }
  return [...next];
}
