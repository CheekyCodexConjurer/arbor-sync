import { createClient } from "jsr:@supabase/supabase-js@2";

export const SUPPORTED_MODES = ["gpt"] as const;
export const DEFAULT_SESSION_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_HEARTBEAT_INTERVAL_SEC = 60;

export type SupportedMode = (typeof SUPPORTED_MODES)[number];

export type LicenseEntitlementRow = {
  mode?: unknown;
  status?: unknown;
  expires_at?: unknown;
};

export type ModeAccessDecision = {
  allowed: boolean;
  code: "ok" | "product_not_in_license" | "product_inactive" | "product_expired";
  message: string;
  enabledModes: SupportedMode[];
};

export function isSupportedMode(value: unknown): value is SupportedMode {
  return typeof value === "string" && SUPPORTED_MODES.includes(value as SupportedMode);
}

export function getEnabledModes(entitlements: LicenseEntitlementRow[] = [], nowMs = Date.now()): SupportedMode[] {
  const enabledModes = new Set<SupportedMode>();

  for (const entitlement of entitlements) {
    const mode = entitlement?.mode;
    const expiresAt = entitlement?.expires_at ? new Date(String(entitlement.expires_at)).getTime() : 0;
    if (
      isSupportedMode(mode) &&
      entitlement.status === "active" &&
      (!expiresAt || nowMs < expiresAt)
    ) {
      enabledModes.add(mode);
    }
  }

  return SUPPORTED_MODES.filter((mode) => enabledModes.has(mode));
}

export function describeModeAccess(
  entitlements: LicenseEntitlementRow[] = [],
  mode: SupportedMode,
  nowMs = Date.now()
): ModeAccessDecision {
  const enabledModes = getEnabledModes(entitlements, nowMs);
  const entitlement = entitlements.find((row) => row?.mode === mode);

  if (!entitlement) {
    return {
      allowed: false,
      code: "product_not_in_license",
      message: "Produto nao incluso nesta licenca.",
      enabledModes
    };
  }

  const expiresAt = entitlement.expires_at ? new Date(String(entitlement.expires_at)).getTime() : 0;
  if (expiresAt && nowMs >= expiresAt) {
    return {
      allowed: false,
      code: "product_expired",
      message: "Produto expirado nesta licenca.",
      enabledModes
    };
  }

  if (entitlement.status !== "active") {
    return {
      allowed: false,
      code: "product_inactive",
      message: "Produto indisponivel nesta licenca.",
      enabledModes
    };
  }

  return {
    allowed: true,
    code: "ok",
    message: "Produto habilitado.",
    enabledModes
  };
}

export async function sha256(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildSessionTokenHash(token: string, pepper: string) {
  return sha256(`${token}:${pepper}`);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function createPayloadKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptPayloadBundle(payload: unknown, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await createPayloadKey(secret);
  const encodedPayload = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encodedPayload);

  return JSON.stringify({
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted))
  });
}

export async function decodePayloadBundle(value: string, secret: string) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const parsed = JSON.parse(text);
  if (parsed && typeof parsed === "object" && "ciphertext" in parsed && "iv" in parsed) {
    const key = await createPayloadKey(secret);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(String(parsed.iv))
      },
      key,
      base64ToBytes(String(parsed.ciphertext))
    );

    return JSON.parse(new TextDecoder().decode(decrypted));
  }

  return parsed;
}

export function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSessionTtlMs() {
  const raw = Deno.env.get("SESSION_TTL_MS");
  const parsed = raw ? Number(raw) : DEFAULT_SESSION_TTL_MS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_TTL_MS;
}

export function getHeartbeatIntervalSec() {
  const raw = Deno.env.get("HEARTBEAT_INTERVAL_SEC");
  const parsed = raw ? Number(raw) : DEFAULT_HEARTBEAT_INTERVAL_SEC;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HEARTBEAT_INTERVAL_SEC;
}

export function nowIso() {
  return new Date().toISOString();
}

export function addMilliseconds(base: Date, amountMs: number) {
  return new Date(base.getTime() + amountMs);
}

export function createSupabaseServiceClient() {
  const url = getRequiredEnv("SUPABASE_URL");
  const serviceKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        "x-client-info": "pro-extension-remote-session-backend"
      }
    }
  });
}

export function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
