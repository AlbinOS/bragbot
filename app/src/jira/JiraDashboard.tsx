import { useState, useEffect, useRef } from "react";
import { Container, Title, Text, SimpleGrid, Paper, Group, Stack, Button, TextInput, Anchor, Collapse, Center, Loader, Progress } from "@mantine/core";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { StatCard, Section, LogPanel } from "../shared/components";

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null;
  const { name, value } = payload[0];
  return (
    <div style={{ backgroundColor: "#1a1b1e", border: "1px solid #444", padding: "6px 10px", borderRadius: 4 }}>
      <span style={{ color: payload[0].payload.fill }}>{name}: {value}</span>
    </div>
  );
};
import { getJiraAuthStatus, saveJiraAuth, jiraLogout, getJiraData, startJiraCrawl, stopJiraCrawl, onJiraCrawlLog, onJiraCrawlDone, onJiraCrawlProgress, detectJiraEnv, loginWithJiraEnv } from "./data";
import { computeTotals, computeWeeklyVelocity, computeCycleTimeTrend, computeByType, computeByPriority, computeTimeInStatus, computePointsVsCycleTime, computeDayOfWeek } from "./stats";
import type { JiraData } from "./types";

const COLORS = ["#339af0", "#51cf66", "#fcc419", "#ff6b6b", "#cc5de8", "#20c997", "#ff922b"];

export interface JiraDashboardProps {
  filterSince: string;
  filterUntil: string;
  crawlRequested: number;
  onAuthChange?: (info: { authenticated: boolean; email?: string; site?: string }) => void;
}

export default function JiraDashboard({ filterSince, filterUntil, crawlRequested, onAuthChange }: JiraDashboardProps) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [site, setSite] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSite, setAuthSite] = useState("");
  const [envInfo, setEnvInfo] = useState<{ available: boolean; site?: string; email?: string } | null>(null);

  const [data, setData] = useState<JiraData | null>(null);
  const [crawling, setCrawling] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState<{ current: number; total: number } | null>(null);

  const listenersRegistered = useRef(false);

  useEffect(() => {
    // Load cached data immediately
    getJiraData().then((d) => d && setData(d));
    // Check auth in background
    getJiraAuthStatus().then((s) => {
      setAuthed(s.authenticated);
      setAuthChecked(true);
      if (s.site) setAuthSite(s.site);
      onAuthChange?.({ authenticated: s.authenticated, email: s.email, site: s.site });
      if (!s.authenticated) detectJiraEnv().then(setEnvInfo);
    });
  }, []);

  useEffect(() => {
    if (listenersRegistered.current) return;
    listenersRegistered.current = true;
    onJiraCrawlLog((msg) => setLogs((l) => [...l, msg]));
    onJiraCrawlProgress((current, total) => setCrawlProgress({ current, total }));
    onJiraCrawlDone((result) => {
      setCrawling(false);
      setCrawlProgress(null);
      if (result.success) getJiraData().then((d) => d && setData(d));
      else setLogs((l) => [...l, `Error: ${result.error}`]);
    });
  }, []);

  const handleAuth = async () => {
    setAuthError("");
    const result = await saveJiraAuth(email, token, site);
    if (result.success) {
      setAuthed(true);
      setAuthSite(site);
      onAuthChange?.({ authenticated: true, email, site });
    } else {
      setAuthError(result.error ?? "Authentication failed");
    }
  };

  const handleLogout = async () => {
    await jiraLogout();
    setAuthed(false);
    setData(null);
    setAuthSite("");
    onAuthChange?.({ authenticated: false });
  };

  const handleCrawl = async (force = false) => {
    if (crawling) { await stopJiraCrawl(); return; }
    if (!force && data?.meta && filterSince >= data.meta.since && filterUntil <= data.meta.until) {
      setLogs(["All data already available for this range."]);
      setLogsOpen(true);
      setCrawlProgress(null);
      return;
    }
    setLogs([]);
    setLogsOpen(true);
    setCrawling(true);
    setCrawlProgress({ current: 0, total: 0 });
    await startJiraCrawl({ since: filterSince, until: filterUntil });
  };

  const prevCrawlRequested = useRef(crawlRequested);
  useEffect(() => {
    if (crawlRequested > 0 && crawlRequested !== prevCrawlRequested.current && authed && !crawling) {
      const delta = crawlRequested - prevCrawlRequested.current;
      prevCrawlRequested.current = crawlRequested;
      handleCrawl(delta >= 1000);
    }
  }, [crawlRequested]);

  if (!authChecked) return null;

  if (!authed) {
    return (
      <Container size="xs" py="xl">
        <Stack gap="md" mt="xl">
          <Title order={2}>Connect to Atlassian</Title>
          <Text size="xs" c="dimmed">Used for both Jira and Confluence.</Text>
          <Text size="sm" fw={600}>How to create an API token:</Text>
          <Text size="xs" c="dimmed" component="div">
            <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
              <li>Go to <b><Anchor href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" size="xs">id.atlassian.com → Security → API tokens</Anchor></b></li>
              <li>Click <b>"Create API token"</b></li>
              <li>Name it <b>BragBot</b></li>
              <li>Copy the token value</li>
            </ol>
          </Text>
          <TextInput label="Atlassian Site" placeholder="yourcompany.atlassian.net" size="sm" value={site} onChange={(e) => setSite(e.currentTarget.value)} />
          <TextInput label="Email" placeholder="you@company.com" size="sm" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
          <TextInput label="API Token" type="password" size="sm" value={token} onChange={(e) => setToken(e.currentTarget.value)} />
          {authError && <Text c="red" size="sm">{authError}</Text>}
          <Button className="hover-outline" mt="xl" onClick={handleAuth} disabled={!email || !token || !site}>Connect</Button>
          {envInfo && (
            <Button
              variant="subtle"
              color={envInfo.available ? "green" : "gray"}
              className="hover-gray-outline-green-text"
              size="sm"
              disabled={!envInfo.available}
              onClick={async () => {
                const result = await loginWithJiraEnv();
                if (result.success) {
                  setAuthed(true);
                  setAuthSite(envInfo.site ?? "");
                  onAuthChange?.({ authenticated: true, email: envInfo.email, site: envInfo.site });
                  getJiraData().then((d) => d && setData(d));
                } else {
                  setAuthError(result.error ?? "Failed");
                }
              }}
            >
              {envInfo.available
                ? `Use environment variables (${envInfo.email} @ ${envInfo.site})`
                : "No JIRA_SITE / JIRA_EMAIL / JIRA_API_TOKEN env vars found"}
            </Button>
          )}
        </Stack>
      </Container>
    );
  }

  // Compute stats
  const issues = data?.issues ?? [];
  const filtered = issues.filter((i) => i.updated >= filterSince && i.updated <= filterUntil + "T23:59:59Z");
  const totals = computeTotals(filtered);
  const weekly = computeWeeklyVelocity(filtered, filterSince, filterUntil);
  const cycleTimeTrend = computeCycleTimeTrend(filtered);
  const byType = computeByType(filtered);
  const byPriority = computeByPriority(filtered);
  const timeInStatus = computeTimeInStatus(filtered);
  const scatter = computePointsVsCycleTime(filtered);
  const dayOfWeek = computeDayOfWeek(filtered);

  const days = Math.round((new Date(filterUntil).getTime() - new Date(filterSince).getTime()) / 86400000);
  const isRecent = Math.abs(Date.now() - new Date(filterUntil).getTime()) < 3 * 86400000;
  const periodLabel = days < 45 ? `${days} days` : days < 360 ? `${Math.round(days / 30)} months` : `${(days / 365).toFixed(1)} years`;

  return (<>

      {data?.meta && (filterSince < data.meta.since || filterUntil > data.meta.until) && (() => {
        const missingDays = Math.max(0, Math.floor((new Date(data.meta.since).getTime() - new Date(filterSince).getTime()) / 86400000))
          + Math.max(0, Math.floor((new Date(filterUntil).getTime() - new Date(data.meta.until).getTime()) / 86400000));
        return (
          <Paper p="xs" radius="sm" mt="sm" bg="rgba(255, 107, 107, 0.1)" style={{ border: "1px solid rgba(255, 107, 107, 0.3)" }}>
            <Text size="sm" c="#ff6b6b">
              ⚠ {missingDays} day{missingDays !== 1 ? "s" : ""} missing — you have {data.meta.since} → {data.meta.until}, but filtering on {filterSince} → {filterUntil}. Hit Refresh to crawl the missing range.
            </Text>
          </Paper>
        );
      })()}

      {(logs.length > 0 || logsOpen) && (
        <>
          <Group justify="center" mt="sm">
            <Button size="xs" variant="subtle" color="gray" className="hover-gray-outline-blue-text" onClick={() => setLogsOpen((o) => !o)}>
              {logsOpen ? "Hide Logs" : "Show Logs"}
            </Button>
          </Group>
          <Collapse in={logsOpen}>
            {crawlProgress && (
              <Stack gap={4} mt="xs">
                <Progress value={crawlProgress.total ? (crawlProgress.current / crawlProgress.total) * 100 : 100} size="sm" radius="xl" animated />
                <Text size="xs" c="dimmed" ta="center">{crawlProgress.total ? `Fetching issues: ${crawlProgress.current}/${crawlProgress.total}` : crawlProgress.current ? `Fetched ${crawlProgress.current} issues` : "Starting..."}</Text>
              </Stack>
            )}
            <Paper p="xs" radius="md" withBorder mt="xs">
              <LogPanel logs={logs} />
            </Paper>
          </Collapse>
        </>
      )}

      {filtered.length === 0 && !crawling ? (
        <Text c="dimmed" ta="center" mt="xl">No Jira data yet. Click <Text span fw={700} c="#339af0">Refresh</Text> to crawl.</Text>
      ) : (<>
        <Text c="dimmed" size="sm" ta="center" mt="lg" mb={-8}>
          {isRecent ? `Last ${periodLabel}` : `${periodLabel} (${filterSince} → ${filterUntil})`}
        </Text>

        <SimpleGrid cols={{ base: 2, sm: 4 }} mt="lg">
          <StatCard label="Issues Completed" value={totals.completed} />
          <StatCard label="Story Points" value={totals.storyPoints} />
          <StatCard label="Issues Created" value={totals.created} />
          <StatCard label="Comments" value={totals.comments} />
          <StatCard label="Avg Cycle Time" value={`${totals.avgCycleTimeDays.toFixed(1)}d`} />
        </SimpleGrid>

        {/* Velocity */}
        {weekly.length > 0 && (
          <Section title="Weekly Velocity">
            <Paper p="md" radius="md" withBorder>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={weekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="week" stroke="#aaa" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#aaa" />
                  <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} />
                  <Bar dataKey="completed" fill="#339af0" name="Issues" />
                  <Bar dataKey="points" fill="#51cf66" name="Points" />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Section>
        )}

        {/* Cycle Time Trend */}
        {cycleTimeTrend.length > 0 && (
          <Section title="Cycle Time Trend">
            <Paper p="md" radius="md" withBorder>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={cycleTimeTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="week" stroke="#aaa" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#aaa" unit="d" />
                  <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} />
                  <Line type="monotone" dataKey="avgDays" stroke="#fcc419" name="Avg Days" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          </Section>
        )}

        {/* Breakdowns */}
        <SimpleGrid cols={{ base: 1, sm: 2 }} mt="xl">
          {byType.length > 0 && (
            <Section title="By Type">
              <Paper p="md" radius="md" withBorder>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={byType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} labelLine={false}
                      label={({ name, value, percent }) => percent > 0.05 ? `${name}: ${value}` : ""}>
                      {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Section>
          )}
          {byPriority.length > 0 && (
            <Section title="By Priority">
              <Paper p="md" radius="md" withBorder>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={byPriority} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} labelLine={false}
                      label={({ name, value, percent }) => percent > 0.05 ? `${name}: ${value}` : ""}>
                      {byPriority.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Section>
          )}
        </SimpleGrid>

        {/* Time in Status */}
        {timeInStatus.length > 0 && (
          <Section title="Avg Time in Status">
            <Paper p="md" radius="md" withBorder>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={timeInStatus} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis type="number" stroke="#aaa" unit="h" />
                  <YAxis type="category" dataKey="status" stroke="#aaa" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} />
                  <Bar dataKey="avgHours" fill="#cc5de8" name="Avg Hours" />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Section>
        )}

        {/* Day of Week */}
        {dayOfWeek.some((d) => d.count > 0) && (
          <Section title="Completions by Day of Week">
            <Paper p="md" radius="md" withBorder>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dayOfWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="day" stroke="#aaa" />
                  <YAxis stroke="#aaa" />
                  <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} />
                  <Bar dataKey="count" fill="#20c997" name="Completed" />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Section>
        )}
      </>)}

      {data?.meta && (
        <Group justify="center" mt="xl" mb="md" gap="xs">
          <Text c="dimmed" size="sm">
            Data crawled {data.meta.crawled_at.split("T")[0]}
          </Text>
          <Text c="dimmed" size="sm">·</Text>
          <Text c="dimmed" size="sm">{authSite}</Text>
          <Text c="dimmed" size="sm">·</Text>
          <Button size="xs" variant="subtle" color="gray" onClick={handleLogout}>Sign out</Button>
        </Group>
      )}
  </>);
}
