import { useState, useEffect, useRef } from "react";
import { Container, Title, Text, SimpleGrid, Paper, Stack, Progress, Group, Collapse, Button } from "@mantine/core";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { StatCard, Section, LogPanel } from "../shared/components";
import { getConfluenceData, startConfluenceCrawl, stopConfluenceCrawl, onConfluenceCrawlLog, onConfluenceCrawlDone, onConfluenceCrawlProgress } from "./data";
import { computeConfluenceTotals, computeByCategory, computeMonthlyPages, computeTopSpaces, computeMostDiscussed } from "./stats";
import type { ConfluenceData } from "./types";

function CrawlLogPanel({ logs, logsOpen, setLogsOpen, crawlProgress }: {
  logs: string[]; logsOpen: boolean; setLogsOpen: (fn: (o: boolean) => boolean) => void;
  crawlProgress: { current: number; total: number } | null;
}) {
  if (!logs.length && !logsOpen) return null;
  return <>
    <Group justify="center" mt="sm">
      <Button size="xs" variant="subtle" color="gray" className="hover-gray-outline-blue-text" onClick={() => setLogsOpen((o) => !o)}>
        {logsOpen ? "Hide Logs" : "Show Logs"}
      </Button>
    </Group>
    <Collapse in={logsOpen}>
      {crawlProgress && (
        <Stack gap={4} mt="xs">
          <Progress value={crawlProgress.total ? (crawlProgress.current / crawlProgress.total) * 100 : 100} size="sm" radius="xl" animated />
          <Text size="xs" c="dimmed" ta="center">{crawlProgress.total ? `Fetching pages: ${crawlProgress.current}/${crawlProgress.total} (${Math.round((crawlProgress.current / crawlProgress.total) * 100)}%)` : "Starting..."}</Text>
        </Stack>
      )}
      <Paper p="xs" radius="md" withBorder mt="xs">
        <LogPanel logs={logs} />
      </Paper>
    </Collapse>
  </>;
}

const COLORS = ["#339af0", "#51cf66", "#fcc419", "#ff6b6b", "#cc5de8", "#20c997", "#ff922b"];

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null;
  const { name, value } = payload[0];
  return (
    <div style={{ backgroundColor: "#1a1b1e", border: "1px solid #444", padding: "6px 10px", borderRadius: 4 }}>
      <span style={{ color: payload[0].payload.fill }}>{name}: {value}</span>
    </div>
  );
};

interface Props {
  filterSince: string;
  filterUntil: string;
  crawlRequested: number;
  atlassianAuthed: boolean;
}

export default function ConfluenceDashboard({ filterSince, filterUntil, crawlRequested, atlassianAuthed }: Props) {
  const [data, setData] = useState<ConfluenceData | null>(null);
  const [crawling, setCrawling] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState<{ current: number; total: number } | null>(null);
  const listenersRegistered = useRef(false);

  useEffect(() => {
    getConfluenceData().then((d) => d && setData(d));
  }, []);

  useEffect(() => {
    if (listenersRegistered.current) return;
    listenersRegistered.current = true;
    onConfluenceCrawlLog((msg) => setLogs((prev) => [...prev, msg]));
    onConfluenceCrawlProgress((current, total) => setCrawlProgress({ current, total }));
    onConfluenceCrawlDone((result) => {
      setCrawling(false);
      setCrawlProgress(null);
      if (result.success) {
        setLogs((prev) => [...prev, "✓ Done"]);
        getConfluenceData().then((d) => d && setData(d));
      } else {
        setLogs((prev) => [...prev, `Error: ${result.error}`]);
      }
    });
  }, []);

  const handleCrawl = async (force = false) => {
    if (crawling) { await stopConfluenceCrawl(); return; }
    if (!force && data?.meta && filterSince >= data.meta.since && filterUntil <= data.meta.until) {
      setLogs(["All data already available for this range."]);
      setLogsOpen(true);
      setCrawlProgress(null);
      return;
    }
    setLogs([]);
    setCrawling(true);
    setLogsOpen(true);
    setCrawlProgress({ current: 0, total: 0 });
    await startConfluenceCrawl({ since: filterSince, until: filterUntil });
  };

  const prevCrawlRequested = useRef(crawlRequested);
  useEffect(() => {
    if (crawlRequested > 0 && crawlRequested !== prevCrawlRequested.current && atlassianAuthed && !crawling) {
      const delta = crawlRequested - prevCrawlRequested.current;
      prevCrawlRequested.current = crawlRequested;
      handleCrawl(delta >= 1000);
    }
  }, [crawlRequested]);

  if (!atlassianAuthed && !data) {
    return (
      <Container size="xs" py="xl">
        <Text c="dimmed" ta="center" mt="xl">Connect to Atlassian in the Jira tab to use Confluence.</Text>
      </Container>
    );
  }

  if (!data && !crawling) {
    return (
      <>
        <Text c="dimmed" ta="center" mt="xl">No Confluence data yet. Click <Text span fw={700} c="#339af0">Refresh</Text> to crawl.</Text>
        <CrawlLogPanel logs={logs} logsOpen={logsOpen} setLogsOpen={setLogsOpen} crawlProgress={crawlProgress} />
      </>
    );
  }

  const pages = (data?.pages ?? []).filter((p) => p.created >= filterSince && p.created <= filterUntil + "T23:59:59Z");
  const totals = computeConfluenceTotals(pages);
  const byCategory = computeByCategory(pages);
  const monthly = computeMonthlyPages(pages, filterSince, filterUntil);
  const topSpaces = computeTopSpaces(pages);
  const mostDiscussed = computeMostDiscussed(pages);

  return (<>
    <CrawlLogPanel logs={logs} logsOpen={logsOpen} setLogsOpen={setLogsOpen} crawlProgress={crawlProgress} />

    <SimpleGrid cols={{ base: 2, md: 5 }} mt="md">
      <StatCard label="Pages Created" value={totals.pages} />
      <StatCard label="Blog Posts" value={totals.blogPosts} />
      <StatCard label="Spaces" value={totals.spaces} />
      <StatCard label="Comments Received" value={totals.totalComments} />
      <StatCard label="Comments Given" value={data?.commentsGiven ?? 0} />
    </SimpleGrid>

    <SimpleGrid cols={{ base: 1, md: 2 }} mt="md">
      {byCategory.length > 0 && (
        <Section title="By Category">
          <Paper p="md" radius="md" withBorder>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} labelLine={false}
                  label={({ name, value, percent }) => percent > 0.05 ? `${name}: ${value}` : ""}>
                  {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Section>
      )}
      {topSpaces.length > 0 && (
        <Section title="Top Spaces">
          <Paper p="md" radius="md" withBorder>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topSpaces} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis type="number" stroke="#aaa" />
                <YAxis type="category" dataKey="name" stroke="#aaa" width={75} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} />
                <Bar dataKey="value" fill="#339af0" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Section>
      )}
    </SimpleGrid>

    {monthly.length > 0 && (
      <Section title="Pages Over Time">
        <Paper p="md" radius="md" withBorder mt="md">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis dataKey="month" stroke="#aaa" tick={{ fontSize: 11 }} />
              <YAxis stroke="#aaa" />
              <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} />
              <Bar dataKey="pages" name="Pages" fill="#339af0" radius={[4, 4, 0, 0]} />
              <Bar dataKey="blogs" name="Blog Posts" fill="#51cf66" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      </Section>
    )}

    {mostDiscussed.length > 0 && (
      <Section title="Most Discussed Pages">
        <Paper p="md" radius="md" withBorder mt="md">
          <ResponsiveContainer width="100%" height={Math.min(mostDiscussed.length * 30 + 40, 300)}>
            <BarChart data={mostDiscussed} layout="vertical" margin={{ left: 200 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis type="number" stroke="#aaa" />
              <YAxis type="category" dataKey="title" stroke="#aaa" width={195} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} />
              <Bar dataKey="commentCount" name="Comments" fill="#fcc419" radius={[0, 4, 4, 0]} cursor="pointer"
                onClick={(d: any) => d?.url && window.open(d.url, "_blank")} />
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      </Section>
    )}
  </>);
}
