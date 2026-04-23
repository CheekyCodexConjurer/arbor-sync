import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildPacProxyConfig,
  encryptPayloadBundle,
  getManagementApiKeys,
  loadAdminRuntime,
  pickSecretApiKey,
  restRequest,
  sha256Hex
} from "./supabase-admin-helpers.mjs";

const MODES = {
  gpt: {
    envPathKey: "ARBOR_GPT_SOURCE_PATH",
    cookiesPath: "assets/data/gpt.json",
    backupFileName: "gpt.json",
    targetDomain: "chatgpt.com",
    targetUrl: "https://chatgpt.com/"
  }
};

const MODE_PRICES = Object.freeze({
  gpt: 99.90
});

function sanitizeCookie(cookie) {
  const value = String(cookie?.value || "").trim();
  if (!value || /COLOQUE_AQUI/i.test(value)) {
    return null;
  }

  const sanitized = {
    domain: String(cookie?.domain || "").trim(),
    hostOnly: cookie?.hostOnly === true,
    httpOnly: cookie?.httpOnly === true,
    name: String(cookie?.name || "").trim(),
    path: String(cookie?.path || "/").trim() || "/",
    sameSite: cookie?.sameSite || "unspecified",
    secure: cookie?.secure === true,
    value
  };

  return sanitized.name ? sanitized : null;
}

async function readCookies(rootDir, relativePath) {
  const filePath = path.isAbsolute(relativePath) ? relativePath : path.join(rootDir, relativePath);
  const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
  return payload.map(sanitizeCookie).filter(Boolean);
}

async function resolveSourcePath(rootDir, config) {
  const explicitPath = String(process.env[config.envPathKey] || "").trim();
  if (explicitPath) {
    return explicitPath;
  }

  const repoPath = path.join(rootDir, config.cookiesPath);
  try {
    await fs.access(repoPath);
    return repoPath;
  } catch {}

  const fallbackPath = path.join(process.env.USERPROFILE || rootDir, ".arbor-sync", "payload-sources", config.backupFileName);
  await fs.access(fallbackPath);
  return fallbackPath;
}

function uniqueCookies(cookies) {
  const seen = new Set();
  const unique = [];

  for (const cookie of cookies) {
    const key = [
      cookie.hostOnly ? "host" : "domain",
      cookie.domain,
      cookie.name,
      cookie.path
    ].join("|");
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(cookie);
  }

  return unique;
}

function resolveProxyChain() {
  const raw = String(process.env.ARBOR_PROXY_CHAIN || "").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildLicenseKey() {
  const prefix = String(process.env.ARBOR_LICENSE_PREFIX || "ARBOR").trim().toUpperCase();
  const body = crypto.randomBytes(12).toString("hex").toUpperCase();
  return `${prefix}-${body}`;
}

async function fetchNextPayloadVersion(projectRef, secretApiKey, mode) {
  const rows = await restRequest(projectRef, secretApiKey, "mode_payloads", {
    query: `mode=eq.${mode}&select=version&order=version.desc&limit=1`
  });
  const latestVersion = Array.isArray(rows) && rows[0]?.version ? Number(rows[0].version) : 0;
  return latestVersion + 1;
}

async function getActivePayload(projectRef, secretApiKey, mode) {
  const rows = await restRequest(projectRef, secretApiKey, "mode_payloads", {
    query: `mode=eq.${mode}&active=eq.true&select=id,version&limit=1`
  });
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function updatePayloadActiveState(projectRef, secretApiKey, payloadId, active) {
  try {
    await restRequest(projectRef, secretApiKey, "mode_payloads", {
      method: "PATCH",
      query: `id=eq.${payloadId}`,
      headers: {
        Prefer: "return=minimal"
      },
      body: {
        active
      }
    });
  } catch (error) {
    if (error.status !== 200 && error.status !== 204) {
      throw error;
    }
  }
}

async function upsertLicense(projectRef, secretApiKey, licenseKey, maxDevices) {
  const now = new Date();
  const nextYear = new Date(now);
  nextYear.setFullYear(now.getFullYear() + 1);

  const payload = await restRequest(projectRef, secretApiKey, "licenses", {
    method: "POST",
    query: "on_conflict=license_key&select=id,license_key,status,current_period_end,max_devices",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: [{
      license_key: licenseKey,
      status: "active",
      plan: "default",
      max_devices: maxDevices,
      current_period_end: nextYear.toISOString(),
      revoked_at: null
    }]
  });

  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error("License upsert returned no rows.");
  }

  return payload[0];
}

async function upsertLicenseEntitlements(projectRef, secretApiKey, license, modes) {
  const rows = modes.map((mode) => ({
    license_id: license.id,
    mode,
    status: "active",
    starts_at: new Date().toISOString(),
    expires_at: license.current_period_end,
    months: 1,
    monthly_price: MODE_PRICES[mode] || 0,
    paid_amount: MODE_PRICES[mode] || 0
  }));

  const payload = await restRequest(projectRef, secretApiKey, "license_entitlements", {
    method: "POST",
    query: "on_conflict=license_id,mode&select=id,mode,status,monthly_price",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: rows
  });

  if (!Array.isArray(payload) || payload.length !== rows.length) {
    throw new Error("License entitlement upsert returned an unexpected number of rows.");
  }

  return payload;
}

async function insertModePayload(runtime, secretApiKey, mode, payload) {
  const version = await fetchNextPayloadVersion(runtime.projectRef, secretApiKey, mode);
  const encryptedPayload = await encryptPayloadBundle(payload, runtime.payloadEncryptionKey);
  const payloadHash = sha256Hex(JSON.stringify(payload));
  const currentActive = await getActivePayload(runtime.projectRef, secretApiKey, mode);
  if (currentActive?.id) {
    await updatePayloadActiveState(runtime.projectRef, secretApiKey, currentActive.id, false);
  }

  let inserted;
  try {
    inserted = await restRequest(runtime.projectRef, secretApiKey, "mode_payloads", {
      method: "POST",
      query: "select=id,mode,version,active,payload_hash",
      headers: {
        Prefer: "return=representation"
      },
      body: [{
        mode,
        version,
        encrypted_payload: encryptedPayload,
        payload_hash: payloadHash,
        active: true
      }]
    });
  } catch (error) {
    if (currentActive?.id) {
      await updatePayloadActiveState(runtime.projectRef, secretApiKey, currentActive.id, true);
    }

    throw error;
  }

  if (!Array.isArray(inserted) || inserted.length === 0) {
    if (currentActive?.id) {
      await updatePayloadActiveState(runtime.projectRef, secretApiKey, currentActive.id, true);
    }
    throw new Error(`Payload insert for mode ${mode} returned no rows.`);
  }

  return inserted[0];
}

async function main() {
  const runtime = await loadAdminRuntime({ requirePayloadEncryptionKey: true });
  const keysPayload = await getManagementApiKeys(runtime);
  const secretApiKey = pickSecretApiKey(keysPayload);
  const proxyChain = resolveProxyChain();
  const licenseKey = String(process.env.ARBOR_INITIAL_LICENSE_KEY || "").trim() || buildLicenseKey();
  const maxDevices = Math.max(1, Number(process.env.ARBOR_MAX_DEVICES || 1));
  const modeResults = [];

  for (const [mode, config] of Object.entries(MODES)) {
    const sourcePath = await resolveSourcePath(runtime.rootDir, config);
    const cookies = uniqueCookies(await readCookies(runtime.rootDir, sourcePath));
    const remotePayload = {
      cookies,
      proxy: buildPacProxyConfig(config.targetDomain, proxyChain),
      targetUrl: config.targetUrl
    };
    const inserted = await insertModePayload(runtime, secretApiKey, mode, remotePayload);
    modeResults.push({
      mode,
      version: inserted.version,
      active: inserted.active,
      cookieCount: cookies.length,
      proxyConfigured: Boolean(remotePayload.proxy)
    });
  }

  const license = await upsertLicense(runtime.projectRef, secretApiKey, licenseKey, maxDevices);
  const entitlements = await upsertLicenseEntitlements(
    runtime.projectRef,
    secretApiKey,
    license,
    modeResults.map((result) => result.mode)
  );
  console.log(JSON.stringify({
    licenseKey,
    license,
    entitlements,
    payloads: modeResults
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  if (error.payload) {
    console.error(JSON.stringify(error.payload, null, 2));
  }
  process.exit(1);
});
