import { useState, useEffect, useRef } from "react";
import { Container, Title, Text, SimpleGrid, Paper, Stack } from "@mantine/core";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { StatCard, Section, LogPanel } from "../shared/components";
import { getConfluenceData, startConfluenceCrawl, stopConfluenceCrawl, onConfluenceCrawlLog, onConfluenceCrawlDone } from "./data";
import { computeConfluenceTotals, computeByCategory, computeMonthlyPages, computeTopSpaces, computeMostDiscussed } from "./stats";
import type { ConfluenceData } from "./types";

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
  const listenersRegistered = useRef(false);

  useEffect(() => {
    getConfluenceData().then((d) => d && setData(d));
  }, []);

  useEffect(() => {
    if (listenersRegistered.current) return;
    listenersRegistered.current = true;
    onConfluenceCrawlLog((msg) => setLogs((prev) => [...prev, msg]));
    onConfluenceCrawlDone((result) => {
      setCrawling(false);
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
    if (!force && data?.meta && filterSince >= data.meta.since && filterUntil <= data.meta.until) return;
    setLogs([]);
    setCrawling(true);
    await startConfluenceCrawl({ since: filterSince, until: filterUntil });
  };

  useEffect(() => {
    if (crawlRequested > 0 && atlassianAuthed && !crawling) handleCrawl(crawlRequested >= 1000);
  }, [crawlRequested]);

  if (!atlassianAuthed && !data) {
    return (
      <Container size="xs" py="xl">
        <Text c="dimmed" ta="center" mt="xl">Connect to Atlassian in the Jira tab to use Confluence.</Text>
      </Container>
    );
  }

  if (!data) {
    return (
      <Container size="xs" py="xl">
        <Text c="dimmed" ta="center" mt="xl">No Confluence data yet. Click Refresh to crawl.</Text>
        {logs.length > 0 && <LogPanel logs={logs} />}
      </Container>
    );
  }

  const pages = data.pages.filter((p) => p.created >= filterSince && p.created <= filterUntil + "T23:59:59Z");
  const totals = computeConfluenceTotals(pages);
  const byCategory = computeByCategory(pages);
  const monthly = computeMonthlyPages(pages, filterSince, filterUntil);
  const topSpaces = computeTopSpaces(pages);
  const mostDiscussed = computeMostDiscussed(pages);

  return (<>
    {logs.length > 0 && <LogPanel logs={logs} />}

    <SimpleGrid cols={{ base: 2, md: 5 }} mt="md">
      <StatCard label="Pages Created" value={totals.pages} />
      <StatCard label="Blog Posts" value={totals.blogPosts} />
      <StatCard label="Spaces" value={totals.spaces} />
      <StatCard label="Comments Received" value={totals.totalComments} />
      <StatCard label="Comments Given" value={data.commentsGiven ?? 0} />
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
