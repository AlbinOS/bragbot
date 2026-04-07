import { useState } from "react";
import { Paper, Text } from "@mantine/core";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea,
} from "recharts";
import type { SizeVsMergePoint } from "./stats";

export function SizeVsMergeChart({ data }: { data: SizeVsMergePoint[] }) {
  const [zoom, setZoom] = useState<{ x: [number, number] } | null>(null);
  const [sel, setSel] = useState<{ x1?: number; x2?: number }>({});

  return (
    <Paper p="md" radius="md" withBorder style={{ userSelect: "none", WebkitUserSelect: "none", cursor: sel.x1 != null ? "col-resize" : "crosshair" }}>
      <Text size="xs" c="dimmed" ta="right" mb={4} style={{ pointerEvents: "none" }}>{zoom ? "Double-click to reset zoom" : "Drag horizontally to zoom"}</Text>
      <div onMouseDown={(e) => e.preventDefault()}>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart
            onMouseDown={(e: any) => e && setSel({ x1: e.xValue })}
            onMouseMove={(e: any) => e && sel.x1 != null && setSel((s) => ({ ...s, x2: e.xValue }))}
            onMouseUp={() => {
              if (sel.x1 != null && sel.x2 != null) {
                const xMin = Math.min(sel.x1, sel.x2);
                const xMax = Math.max(sel.x1, sel.x2);
                if (xMax - xMin > 1) setZoom({ x: [xMin, xMax] });
              }
              setSel({});
            }}
            onDoubleClick={() => { setZoom(null); setSel({}); }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
            <XAxis type="number" dataKey="size" name="Lines changed" stroke="#aaa" domain={zoom ? zoom.x : ["auto", "auto"]} allowDataOverflow={!!zoom} />
            <YAxis type="number" dataKey="hours" name="Hours to merge" stroke="#aaa" allowDataOverflow={!!zoom} />
            <ZAxis range={[30, 30]} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }}
              content={({ payload }: any) => {
                if (!payload?.[0]) return null;
                const d = payload[0].payload;
                return (
                  <Paper p="xs" style={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }}>
                    <Text size="xs" fw={600} lineClamp={2}>{d.title}</Text>
                    <Text size="xs" c="dimmed">{d.size} lines · {d.hours}h to merge</Text>
                    <Text size="xs" c="blue">Click to open on GitHub</Text>
                  </Paper>
                );
              }}
            />
            {sel.x1 != null && sel.x2 != null && (
              <ReferenceArea x1={sel.x1} x2={sel.x2} strokeOpacity={0.3} fill="#339af0" fillOpacity={0.15} />
            )}
            <Scatter data={data} fill="#20c997" style={{ cursor: "pointer" }} onClick={(d: any) => window.open(d.url, "_blank")} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </Paper>
  );
}
