const MODE_DEFAULTS = Object.freeze({
  gpt: Object.freeze({
    targetUrl: "https://chatgpt.com/",
    fallbackDomain: "chatgpt.com"
  }),
  perplexity: Object.freeze({
    targetUrl: "https://www.perplexity.ai/",
    fallbackDomain: "www.perplexity.ai"
  })
});

function sanitizeCookie(cookie, fallbackDomain) {
  const name = String(cookie?.name || "").trim();
  const value = String(cookie?.value || "").trim();
  const domain = String(cookie?.domain || fallbackDomain || "").trim();
  if (!name || !value || !domain) {
    return null;
  }

  const sameSite = String(cookie?.sameSite || "unspecified").trim().toLowerCase();
  const normalized = {
    domain,
    hostOnly: cookie?.hostOnly === true,
    httpOnly: cookie?.httpOnly === true,
    name,
    path: String(cookie?.path || "/").trim() || "/",
    sameSite: ["lax", "strict", "no_restriction", "unspecified"].includes(sameSite)
      ? sameSite
      : "unspecified",
    secure: cookie?.secure !== false,
    value
  };

  if (cookie?.expirationDate !== undefined && cookie?.expirationDate !== null) {
    normalized.expirationDate = Math.floor(Number(cookie.expirationDate));
  }

  return normalized;
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

export function parseJsonDocument(buffer) {
  const text = Buffer.from(buffer).toString("utf8").trim();
  if (!text) {
    throw new Error("O arquivo JSON está vazio.");
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON inválido: ${error.message}`);
  }
}

export function normalizePayloadUpload(rawPayload, mode, currentActivePayload = null) {
  const defaults = MODE_DEFAULTS[mode];
  if (!defaults) {
    throw new Error(`Modo não suportado: ${mode}`);
  }

  let cookiesSource = rawPayload;
  let proxy = currentActivePayload?.proxy ?? null;
  let targetUrl = currentActivePayload?.targetUrl || defaults.targetUrl;

  if (Array.isArray(rawPayload)) {
    cookiesSource = rawPayload;
  } else if (rawPayload && typeof rawPayload === "object") {
    cookiesSource = Array.isArray(rawPayload.cookies) ? rawPayload.cookies : [];
    if ("proxy" in rawPayload) {
      proxy = rawPayload.proxy ?? null;
    }
    if (rawPayload.targetUrl) {
      targetUrl = String(rawPayload.targetUrl).trim();
    }
  } else {
    throw new Error("O arquivo precisa ser um array de cookies ou um objeto com `cookies`.");
  }

  const cookies = uniqueCookies(
    cookiesSource
      .map((cookie) => sanitizeCookie(cookie, defaults.fallbackDomain))
      .filter(Boolean)
  );

  if (cookies.length === 0) {
    throw new Error("Nenhum cookie válido foi encontrado no JSON enviado.");
  }

  return {
    cookies,
    proxy,
    targetUrl
  };
}

export function getModeDefaults(mode) {
  return MODE_DEFAULTS[mode] || null;
}
