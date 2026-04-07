import os from "node:os";
import fs from "node:fs";
import path from "node:path";

const JIRA_CREDS_PATH = path.join(os.homedir(), "Library", "Application Support", "BragBot", "jira-creds.json");

interface JiraCreds {
  email: string;
  token: string;
  site: string;
  saved_at: string;
}

export function loadJiraCreds(): JiraCreds | null {
  if (!fs.existsSync(JIRA_CREDS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(JIRA_CREDS_PATH, "utf-8"));
  } catch {
    return null;
  }
}

export function saveJiraCreds(email: string, token: string, site: string) {
  fs.mkdirSync(path.dirname(JIRA_CREDS_PATH), { recursive: true });
  fs.writeFileSync(JIRA_CREDS_PATH, JSON.stringify({ email, token, site, saved_at: new Date().toISOString() }, null, 2));
}

export function clearJiraCreds() {
  if (fs.existsSync(JIRA_CREDS_PATH)) fs.unlinkSync(JIRA_CREDS_PATH);
}

export async function validateJiraCreds(email: string, token: string, site: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${site}/rest/api/3/myself`, {
      headers: {
        Authorization: `Basic ${btoa(`${email}:${token}`)}`,
        Accept: "application/json",
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}
