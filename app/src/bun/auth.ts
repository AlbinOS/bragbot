import os from "node:os";
import fs from "node:fs";
import path from "node:path";

const CLIENT_ID = "Ov23liDY6clMyFJfssdZ";
const SCOPES = "read:org repo";
const TOKEN_PATH = path.join(os.homedir(), "Library", "Application Support", "BragBot", "token.json");

interface TokenData {
  access_token: string;
  token_type: string;
  scope: string;
  saved_at: string;
}

export function loadToken(): string | null {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try {
    const data: TokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

function saveToken(data: TokenData) {
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(data, null, 2));
}

export function clearToken() {
  if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
}

export interface DeviceFlowStart {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export async function startDeviceFlow(): Promise<DeviceFlowStart> {
  const resp = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPES }),
  });
  if (!resp.ok) throw new Error(`Device flow start failed: ${resp.status}`);
  return resp.json();
}

export async function pollForToken(
  deviceCode: string,
  interval: number,
  signal?: AbortSignal,
): Promise<string> {
  let pollInterval = interval;

  while (true) {
    signal?.throwIfAborted();
    await Bun.sleep(pollInterval * 1000);

    const resp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
      signal,
    });

    const data = await resp.json();

    if (data.access_token) {
      saveToken({ ...data, saved_at: new Date().toISOString() });
      return data.access_token;
    }

    if (data.error === "slow_down") {
      pollInterval = (data.interval ?? pollInterval) + 5;
      continue;
    }

    if (data.error === "authorization_pending") continue;

    if (data.error === "expired_token") throw new Error("Code expired — please try again");
    if (data.error === "access_denied") throw new Error("Authorization denied by user");

    throw new Error(data.error_description ?? data.error ?? "Unknown auth error");
  }
}

export async function validateToken(token: string): Promise<string | null> {
  const resp = await fetch("https://api.github.com/user", {
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!resp.ok) return null;
  const user = await resp.json();
  return user.login ?? null;
}

export function saveTokenDirect(token: string) {
  saveToken({ access_token: token, token_type: "bearer", scope: "pat", saved_at: new Date().toISOString() });
}
