import fs from "node:fs";
import path from "node:path";
import { jiraSearchAll, getJiraSite, detectStoryPointsFields, getStoryPointsFields } from "./jira";
import type { JiraIssue, JiraTransition, JiraData, JiraMeta } from "../../jira/types";

function parseIssue(raw: any): JiraIssue {
  const fields = raw.fields;
  const transitions: JiraTransition[] = [];

  if (raw.changelog?.histories) {
    for (const h of raw.changelog.histories) {
      for (const item of h.items) {
        if (item.field === "status") {
          transitions.push({
            from: item.fromString,
            to: item.toString,
            timestamp: h.created,
          });
        }
      }
    }
  }
  transitions.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return {
    key: raw.key,
    summary: fields.summary,
    type: fields.issuetype?.name ?? "Unknown",
    priority: fields.priority?.name ?? "None",
    status: fields.status?.name ?? "Unknown",
    created: fields.created,
    updated: fields.updated,
    resolved: fields.resolutiondate ?? null,
    storyPoints: parseStoryPoints(getStoryPointsFields(), fields),
    labels: fields.labels ?? [],
    project: fields.project?.key ?? raw.key.split("-")[0],
    transitions,
    commentCount: fields.comment?.total ?? fields.comment?.comments?.length ?? 0,
  };
}

function parseStoryPoints(fieldIds: string[], fields: any): number | null {
  for (const id of fieldIds) {
    const val = fields[id];
    if (val == null) continue;
    if (typeof val === "number") return val;
    if (typeof val === "string") { const n = parseFloat(val); if (!isNaN(n)) return n; }
  }
  return null;
}

export async function crawlJira(
  opts: { since: string; until: string },
  dataDir: string,
  onLog: (msg: string) => void,
  signal?: AbortSignal,
  onProgress?: (current: number, total: number) => void,
): Promise<JiraData> {
  const jql = `assignee = currentUser() AND updated >= "${opts.since}" AND updated <= "${opts.until}" ORDER BY updated DESC`;
  onLog(`Searching: ${jql}`);

  const spFields = await detectStoryPointsFields();
  onLog(spFields.length ? `Story points fields: ${spFields.join(", ")}` : "⚠ No story points fields found");

  const fields = ["summary", "issuetype", "priority", "status", "created", "updated", "resolutiondate", "labels", "project", "comment", ...spFields];

  const rawIssues = await jiraSearchAll(
    jql,
    fields,
    "changelog",
    (count, total) => { onLog(`Fetched ${count}${total ? `/${total}` : ""} issues`); onProgress?.(count, total); },
    signal,
  );

  const issues = rawIssues.map(parseIssue);
  onLog(`Parsed ${issues.length} issues`);

  const meta: JiraMeta = {
    email: "",
    site: getJiraSite(),
    since: opts.since,
    until: opts.until,
    crawled_at: new Date().toISOString(),
    totalIssues: issues.length,
  };

  const data: JiraData = { meta, issues };

  // Save to disk
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "jira.json"), JSON.stringify(data, null, 2));
  onLog(`Saved ${issues.length} issues to disk`);

  return data;
}

export function loadJiraData(dataDir: string): JiraData | null {
  const filePath = path.join(dataDir, "jira.json");
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}
