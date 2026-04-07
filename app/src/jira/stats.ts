import type { JiraIssue } from "./types";

export interface JiraTotals {
  completed: number;
  storyPoints: number;
  created: number;
  comments: number;
  avgCycleTimeDays: number;
}

export interface JiraWeeklyPoint {
  week: string;
  completed: number;
  points: number;
}

export interface CycleTimePoint {
  week: string;
  avgDays: number;
}

export interface BreakdownItem {
  name: string;
  value: number;
}

export interface TimeInStatusItem {
  status: string;
  avgHours: number;
}

export interface ScatterPoint {
  key: string;
  summary: string;
  points: number;
  cycleDays: number;
}

export interface DayOfWeekItem {
  day: string;
  count: number;
}

function getCycleTimeDays(issue: JiraIssue): number | null {
  if (!issue.resolved) return null;
  const created = new Date(issue.created).getTime();
  const resolved = new Date(issue.resolved).getTime();
  return (resolved - created) / 86400000;
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split("T")[0];
}

export function computeTotals(issues: JiraIssue[]): JiraTotals {
  const completed = issues.filter((i) => i.resolved);
  const cycleTimes = completed.map(getCycleTimeDays).filter((d): d is number => d !== null);
  return {
    completed: completed.length,
    storyPoints: issues.reduce((s, i) => s + (i.storyPoints ?? 0), 0),
    created: issues.length,
    comments: issues.reduce((s, i) => s + i.commentCount, 0),
    avgCycleTimeDays: cycleTimes.length ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length : 0,
  };
}

export function computeWeeklyVelocity(issues: JiraIssue[], since: string, until: string): JiraWeeklyPoint[] {
  const map = new Map<string, { completed: number; points: number }>();
  // Collect all resolved issues into week buckets
  for (const issue of issues) {
    if (!issue.resolved) continue;
    const week = getWeekKey(issue.resolved);
    if (week < since || week > until) continue;
    if (!map.has(week)) map.set(week, { completed: 0, points: 0 });
    const entry = map.get(week)!;
    entry.completed++;
    entry.points += issue.storyPoints ?? 0;
  }
  // Fill gaps
  const start = new Date(since);
  const end = new Date(until);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
    const key = getWeekKey(d.toISOString());
    if (!map.has(key)) map.set(key, { completed: 0, points: 0 });
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, v]) => ({ week, ...v }));
}

export function computeCycleTimeTrend(issues: JiraIssue[]): CycleTimePoint[] {
  const map = new Map<string, number[]>();
  for (const issue of issues) {
    const days = getCycleTimeDays(issue);
    if (days === null) continue;
    const week = getWeekKey(issue.resolved!);
    if (!map.has(week)) map.set(week, []);
    map.get(week)!.push(days);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, vals]) => ({ week, avgDays: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 }));
}

export function computeByType(issues: JiraIssue[]): BreakdownItem[] {
  const map = new Map<string, number>();
  for (const i of issues) map.set(i.type, (map.get(i.type) ?? 0) + 1);
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

export function computeByPriority(issues: JiraIssue[]): BreakdownItem[] {
  const map = new Map<string, number>();
  for (const i of issues) map.set(i.priority, (map.get(i.priority) ?? 0) + 1);
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

export function computeTimeInStatus(issues: JiraIssue[]): TimeInStatusItem[] {
  const map = new Map<string, number[]>();
  for (const issue of issues) {
    const transitions = issue.transitions;
    for (let i = 0; i < transitions.length; i++) {
      const start = new Date(transitions[i].timestamp).getTime();
      const end = i + 1 < transitions.length ? new Date(transitions[i + 1].timestamp).getTime() : Date.now();
      const status = transitions[i].to;
      const hours = (end - start) / 3600000;
      if (!map.has(status)) map.set(status, []);
      map.get(status)!.push(hours);
    }
  }
  return Array.from(map.entries())
    .map(([status, vals]) => ({ status, avgHours: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 }))
    .sort((a, b) => b.avgHours - a.avgHours);
}

export function computePointsVsCycleTime(issues: JiraIssue[]): ScatterPoint[] {
  return issues
    .filter((i) => i.resolved && i.storyPoints)
    .map((i) => ({
      key: i.key,
      summary: i.summary,
      points: i.storyPoints!,
      cycleDays: Math.round(getCycleTimeDays(i)! * 10) / 10,
    }));
}

export function computeDayOfWeek(issues: JiraIssue[]): DayOfWeekItem[] {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const counts = new Array(7).fill(0);
  for (const issue of issues) {
    if (!issue.resolved) continue;
    counts[new Date(issue.resolved).getDay()]++;
  }
  return days.map((day, i) => ({ day, count: counts[i] }));
}
