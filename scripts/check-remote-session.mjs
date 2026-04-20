import { loadAdminRuntime, requestJson } from "./supabase-admin-helpers.mjs";

function getBaseUrl(runtime) {
  return `https://${runtime.projectRef}.supabase.co/functions/v1`;
}

async function callJson(url, options = {}) {
  return requestJson(url, {
    method: options.method || "GET",
    headers: {
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
}

async function main() {
  const runtime = await loadAdminRuntime();
  const licenseKey = String(process.env.ARBOR_INITIAL_LICENSE_KEY || process.argv[2] || "").trim();
  const mode = String(process.env.ARBOR_VERIFY_MODE || process.argv[3] || "perplexity").trim();
  const deviceId = String(process.env.ARBOR_VERIFY_DEVICE_ID || process.argv[4] || "codex-check-device").trim();

  if (!licenseKey) {
    throw new Error("Provide the license key as ARBOR_INITIAL_LICENSE_KEY or the first CLI argument.");
  }
  const baseUrl = getBaseUrl(runtime);

  const started = await callJson(`${baseUrl}/session-start`, {
    method: "POST",
    body: {
      licenseKey,
      deviceId,
      mode,
      clientVersion: "1.0.3"
    }
  });

  const payload = await callJson(`${baseUrl}/payload-fetch?mode=${encodeURIComponent(mode)}`, {
    headers: {
      authorization: `Bearer ${started.sessionToken}`
    }
  });

  const heartbeat = await callJson(`${baseUrl}/session-heartbeat`, {
    method: "POST",
    body: {
      sessionToken: started.sessionToken,
      deviceId,
      mode
    }
  });

  const ended = await callJson(`${baseUrl}/session-end`, {
    method: "POST",
    body: {
      sessionToken: started.sessionToken,
      deviceId
    }
  });

  console.log(JSON.stringify({
    started: {
      mode: started.mode,
      sessionId: started.sessionId,
      payloadVersion: started.payloadVersion
    },
    payload: {
      mode: payload.mode,
      version: payload.version,
      cookieCount: Array.isArray(payload.cookies) ? payload.cookies.length : 0,
      hasProxy: Boolean(payload.proxy),
      targetUrl: payload.targetUrl
    },
    deviceId,
    heartbeat: {
      status: heartbeat.status,
      heartbeatCount: heartbeat.heartbeatCount
    },
    ended
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  if (error.payload) {
    console.error(JSON.stringify(error.payload, null, 2));
  }
  process.exit(1);
});
