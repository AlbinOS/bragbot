import { Paper, Text, Title, Stack, ScrollArea } from "@mantine/core";
import { useRef, useEffect, useCallback } from "react";

export function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Paper p="md" radius="md" withBorder>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
      <Title order={2} mt={4}>{value}</Title>
      {sub && <Text size="sm" c="dimmed" mt={2}>{sub}</Text>}
    </Paper>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack mt="xl" gap="sm">
      <Title order={3}>{title}</Title>
      {children}
    </Stack>
  );
}

function logColor(line: string): string | undefined {
  if (line.toLowerCase().includes("error") || line.toLowerCase().includes("cancelled")) return "#ff6b6b";
  if (line.startsWith("  Found") || line.startsWith("  Merged") || line.startsWith("Done")) return "#51cf66";
  if (line.startsWith("Total") || line.startsWith("Repos to") || line.startsWith("Fetched") || line.startsWith("Parsed") || line.startsWith("Saved")) return "#fcc419";
  if (line.startsWith("Searching") || line.startsWith("Crawling")) return "#339af0";
  if (line.startsWith("  Fetching")) return "#868e96";
  return "#c1c2c5";
}

export function LogPanel({ logs, height = 180 }: { logs: string[]; height?: number }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const onScroll = useCallback(({ y }: { x: number; y: number }) => {
    const vp = viewportRef.current;
    if (!vp) return;
    stickToBottom.current = vp.scrollHeight - y - vp.clientHeight < 30;
  }, []);

  useEffect(() => {
    if (stickToBottom.current && viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <ScrollArea h={height} type="auto" viewportRef={viewportRef} onScrollPositionChange={onScroll}>
      <div style={{ fontSize: 11, fontFamily: "monospace", whiteSpace: "pre-wrap", padding: "8px", userSelect: "text", cursor: "text" }}>
        {logs.length === 0 ? <span style={{ color: "#868e96" }}>Waiting...</span> : logs.map((line, i) => (
          <div key={i} style={{ color: logColor(line) }}>{line}</div>
        ))}
      </div>
    </ScrollArea>
  );
}
