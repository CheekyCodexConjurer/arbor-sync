import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const localRuntimePath = path.join(rootDir, ".codex-supabase-runtime.json");

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function parseJsonSafely(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function loadAdminRuntime(options = {}) {
  const localRuntime = await readOptionalJson(localRuntimePath);
  const projectRef = String(process.env.SUPABASE_PROJECT_REF || localRuntime?.project_ref || "").trim();
  const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || localRuntime?.access_token || "").trim();
  const refreshToken = String(process.env.SUPABASE_REFRESH_TOKEN || localRuntime?.refresh_token || "").trim();
  const accessTokenExpiresAt = Number(process.env.SUPABASE_ACCESS_TOKEN_EXPIRES_AT || localRuntime?.access_token_expires_at || 0);
  const payloadEncryptionKey = String(process.env.PAYLOAD_ENCRYPTION_KEY || localRuntime?.payload_encryption_key || "").trim();

  if (!projectRef) {
    throw new Error("SUPABASE_PROJECT_REF is required.");
  }

  if (!accessToken && !refreshToken) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required.");
  }

  if (options.requirePayloadEncryptionKey && !payloadEncryptionKey) {
    throw new Error("PAYLOAD_ENCRYPTION_KEY is required for payload seeding.");
  }

  const runtime = {
    rootDir,
    projectRef,
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    payloadEncryptionKey,
    localRuntimePath
  };

  if (
    refreshToken &&
    localRuntimePath &&
    (
      !runtime.accessToken ||
      (Number.isFinite(accessTokenExpiresAt) && accessTokenExpiresAt > 0 && accessTokenExpiresAt <= Math.floor(Date.now() / 1000) + 60)
    )
  ) {
    return refreshDashboardSession(runtime);
  }

  return runtime;
}

export async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = parseJsonSafely(text);

  if (!response.ok) {
    const error = new Error(`Request failed (${response.status}) for ${url}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function refreshDashboardSession(runtime) {
  if (!runtime?.refreshToken) {
    throw new Error("SUPABASE_REFRESH_TOKEN is required to refresh the dashboard session.");
  }

  const payload = await requestJson("https://alt.supabase.io/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      refresh_token: runtime.refreshToken
    })
  });

  const nextRuntime = {
    ...runtime,
    accessToken: String(payload.access_token || "").trim(),
    refreshToken: String(payload.refresh_token || runtime.refreshToken || "").trim(),
    accessTokenExpiresAt: Number(payload.expires_at || 0)
  };

  if (runtime.localRuntimePath) {
    const localRuntime = await readOptionalJson(runtime.localRuntimePath);
    if (localRuntime) {
      localRuntime.access_token = nextRuntime.accessToken;
      localRuntime.refresh_token = nextRuntime.refreshToken;
      localRuntime.access_token_expires_at = nextRuntime.accessTokenExpiresAt;
      await fs.writeFile(runtime.localRuntimePath, JSON.stringify(localRuntime));
    }
  }

  return nextRuntime;
}

export async function getManagementApiKeys(runtime) {
  return requestJson(`https://api.supabase.com/v1/projects/${runtime.projectRef}/api-keys?reveal=true`, {
    headers: {
      Authorization: `Bearer ${runtime.accessToken}`
    }
  });
}

export function pickSecretApiKey(keysPayload) {
  const keys = Array.isArray(keysPayload) ? keysPayload : [];
  const preferred = keys.find((key) => key?.type === "secret")
    || keys.find((key) => key?.name === "service_role")
    || null;
  const apiKey = String(preferred?.api_key || "").trim();

  if (!apiKey) {
    throw new Error("No secret/service_role API key was returned by the Management API.");
  }

  return apiKey;
}

export function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function toBase64(buffer) {
  return Buffer.from(buffer).toString("base64");
}

export async function encryptPayloadBundle(payload, secret) {
  const keyBytes = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBytes, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: toBase64(iv),
    ciphertext: toBase64(Buffer.concat([ciphertext, authTag]))
  });
}

export function buildPacProxyConfig(targetDomain, proxyChain) {
  const normalizedTarget = String(targetDomain || "").trim().toLowerCase();
  const hops = proxyChain
    .map((hop) => String(hop || "").trim())
    .filter(Boolean);

  if (!normalizedTarget || hops.length === 0) {
    return null;
  }

  const proxyRule = hops.map((hop) => `PROXY ${hop}`).join("; ");
  const pacScript = [
    "function shouldProxyHost(host) {",
    "  host = host.toLowerCase();",
    `  return host === "${normalizedTarget}" || dnsDomainIs(host, ".${normalizedTarget}");`,
    "}",
    "",
    "function FindProxyForURL(url, host) {",
    "  if (shouldProxyHost(host)) {",
    `    return "${proxyRule}; DIRECT";`,
    "  }",
    '  return "DIRECT";',
    "}"
  ].join("\n");

  return {
    mode: "pac_script",
    pacScript: {
      data: pacScript
    }
  };
}

export function buildRestUrl(projectRef, resource, query = "") {
  const baseUrl = `https://${projectRef}.supabase.co/rest/v1/${resource}`;
  return query ? `${baseUrl}?${query}` : baseUrl;
}

export async function restRequest(projectRef, secretApiKey, resource, options = {}) {
  const query = String(options.query || "");
  const url = buildRestUrl(projectRef, resource, query);
  const headers = {
    apikey: secretApiKey,
    Authorization: `Bearer ${secretApiKey}`,
    ...(options.headers || {})
  };

  let body = options.body;
  if (body !== undefined && typeof body !== "string") {
    body = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }

  return requestJson(url, {
    method: options.method || "GET",
    headers,
    body
  });
}
