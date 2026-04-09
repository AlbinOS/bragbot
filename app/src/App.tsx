import { useEffect, useState, useRef, useCallback } from "react";
import {
  MantineProvider,
  Container,
  Title,
  Text,
  SimpleGrid,
  Paper,
  Group,
  Stack,
  Table,
  Badge,
  Loader,
  Center,
  Button,
  ScrollArea,
  Collapse,
  Popover,
  TextInput,
  Select,
  Tooltip as MTooltip,
  Anchor,
  Progress,
} from "@mantine/core";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
  AreaChart,
  Area,
  LineChart,
  Line,
} from "recharts";
import type { Meta, RepoData } from "./types";
import { loadMeta, loadAllRepos, startCrawl, stopCrawl, getCrawlStatus, onCrawlLog, onCrawlRepoComplete, onCrawlDone, onCrawlProgress, getAuthStatus, startDeviceFlow, onAuthComplete, onAuthExpired, logout, loginWithPat, getOrgs, detectGhCli, loginWithGhCli, exportAIContext, getContextFiles, checkForUpdate, downloadUpdate, applyUpdate, getLocalInfo, writeClipboard, getReviewSignatures, onUpdaterStatus } from "./data";

// Mantine 7.x CSS — loaded by electrobun bundler
import "@mantine/core/styles.css";
import {
  computeTotals,
  computeWeekly,
  computeMonthly,
  computeRepoSummaries,
  computeSizeBuckets,
  computeMergeTime,
  computeTopReviewers,
  computeDayOfWeek,
  computeReviewTurnaround,
  computeReviewStyle,
  computeReviewCommentTags,
  computeReviewEmojis,
  computeMergeTimeTrend,
  computeSizeVsMerge,
  computeWorkCategories,
  setReviewSignatures,
  computeReceivedEmojis,
  computeReceivedCommentTags,
} from "./stats";

import { generateAIContext } from "./exportAIContext";
import { SizeVsMergeChart } from "./SizeVsMergeChart";
import JiraDashboard from "./jira/JiraDashboard";
import ConfluenceDashboard from "./confluence/ConfluenceDashboard";
import { getJiraData as loadJiraData } from "./jira/data";
import { getConfluenceData as loadConfluenceData } from "./confluence/data";
import { buildConfluenceDerived } from "./confluence/exportConfluence";
import { StatCard, Section, LogPanel } from "./shared/components";

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

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"github" | "jira" | "confluence">("github");
  const [jiraCrawlRequested, setJiraCrawlRequested] = useState(0);
  const [confluenceCrawlRequested, setConfluenceCrawlRequested] = useState(0);
  const [jiraAuth, setJiraAuth] = useState<{ authenticated: boolean; email?: string; site?: string }>({ authenticated: false });
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking
  const [authUser, setAuthUser] = useState<string>("");
  const [deviceCode, setDeviceCode] = useState<{ user_code: string; verification_uri: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPat, setShowPat] = useState(false);
  const [pat, setPat] = useState("");
  const [patError, setPatError] = useState("");
  const [ghCli, setGhCli] = useState<{ available: boolean; user?: string; reason?: string } | null>(null);
  const [org, setOrg] = useState<string>("");
  const [orgs, setOrgs] = useState<string[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [repos, setRepos] = useState<RepoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState<{ current: number; total: number } | null>(null);
  const [filterSince, setFilterSince] = useState<string>("");
  const [filterUntil, setFilterUntil] = useState<string>("");
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenersRegistered = useRef(false);

  const reloadData = useCallback(async () => {
    try {
      const m = await loadMeta();
      if (m && !("error" in m)) {
        setMeta(m);
        setFilterSince((prev) => prev || m.since);
        setFilterUntil((prev) => prev || m.until);
        setOrg((prev) => prev || m.org);
        const r = await loadAllRepos();
        setRepos(Array.isArray(r) ? r : []);
      } else {
        setMeta(null);
        setRepos([]);
      }
    } catch {
      setMeta(null);
      setRepos([]);
    }
  }, []);

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [updateVersion, setUpdateVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [updateCheckMsg, setUpdateCheckMsg] = useState("");
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    const doUpdateCheck = () => checkForUpdate().then((r) => {
      if (r?.updateAvailable) {
        setUpdateAvailable(true);
        setUpdateVersion(r.version || "");
      }
    });
    getLocalInfo().then((info) => setAppVersion(info.version));
    doUpdateCheck();
    const interval = setInterval(doUpdateCheck, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    getReviewSignatures().then(setReviewSignatures);
    getAuthStatus().then((s) => {
      setAuthed(s.authenticated);
      if (s.user) setAuthUser(s.user);
      if (s.authenticated) {
        getOrgs().then(setOrgs);
        reloadData().then(() => setLoading(false));
        getCrawlStatus().then((st) => setCrawling(st.running));
      } else {
        setLoading(false);
        detectGhCli().then(setGhCli);
      }
    });
  }, [reloadData]);

  useEffect(() => {
    if (listenersRegistered.current) return;
    listenersRegistered.current = true;

    onCrawlLog((msg) => {
      setLogs((prev) => [...prev.slice(-2000), msg]);
    });
    onCrawlRepoComplete(() => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => reloadData(), 2000);
    });
    onCrawlProgress((current, total) => setCrawlProgress({ current, total }));
    onCrawlDone((result) => {
      setCrawling(false);
      setCrawlProgress(null);
      reloadData();
      if (!result.success) {
        setLogs((prev) => [...prev, result.error ?? "Unknown error"]);
      }
    });
    onAuthComplete((result) => {
      if (result.success) {
        setAuthed(true);
        setAuthUser(result.user ?? "");
        setDeviceCode(null);
        getOrgs().then(setOrgs);
        reloadData().then(() => setLoading(false));
      } else {
        setDeviceCode(null);
      }
    });
    onAuthExpired(() => {
      setAuthed(false);
      setAuthUser("");
      setCrawling(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCrawl = async (force = false) => {
    if (activeTab === "jira") {
      setJiraCrawlRequested((n) => n + (force ? 1000 : 1));
      return;
    }
    if (activeTab === "confluence") {
      setConfluenceCrawlRequested((n) => n + (force ? 1000 : 1));
      return;
    }
    if (crawling) {
      await stopCrawl();
      return;
    }

    if (!force && meta && filterSince >= meta.since && filterUntil <= meta.until) {
      setLogs(["All data already available for this range."]);
      setLogsOpen(true);
      setCrawlProgress(null);
      return;
    }

    setLogs([]);
    setLogsOpen(true);
    setCrawling(true);
    setCrawlProgress({ current: 0, total: 0 });
    await startCrawl({ org, since: filterSince, until: filterUntil, force });
  };

  const handleLogin = async () => {
    const flow = await startDeviceFlow();
    setDeviceCode(flow);
    window.open(flow.verification_uri, "_blank");
  };

  const handleLogout = async () => {
    await logout();
    setAuthed(false);
    setAuthUser("");
    setMeta(null);
    setRepos([]);
    detectGhCli().then(setGhCli);
  };

  if (loading && authed === null) {
    return (
      <MantineProvider defaultColorScheme="dark">
        <Center h="100vh"><Loader size="lg" /></Center>
      </MantineProvider>
    );
  }

  if (!authed) {
    return (
      <MantineProvider defaultColorScheme="dark">
        <Container size="xs" py="xl">
          <Stack align="center" gap="lg" mt={100}>
            <Title order={1}>BragBot</Title>
            <Text c="dimmed" ta="center">Sign in with GitHub to get started.</Text>
            {deviceCode ? (
              <Paper p="lg" radius="md" withBorder>
                <Stack align="center" gap="sm">
                  <Text size="sm">Enter this code on GitHub:</Text>
                  <Group gap="xs">
                    <Title order={2} style={{ letterSpacing: 4, fontFamily: "monospace" }}>{deviceCode.user_code}</Title>
                    <Button size="xs" variant="subtle" color={copied ? "green" : "gray"} onClick={() => {
                      navigator.clipboard.writeText(deviceCode.user_code);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }} style={{ fontSize: 18, padding: "0 4px", minWidth: 0 }}>
                      {copied ? "✓" : "📋"}
                    </Button>
                  </Group>
                  <Button variant="light" onClick={() => window.open(deviceCode.verification_uri, "_blank")}>
                    Open GitHub
                  </Button>
                  <Text size="xs" c="dimmed">Waiting for authorization...</Text>
                  <Loader size="sm" />
                </Stack>
              </Paper>
            ) : showPat ? (
              <Paper p="lg" radius="md" withBorder style={{ width: "100%" }}>
                <Stack gap="sm">
                  <Text size="sm" fw={600}>How to create a Personal Access Token:</Text>
                  <Text size="xs" c="dimmed" component="div">
                    <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                      <li>Go to <b>GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)</b></li>
                      <li>Click <b>"Generate new token (classic)"</b></li>
                      <li>Name it <b>BragBot</b>, set an expiration</li>
                      <li>Check scopes: <b>repo</b> and <b>read:org</b></li>
                      <li>Click <b>"Generate token"</b> and copy the <code>ghp_...</code> value</li>
                    </ol>
                  </Text>
                  <Paper p="xs" radius="sm" bg="rgba(252, 196, 25, 0.1)" style={{ border: "1px solid rgba(252, 196, 25, 0.3)" }}>
                    <Text size="xs" c="#fcc419">
                      ⚠ If your org uses SSO, click <b>"Configure SSO"</b> next to the token and authorize it for your organization.
                    </Text>
                  </Paper>
                  <TextInput
                    placeholder="ghp_..."
                    value={pat}
                    onChange={(e) => { setPat(e.currentTarget.value); setPatError(""); }}
                    error={patError}
                  />
                  <Group justify="space-between">
                    <Button variant="subtle" color="gray" size="xs" onClick={() => { setShowPat(false); setPatError(""); }}>Back</Button>
                    <Button size="sm" onClick={async () => {
                      const res = await loginWithPat(pat.trim());
                      if (res.success) {
                        setAuthed(true);
                        setAuthUser(res.user ?? "");
                        getOrgs().then(setOrgs);
                        reloadData().then(() => setLoading(false));
                      } else {
                        setPatError(res.error ?? "Invalid token");
                      }
                    }}>Connect</Button>
                  </Group>
                  <Button variant="subtle" size="xs" onClick={() => window.open("https://github.com/settings/tokens/new?scopes=repo,read:org&description=BragBot", "_blank")}>
                    Open GitHub token page →
                  </Button>
                </Stack>
              </Paper>
            ) : (
              <Stack align="center" gap="sm">
                {ghCli?.available && (
                  <Button
                    size="lg"
                    color="green"
                    className="hover-outline"
                    onClick={async () => {
                      const result = await loginWithGhCli();
                      if (result.success) {
                        setAuthed(true);
                        if (result.user) setAuthUser(result.user);
                        getOrgs().then(setOrgs);
                        reloadData().then(() => setLoading(false));
                      }
                    }}
                  >
                    Continue as {ghCli.user}
                  </Button>
                )}
                {ghCli?.available && <Text size="xs" c="dimmed">via GitHub CLI</Text>}
                {ghCli?.available && <Text size="xs" c="dimmed" mt="xs">— or —</Text>}
                <Button size={ghCli?.available ? "xs" : "lg"} variant={ghCli?.available ? "subtle" : "filled"} color={ghCli?.available ? "gray" : "blue"} className={ghCli?.available ? "hover-gray-outline-blue-text" : "hover-outline"} onClick={() => setShowPat(true)}>Sign in with a Personal Access Token</Button>
                {!ghCli?.available && (<>
                  <Text size="xs" c="dimmed" mt="xs">— or —</Text>
                  <Text size="xs" c="dimmed">💡 Install <Anchor href="https://cli.github.com" target="_blank" size="xs">gh CLI</Anchor> for one-click sign in</Text>
                </>)}
              </Stack>
            )}
          </Stack>
        </Container>
      </MantineProvider>
    );
  }

  if (loading) {
    return (
      <MantineProvider defaultColorScheme="dark">
        <Center h="100vh"><Loader size="lg" /></Center>
      </MantineProvider>
    );
  }

  const hasData = meta && repos.length > 0;

  // Default date range to last 6 months if not set
  const today = new Date().toISOString().split("T")[0];
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0];
  if (!filterSince) setFilterSince(sixMonthsAgo);
  if (!filterUntil) setFilterUntil(today);

  // Filter repos by date range
  const filteredRepos = hasData ? repos.map((r) => ({
    ...r,
    authored_prs: r.authored_prs.filter((pr) => pr.created_at >= filterSince && pr.created_at <= filterUntil + "T23:59:59Z"),
    reviewed_prs: r.reviewed_prs.filter((pr) => pr.created_at >= filterSince && pr.created_at <= filterUntil + "T23:59:59Z"),
  })).filter((r) => r.authored_prs.length > 0 || r.reviewed_prs.length > 0) : [];

  const totals = hasData ? computeTotals(filteredRepos) : null;
  const weekly = hasData ? computeWeekly(filteredRepos, filterSince, filterUntil) : [];
  const monthly = hasData ? computeMonthly(filteredRepos, filterSince, filterUntil) : [];
  const repoSummaries = hasData ? computeRepoSummaries(filteredRepos) : [];
  const sizeBuckets = hasData ? computeSizeBuckets(filteredRepos) : [];
  const mergeTime = hasData ? computeMergeTime(filteredRepos) : null;
  const topReviewers = hasData ? computeTopReviewers(filteredRepos, meta.user) : [];
  const workCategories = hasData ? computeWorkCategories(filteredRepos) : [];
  const dayOfWeek = hasData ? computeDayOfWeek(filteredRepos) : [];
  const reviewTurnaround = hasData ? computeReviewTurnaround(filteredRepos, meta.user) : [];
  const reviewStyle = hasData ? computeReviewStyle(filteredRepos) : null;
  const reviewTags = hasData ? computeReviewCommentTags(filteredRepos) : [];
  const receivedTags = hasData ? computeReceivedCommentTags(filteredRepos) : [];
  const reviewEmojis = hasData ? computeReviewEmojis(filteredRepos) : [];
  const receivedEmojis = hasData ? computeReceivedEmojis(filteredRepos) : [];
  const mergeTimeTrend = hasData ? computeMergeTimeTrend(filteredRepos) : [];
  const sizeVsMerge = hasData ? computeSizeVsMerge(filteredRepos) : [];

  if (!hasData) {
    return (
      <MantineProvider defaultColorScheme="dark">
        <Container size="sm" py="xl">
          <Stack align="center" gap="lg" mt={100}>
            <Title order={1}>BragBot</Title>
            {appVersion && <Text size="xs" c="dimmed">v{appVersion}</Text>}
            <Text c="dimmed" ta="center">No data found. Pick an organization and date range to start.</Text>
            <Select
              label="Organization"
              placeholder="Select an org"
              data={orgs}
              value={org}
              onChange={(v) => setOrg(v ?? "")}
              searchable
              allowDeselect={false}
              size="sm"
              style={{ width: 300 }}
            />
            <Group gap="sm">
              <TextInput label="From" type="date" size="sm" value={filterSince} onChange={(e) => setFilterSince(e.currentTarget.value)} />
              <TextInput label="To" type="date" size="sm" value={filterUntil} onChange={(e) => setFilterUntil(e.currentTarget.value)} />
            </Group>
            <Group gap="xs">
              {[1, 3, 6, 12].map((m) => (
                <Button key={m} size="xs" variant="subtle" color="gray" onClick={() => {
                  setFilterUntil(new Date().toISOString().split("T")[0]);
                  setFilterSince(new Date(Date.now() - m * 30 * 86400000).toISOString().split("T")[0]);
                }}>Last {m}mo</Button>
              ))}
            </Group>
            {filterSince && filterUntil && (
              <Text size="sm" c="dimmed">{Math.max(0, Math.round((new Date(filterUntil).getTime() - new Date(filterSince).getTime()) / 86400000))} days</Text>
            )}
            <Button
              size="lg"
              className="hover-outline"
              color={crawling ? "red" : "blue"}
              disabled={!org && !crawling}
              onClick={() => handleCrawl(false)}
            >
              {crawling ? "⏹ Stop" : "Start Crawling"}
            </Button>
            <Collapse in={(logsOpen || logs.length > 0) && activeTab === "github"} style={{ width: "100%" }}>
              {crawlProgress && (
                <Stack gap={4} w="100%">
                  <Progress value={crawlProgress.total ? (crawlProgress.current / crawlProgress.total) * 100 : 100} size="sm" radius="xl" animated />
                  <Text size="xs" c="dimmed" ta="center">{crawlProgress.total ? `Enriching PRs: ${crawlProgress.current}/${crawlProgress.total} (${Math.round((crawlProgress.current / crawlProgress.total) * 100)}%)` : "Starting..."}</Text>
                </Stack>
              )}
              <Paper p="xs" radius="md" withBorder mt="sm" style={{ maxHeight: 300, overflow: "hidden" }}>
                <LogPanel logs={logs} height={280} />
              </Paper>
            </Collapse>
            <Button size="xs" variant="subtle" color="gray" onClick={handleLogout}>Sign out</Button>
          </Stack>
        </Container>
      </MantineProvider>
    );
  }

  return (
    <MantineProvider defaultColorScheme="dark">
      <Container size="lg" py="xl">
        {updateAvailable && (
          <Paper p="xs" radius="md" withBorder mb="md" style={{ borderColor: "#339af0" }}>
            <Group justify="space-between">
              <div>
                <Text size="sm">A new version of BragBot is available!{updateVersion && ` (v${updateVersion})`}</Text>
                {updateStatus && <Text size="xs" c="dimmed">{updateStatus}</Text>}
              </div>
              <Button size="xs" variant="filled" color="blue" className="hover-outline" loading={downloading} onClick={async () => {
                if (updateReady) {
                  await applyUpdate();
                } else {
                  setDownloading(true);
                  onUpdaterStatus((entry: any) => {
                    const pct = entry.details?.progress;
                    if (entry.status === "download-complete" || entry.status === "complete") {
                      setDownloading(false);
                      setUpdateStatus("");
                      setUpdateReady(true);
                    } else {
                      setUpdateStatus(pct != null ? `Downloading... ${Math.round(pct)}%` : entry.message);
                    }
                  });
                  await downloadUpdate();
                }
              }}>
                {updateReady ? "Restart to Update" : "Download Update"}
              </Button>
            </Group>
          </Paper>
        )}
        <Group justify="space-between" align="baseline">
          <Group gap="md" align="baseline">
            <Title order={1}>BragBot</Title>
            {appVersion && <MTooltip label="Check for updates" position="bottom" withArrow><Text size="xs" c={updateCheckMsg ? "green" : "dimmed"} style={{ cursor: "pointer" }} onClick={() => {
              checkForUpdate().then((r) => {
                if (r?.updateAvailable) { setUpdateAvailable(true); setUpdateVersion(r.version || ""); }
                else { setUpdateCheckMsg("✓"); setTimeout(() => setUpdateCheckMsg(""), 3000); }
              });
            }}>v{appVersion} {updateCheckMsg}</Text></MTooltip>}
            <Group gap={4}>
              <Button size="xs" variant={activeTab === "github" ? "light" : "subtle"} color={activeTab === "github" ? "blue" : "gray"} onClick={() => setActiveTab("github")}>GitHub</Button>
              <Button size="xs" variant={activeTab === "jira" ? "light" : "subtle"} color={activeTab === "jira" ? "blue" : "gray"} onClick={() => setActiveTab("jira")}>Jira</Button>
              <Button size="xs" variant={activeTab === "confluence" ? "light" : "subtle"} color={activeTab === "confluence" ? "blue" : "gray"} onClick={() => setActiveTab("confluence")}>Confluence</Button>
            </Group>
          </Group>
          <Group gap="sm">
            {activeTab === "github" ? (
              <Group gap="xs">
                <Text c="dimmed">{meta.user} @</Text>
                <MTooltip label="Switch organization" position="bottom" withArrow>
                  <Select
                  data={orgs}
                  value={org || meta.org}
                  onChange={(v) => { if (v) setOrg(v); }}
                  size="xs"
                  variant="unstyled"
                  allowDeselect={false}
                  rightSection={<></>}
                  style={{ width: "auto" }}
                  styles={{ input: { color: "var(--mantine-color-dimmed)", fontWeight: 400, fontSize: "var(--mantine-font-size-md)", padding: 0, height: "auto", minHeight: "unset", cursor: "pointer" } }}
                  className="org-select"
                />
                </MTooltip>
              </Group>
            ) : (jiraAuth.authenticated && (activeTab === "jira" || activeTab === "confluence")) ? (
              <Text c="dimmed">{jiraAuth.email} @ {jiraAuth.site}</Text>
            ) : null}
            <Popover width={280} position="bottom-end" shadow="md">
            <MTooltip label="Click to change date range" position="bottom" withArrow>
              <Popover.Target>
                <Button size="xs" variant="subtle" color="gray" className="hover-gray-outline-blue-text">
                  {filterSince} → {filterUntil}
                </Button>
              </Popover.Target>
            </MTooltip>
              <Popover.Dropdown>
                <Stack gap="xs">
                  <TextInput label="From" type="date" size="xs" value={filterSince} onChange={(e) => setFilterSince(e.currentTarget.value)} />
                  <TextInput label="To" type="date" size="xs" value={filterUntil} onChange={(e) => setFilterUntil(e.currentTarget.value)} />
                  <Text size="xs" c="dimmed">Data available: {meta.since} → {meta.until}</Text>
                  <Group gap="xs">
                    {[1, 3, 6, 12].map((m) => (
                      <Button key={m} size="compact-xs" variant="subtle" color="gray" onClick={() => {
                        setFilterUntil(new Date().toISOString().split("T")[0]);
                        setFilterSince(new Date(Date.now() - m * 30 * 86400000).toISOString().split("T")[0]);
                      }}>Last {m}mo</Button>
                    ))}
                  </Group>
                </Stack>
              </Popover.Dropdown>
            </Popover>
            <MTooltip label={crawling ? "Stop the current crawl" : "Fetch new data for the selected range"} position="bottom" withArrow>
              <Button size="xs" variant={crawling ? "light" : "filled"} color={crawling ? "red" : "blue"} onClick={() => handleCrawl(false)} className="hover-outline">
                {crawling ? "⏹ Stop" : "Refresh"}
              </Button>
            </MTooltip>
            {!crawling && (
              <MTooltip label="Re-crawl all data from scratch, ignoring cache" position="bottom" withArrow>
                <Button size="xs" variant="subtle" color="gray" onClick={() => handleCrawl(true)} className="hover-gray-outline-blue-text">
                  Force
                </Button>
              </MTooltip>
            )}
            <MTooltip label="Generate metrics from crawled data and copy a brag-sheet prompt to clipboard" position="bottom" withArrow>
              <Button size="xs" variant="subtle" color={copyFeedback ? "green" : "gray"} className="hover-gray-outline-blue-text" onClick={async () => {
                const jiraData = await loadJiraData();
                const confluenceData = await loadConfluenceData();
                if (!hasData) {
                  setLogs([`No GitHub data yet — starting crawl. Click Export again when done.`]);
                  setLogsOpen(true);
                  handleCrawl(false);
                  return;
                }
                const { markdown, metrics, initiatives, notable_singletons, role_alignment } = generateAIContext(meta.user, org, filterSince, filterUntil, filteredRepos, jiraData);
                const result = await exportAIContext(markdown);
                await exportAIContext(JSON.stringify(metrics, null, 2), result.path.replace("ai-context.md", "derived-metrics.json"));
                await exportAIContext(JSON.stringify({ initiatives, notable_singletons, role_alignment }, null, 2), result.path.replace("ai-context.md", "initiatives.json"));

                const confluenceDerived = confluenceData?.pages?.length ? buildConfluenceDerived(confluenceData, initiatives) : null;
                if (confluenceDerived) {
                  await exportAIContext(JSON.stringify(confluenceDerived, null, 2), result.path.replace("ai-context.md", "confluence-derived.json"));
                }

                // Create context dir with README on first export
                const contextDir = result.path.replace("/ai-context.md", "/context");
                await exportAIContext(`# Context Files

Drop optional files here to enrich your brag sheet.

## Supported files

### role.md
Your current role description from your company's engineering ladder.
The AI will align accomplishments to role expectations.

### role_target.md
The next role you're targeting (e.g. Senior II, Staff).
The AI will identify promotion signals in your work.

### goals.md
Your annual goals, OKRs, or roadmap commitments.
The AI will map your activity to these expectations.

### notes.md
Impact notes the data can't show — outcomes, business context, invisible work.
Example entries:

- "The API migration unblocked Team X's Q1 deadline"
- "Reduced incident rate by 40% after the connection pool fix"
- "Mentored 2 new hires through their first PRs"
- "Led the design review for the background job architecture"
`, contextDir + "/README.md");

                // Write bundle README
                await exportAIContext(`# BragBot Export Bundle

## Files

| File | Description |
|------|-------------|
| \`derived-metrics.json\` | Pre-computed metrics (authoritative numbers) |
| \`initiatives.json\` | Initiative clusters, notable singletons, and role alignment |
| \`ai-context.md\` | Full PR/Jira evidence with derived metrics summary |
| \`confluence-derived.json\` | Confluence threads, linked initiatives, role signals (if connected) |

## Context (optional, user-provided)

| File | Description |
|------|-------------|
| \`context/role.md\` | Current role description from engineering ladder |
| \`context/role_target.md\` | Target role for promotion signal analysis |
| \`context/goals.md\` | Annual goals, OKRs, or roadmap commitments |
| \`context/notes.md\` | Impact notes the data can't show (outcomes, business context) |

See \`context/README.md\` for details on what to put in each file.

## Usage

Paste the prompt from the app's "Export for AI" button into your AI tool, or point it at this directory.
`, result.path.replace("ai-context.md", "README.md"));

                if (result.ok) {
                  const metricsPath = result.path.replace("ai-context.md", "derived-metrics.json");
                  const initiativesPath = result.path.replace("ai-context.md", "initiatives.json");
                  const ctx = await getContextFiles();

                  const contextLines: string[] = [];
                  if (ctx.found.includes("role.md")) contextLines.push(`- Read ${ctx.dir}/role.md and align accomplishments to role expectations.`);
                  if (ctx.found.includes("role_target.md")) contextLines.push(`- Read ${ctx.dir}/role_target.md and identify promotion signals toward the next role.`);
                  if (ctx.found.includes("goals.md")) contextLines.push(`- Read ${ctx.dir}/goals.md and map activity to stated goals/OKRs.`);
                  if (ctx.found.includes("notes.md")) contextLines.push(`- Read ${ctx.dir}/notes.md for outcome/impact context the data can't show.`);
                  if (ctx.found.length === 0) contextLines.push(`- No context files found. Optionally add role.md, role_target.md, goals.md, or notes.md to ${ctx.dir}/ (see README.md there).`);

                  const confluencePath = confluenceDerived ? result.path.replace("ai-context.md", "confluence-derived.json") : null;
                  const confluenceSource = confluencePath ? `\n4. ${confluencePath} — Confluence threads with linked initiatives, role signals (covers ${confluenceDerived!.coverage.since} to ${confluenceDerived!.coverage.until})` : "";

                  const prompt = `You are helping a Senior Software Engineer prepare an evidence-based brag sheet.

Primary sources (read in this order):
1. ${metricsPath} — pre-computed metrics, quote from here
2. ${initiativesPath} — initiatives, notable singletons, and auto-detected role alignment
3. ${result.path} — full PR/Jira evidence${confluenceSource}

Rules:
- Treat derived metrics as authoritative; do not re-derive from raw data.
- Use initiatives as the primary unit for accomplishment bullets, not individual PRs.
- Prefer outcomes, scope, ownership, and collaboration over raw activity.
- Lines changed and story points are secondary/supporting metrics only.
- Distinguish observed facts from reasonable inference. If evidence is weak, say so.
- Use the role_alignment section to map accomplishments to ladder categories; do not invent categories.
- Do not clone repos unless extracted evidence is insufficient for top initiatives.
- Do not say "led", "owned", "zero incidents", "reduced", "improved", or "mentored" unless directly supported by evidence or explicitly marked as inference.
- Do not use open or draft PRs as evidence of delivery — only merged PRs count as shipped.
- Every accomplishment bullet must cite supporting initiative IDs or PR numbers.${confluenceDerived ? `
- Use Confluence evidence to support claims about design leadership, documentation, architecture, technical community influence, and process improvement.
- Prefer official-space pages over personal-space drafts. Collapse related pages into one documentation thread (already done in the data).
- Do not treat a Confluence page title alone as proof that a design shipped or was accepted.
- Only use Confluence to reinforce accomplishment bullets when linked to shipped initiatives or merged PRs.
- Use comment_count and comments_given as engagement signals, not outcome metrics.
- Confluence coverage is ${confluenceDerived.coverage.since} to ${confluenceDerived.coverage.until} — do not assume absence of documentation outside this window.` : ""}
${contextLines.join("\n")}

Produce:
1. 6-8 accomplishment bullets in review-ready language
2. Major initiatives grouped by theme
3. Key metrics with short interpretation
4. Collaboration and mentorship signals
5. Design, documentation, and technical influence (if Confluence data present)
6. Growth areas / focus shifts
7. Missing context / uncertain claims`;
                  try {
                    await writeClipboard(prompt);
                    setCopyFeedback(true);
                  } catch {
                    setCopyFeedback(false);
                  }
                  setTimeout(() => setCopyFeedback(false), 3000);
                }
              }}>
                Brag Prompt {copyFeedback ? "✓" : "📋"}
              </Button>
            </MTooltip>
          </Group>
        </Group>

        <div style={{ display: activeTab === "jira" ? "block" : "none" }}>
          <JiraDashboard filterSince={filterSince} filterUntil={filterUntil} crawlRequested={jiraCrawlRequested} onAuthChange={setJiraAuth} />
        </div>
        <div style={{ display: activeTab === "confluence" ? "block" : "none" }}>
          <ConfluenceDashboard filterSince={filterSince} filterUntil={filterUntil} crawlRequested={confluenceCrawlRequested} atlassianAuthed={jiraAuth.authenticated} />
        </div>
        {activeTab === "github" && (<>

        {(filterSince < meta.since || filterUntil > meta.until) && (() => {
          const missingDays = Math.max(0, Math.floor((new Date(meta.since).getTime() - new Date(filterSince).getTime()) / 86400000))
            + Math.max(0, Math.floor((new Date(filterUntil).getTime() - new Date(meta.until).getTime()) / 86400000));
          return (
            <Paper p="xs" radius="sm" mt="sm" bg="rgba(255, 107, 107, 0.1)" style={{ border: "1px solid rgba(255, 107, 107, 0.3)" }}>
              <Text size="sm" c="#ff6b6b">
                ⚠ {missingDays} day{missingDays !== 1 ? "s" : ""} missing — you have {meta.since} → {meta.until}, but filtering on {filterSince} → {filterUntil}. Hit Refresh to crawl the missing range.
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
                  <Text size="xs" c="dimmed" ta="center">{crawlProgress.total ? `Enriching PRs: ${crawlProgress.current}/${crawlProgress.total} (${Math.round((crawlProgress.current / crawlProgress.total) * 100)}%)` : "Starting..."}</Text>
                </Stack>
              )}
              <Paper p="xs" radius="md" withBorder mt="xs" style={{ maxHeight: 200, overflow: "hidden" }}>
                <LogPanel logs={logs} />
              </Paper>
            </Collapse>
          </>
        )}

        {/* ── Totals ── */}
        {(() => {
          const days = Math.round((new Date(filterUntil).getTime() - new Date(filterSince).getTime()) / 86400000);
          const isRecent = Math.abs(new Date().getTime() - new Date(filterUntil).getTime()) < 3 * 86400000;
          const label = days < 45 ? `${days} days` : days < 360 ? `${Math.round(days / 30)} months` : `${(days / 365).toFixed(1)} years`;
          return <Text c="dimmed" size="sm" ta="center" mt="lg" mb={-8}>{isRecent ? `Last ${label}` : `${label} (${filterSince} → ${filterUntil})`}</Text>;
        })()}
        <SimpleGrid cols={{ base: 2, sm: 4 }} mt="lg">
          <StatCard label="PRs Authored" value={totals!.authored} sub={`${totals!.merged} merged`} />
          <StatCard label="PRs Reviewed" value={totals!.reviewed} />
          <StatCard label="Lines Added" value={`+${totals!.additions.toLocaleString()}`} />
          <StatCard label="Lines Deleted" value={`-${totals!.deletions.toLocaleString()}`} />
          <StatCard label="Net Lines" value={`${totals!.additions - totals!.deletions >= 0 ? "+" : ""}${(totals!.additions - totals!.deletions).toLocaleString()}`} />
          <StatCard label="Files Changed" value={totals!.changedFiles.toLocaleString()} />
          <StatCard label="Approvals Given" value={totals!.approvalsGiven} />
          <StatCard label="Inline Comments" value={totals!.inlineComments} />
        </SimpleGrid>

        {/* ── Weekly Activity ── */}
        <Section title="Weekly Activity">
          <Paper p="md" radius="md" withBorder>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={weekly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} />
                <Area type="monotone" dataKey="authored" stackId="1" stroke="#339af0" fill="#339af0" fillOpacity={0.6} name="Authored" />
                <Area type="monotone" dataKey="reviewed" stackId="1" stroke="#51cf66" fill="#51cf66" fillOpacity={0.6} name="Reviewed" />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        </Section>

        {/* ── Monthly Summary ── */}
        <Section title="Monthly Summary">
          <Paper p="md" radius="md" withBorder>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} />
                <Bar dataKey="authored" fill="#339af0" name="Authored" />
                <Bar dataKey="reviewed" fill="#51cf66" name="Reviewed" />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
          <Paper p="md" radius="md" withBorder>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} />
                <Bar dataKey="additions" fill="#51cf66" name="Additions" />
                <Bar dataKey="deletions" fill="#ff6b6b" name="Deletions" />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Section>

        {/* ── Per Repo ── */}
        <Section title="Per Repository">
          <Paper p="md" radius="md" withBorder>
            <ResponsiveContainer width="100%" height={Math.max(300, repoSummaries.length * 28)}>
              <BarChart data={repoSummaries} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="repo" tick={{ fontSize: 11 }} width={120} />
                <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} />
                <Bar dataKey="authored" fill="#339af0" name="Authored" stackId="a" />
                <Bar dataKey="reviewed" fill="#51cf66" name="Reviewed" stackId="a" />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Section>

        {/* ── PR Size + Work Categories ── */}
        <SimpleGrid cols={{ base: 1, sm: workCategories.length > 0 ? 2 : 1 }} mt="xl">
          <Stack gap="sm">
            <Title order={3}>PR Size Distribution</Title>
            <Paper p="md" radius="md" withBorder>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={sizeBuckets} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, count }) => `${name}: ${count}`} labelLine={false}>
                    {sizeBuckets.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Stack>

          {workCategories.length > 0 && (
            <Stack gap="sm">
              <Title order={3}>Work Categories</Title>
              <Paper p="md" radius="md" withBorder>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={workCategories} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} labelLine={false}
                      label={({ name, count, percent }) => percent > 0.05 ? `${name}: ${count}` : ""}>
                      {workCategories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Stack>
          )}
        </SimpleGrid>

        {/* ── Time to Merge ── */}
        <Stack gap="sm" mt="xl">
          <Title order={3}>Time to Merge</Title>
            <Paper p="md" radius="md" withBorder>
              {mergeTime ? (
                <SimpleGrid cols={2} spacing="md" p="sm">
                  <StatCard label="Median" value={formatHours(mergeTime.median)} />
                  <StatCard label="P90" value={formatHours(mergeTime.p90)} />
                  <StatCard label="Average" value={formatHours(mergeTime.avg)} />
                  <StatCard label="Fastest" value={formatHours(mergeTime.min)} />
                </SimpleGrid>
              ) : <Text c="dimmed">No merged PRs</Text>}
            </Paper>
        </Stack>

        {/* ── Top Reviewers ── */}
        <Section title="Top Reviewers of Your PRs">
          <Paper p="md" radius="md" withBorder>
            <Group gap="xs" wrap="wrap">
              {topReviewers.map((r, i) => (
                <Badge key={r.name} size="lg" variant="light" color={COLORS[i % COLORS.length]}>
                  {r.name}: {r.count}
                </Badge>
              ))}
            </Group>
          </Paper>
        </Section>

        {/* ── Day of Week Activity ── */}
        <Section title="Activity by Day of Week">
          <Paper p="md" radius="md" withBorder>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dayOfWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis dataKey="day" stroke="#aaa" />
                <YAxis stroke="#aaa" />
                <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} />
                <Bar dataKey="authored" fill="#339af0" name="Authored" />
                <Bar dataKey="reviewed" fill="#51cf66" name="Reviewed" />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Section>

        {/* ── Your Review Style ── */}
        {reviewStyle && reviewStyle.totalReviewed > 0 && (
          <Section title="Your Review Style">
            <SimpleGrid cols={{ base: 2, sm: 4 }}>
              <StatCard label="Approval Rate" value={`${reviewStyle.approvalRate}%`} />
              <StatCard label="Changes Requested" value={`${reviewStyle.changesRequestedRate}%`} />
              <StatCard label="Avg Comments / Review" value={reviewStyle.avgCommentsPerReview} />
              <StatCard label="Avg Comment Length" value={`${reviewStyle.avgCommentLength} chars`} />
            </SimpleGrid>
          </Section>
        )}

        {/* ── Review Comment Tags & Emojis ── */}
        {reviewTags.length > 0 && (
          <Section title="Your Review Language">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Paper p="md" radius="md" withBorder>
                <Text size="xs" c="dimmed" mb="sm">Conventional Comments (Given)</Text>
                <ResponsiveContainer width="100%" height={Math.max(200, reviewTags.length * 32)}>
                  <BarChart data={reviewTags} layout="vertical" margin={{ left: 70 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" horizontal={false} />
                    <XAxis type="number" stroke="#aaa" />
                    <YAxis type="category" dataKey="tag" stroke="#aaa" width={70} tick={{ fontSize: 13 }} />
                    <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} />
                    <Bar dataKey="count" fill="#339af0" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
              {receivedTags.length > 0 && (
                <Paper p="md" radius="md" withBorder>
                  <Text size="xs" c="dimmed" mb="sm">Conventional Comments (Received)</Text>
                  <ResponsiveContainer width="100%" height={Math.max(200, receivedTags.length * 32)}>
                    <BarChart data={receivedTags} layout="vertical" margin={{ left: 70 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#444" horizontal={false} />
                      <XAxis type="number" stroke="#aaa" />
                      <YAxis type="category" dataKey="tag" stroke="#aaa" width={70} tick={{ fontSize: 13 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} />
                      <Bar dataKey="count" fill="#51cf66" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              )}
              {reviewEmojis.length > 0 && (
                <Paper p="md" radius="md" withBorder>
                  <Text size="xs" c="dimmed" mb="sm">Review Signatures (Given)</Text>
                  <ResponsiveContainer width="100%" height={Math.max(200, reviewEmojis.length * 32)}>
                    <BarChart data={reviewEmojis} layout="vertical" margin={{ left: 100 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#444" horizontal={false} />
                      <XAxis type="number" stroke="#aaa" />
                      <YAxis type="category" dataKey="emoji" stroke="#aaa" width={100} tick={{ fontSize: 13 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} />
                      <Bar dataKey="count" fill="#fcc419" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              )}
              {receivedEmojis.length > 0 && (
                <Paper p="md" radius="md" withBorder>
                  <Text size="xs" c="dimmed" mb="sm">Review Signatures (Received)</Text>
                  <ResponsiveContainer width="100%" height={Math.max(200, receivedEmojis.length * 32)}>
                    <BarChart data={receivedEmojis} layout="vertical" margin={{ left: 100 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#444" horizontal={false} />
                      <XAxis type="number" stroke="#aaa" />
                      <YAxis type="category" dataKey="emoji" stroke="#aaa" width={100} tick={{ fontSize: 13 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} />
                      <Bar dataKey="count" fill="#51cf66" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              )}
            </SimpleGrid>
          </Section>
        )}

        {/* ── Review Turnaround Time ── */}
        {reviewTurnaround.length > 0 && (
          <Section title="Time to First Review (median hours)">
            <Paper p="md" radius="md" withBorder>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={reviewTurnaround}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="month" stroke="#aaa" />
                  <YAxis stroke="#aaa" />
                  <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} formatter={(v: number) => [`${v}h`, "Median"]} />
                  <Line type="monotone" dataKey="medianHours" stroke="#fcc419" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          </Section>
        )}

        {/* ── Merge Time Trend ── */}
        {mergeTimeTrend.length > 0 && (
          <Section title="Merge Time Trend (median hours)">
            <Paper p="md" radius="md" withBorder>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={mergeTimeTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="month" stroke="#aaa" />
                  <YAxis stroke="#aaa" />
                  <Tooltip contentStyle={{ backgroundColor: "#1a1b1e", border: "1px solid #444" }} formatter={(v: number) => [`${v}h`, "Median"]} />
                  <Line type="monotone" dataKey="medianHours" stroke="#cc5de8" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          </Section>
        )}

        {/* ── PR Size vs Merge Time ── */}
        {sizeVsMerge.length > 0 && (
          <Section title="PR Size vs Time to Merge">
            <SizeVsMergeChart data={sizeVsMerge} />
          </Section>
        )}

        {/* ── Repo Table ── */}
        <Section title="Detailed Repo Breakdown">
          <Paper p="md" radius="md" withBorder style={{ overflowX: "auto" }}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Repository</Table.Th>
                  <Table.Th ta="right">Authored</Table.Th>
                  <Table.Th ta="right">Reviewed</Table.Th>
                  <Table.Th ta="right">Additions</Table.Th>
                  <Table.Th ta="right">Deletions</Table.Th>
                  <Table.Th ta="right">Raw +/-</Table.Th>
                  <Table.Th ta="right">Approvals</Table.Th>
                  <Table.Th ta="right">Comments</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {repoSummaries.map(r => (
                  <Table.Tr key={r.repo}>
                    <Table.Td>{r.repo}</Table.Td>
                    <Table.Td ta="right">{r.authored}</Table.Td>
                    <Table.Td ta="right">{r.reviewed}</Table.Td>
                    <Table.Td ta="right" c="green">+{r.additions.toLocaleString()}</Table.Td>
                    <Table.Td ta="right" c="red">-{r.deletions.toLocaleString()}</Table.Td>
                    <Table.Td ta="right" c="dimmed">
                      {r.rawAdditions !== r.additions || r.rawDeletions !== r.deletions
                        ? `+${r.rawAdditions.toLocaleString()} / -${r.rawDeletions.toLocaleString()}`
                        : "—"}
                    </Table.Td>
                    <Table.Td ta="right">{r.approvals}</Table.Td>
                    <Table.Td ta="right">{r.reviewComments}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        </Section>

        <Group justify="center" mt="xl" mb="md" gap="xs">
          <Text c="dimmed" size="sm">
            Data crawled {meta.crawled_at.split("T")[0]}
          </Text>
          <Text c="dimmed" size="sm">·</Text>
          <Text c="dimmed" size="sm">{meta.org}</Text>
          <Text c="dimmed" size="sm">·</Text>
          <Button size="xs" variant="subtle" color="gray" onClick={handleLogout}>Sign out</Button>
        </Group>
        </>)}
      </Container>
    </MantineProvider>
  );
}
