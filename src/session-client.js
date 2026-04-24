(function () {
  const RUNTIME = globalThis.ArborRuntimeConfig || Object.freeze({
    backendBaseUrl: "https://PROJECT_REF.supabase.co/functions/v1",
    requestTimeoutMs: 15 * 1000
  });

  function normalizeBaseUrl(value) {
    const baseUrl = String(value || "").trim().replace(/\/+$/, "");
    if (!baseUrl) {
      throw new Error("ArborRuntimeConfig.backendBaseUrl is required.");
    }

    return baseUrl;
  }

  function buildEndpointUrl(pathname) {
    const baseUrl = normalizeBaseUrl(RUNTIME.backendBaseUrl);
    const relativePath = String(pathname || "").replace(/^\/+/, "");
    return `${baseUrl}/${relativePath}`;
  }

  async function parseResponse(response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }

  async function requestJson(method, pathname, body, options = {}) {
    const controller = new AbortController();
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : RUNTIME.requestTimeoutMs;
    const timeoutId = setTimeout(() => controller.abort(new Error("Request timed out.")), timeoutMs);

    try {
      const response = await fetch(buildEndpointUrl(pathname), {
        method,
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(options.headers || {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });

      const payload = await parseResponse(response);
      if (!response.ok) {
        const message = payload?.error?.message || payload?.message || `Request failed with status ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }

      return payload;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function getJson(pathname, options = {}) {
    const controller = new AbortController();
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : RUNTIME.requestTimeoutMs;
    const timeoutId = setTimeout(() => controller.abort(new Error("Request timed out.")), timeoutMs);

    try {
      const response = await fetch(buildEndpointUrl(pathname), {
        method: "GET",
        signal: controller.signal,
        headers: {
          ...(options.headers || {})
        }
      });

      const payload = await parseResponse(response);
      if (!response.ok) {
        const message = payload?.error?.message || payload?.message || `Request failed with status ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }

      return payload;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function startSession(input, options = {}) {
    return requestJson("POST", "session-start", input, options);
  }

  function getLicenseStatus(input, options = {}) {
    return requestJson("POST", "license-status", input, options);
  }

  function createStripeCheckout(input, options = {}) {
    return requestJson("POST", "stripe-checkout", input, options);
  }

  function heartbeat(input, options = {}) {
    return requestJson("POST", "session-heartbeat", input, options);
  }

  function stopSession(input, options = {}) {
    return requestJson("POST", "session-end", input, options);
  }

  function fetchPayload(query = {}, options = {}) {
    const url = new URL(buildEndpointUrl("payload-fetch"));
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && `${value}`.length > 0) {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : RUNTIME.requestTimeoutMs;
    const timeoutId = setTimeout(() => controller.abort(new Error("Request timed out.")), timeoutMs);

    return fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      headers: {
        ...(options.headers || {})
      }
    })
      .then(async (response) => {
        const payload = await parseResponse(response);
        if (!response.ok) {
          const message = payload?.error?.message || payload?.message || `Request failed with status ${response.status}`;
          const error = new Error(message);
          error.status = response.status;
          error.payload = payload;
          throw error;
        }

        return payload;
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });
  }

  globalThis.ArborSessionClient = Object.freeze({
    buildEndpointUrl,
    requestJson,
    getJson,
    startSession,
    getLicenseStatus,
    createStripeCheckout,
    heartbeat,
    stopSession,
    fetchPayload
  });
})();
