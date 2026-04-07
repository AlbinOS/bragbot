import fs from "node:fs";
import path from "node:path";

export function mergeRepoData(existing: any, newData: any, since: string, until: string): any {
  const existingAuthored = new Set(existing.authored_prs.map((p: any) => p.number));
  const existingReviewed = new Set(existing.reviewed_prs.map((p: any) => p.number));

  const newAuthored = newData.authored_prs.filter((p: any) => !existingAuthored.has(p.number));
  const newReviewed = newData.reviewed_prs.filter((p: any) => !existingReviewed.has(p.number));

  existing.authored_prs.push(...newAuthored);
  existing.reviewed_prs.push(...newReviewed);
  existing.meta.since = existing.meta.since < since ? existing.meta.since : since;
  existing.meta.until = existing.meta.until > until ? existing.meta.until : until;
  existing.crawled_at = new Date().toISOString();
  return { merged: existing, newAuthored: newAuthored.length, newReviewed: newReviewed.length };
}

export function loadJson(filePath: string): any | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export function saveJson(filePath: string, data: any) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
