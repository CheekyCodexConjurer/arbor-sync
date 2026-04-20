(function () {
  const defaultConfig = Object.freeze({
    backendBaseUrl: "https://yjmcibnevpjxvkreswfq.supabase.co/functions/v1",
    sessionTtlMs: 10 * 60 * 1000,
    heartbeatIntervalMs: 60 * 1000,
    requestTimeoutMs: 15 * 1000,
    controlledOrigins: Object.freeze([
      "https://chatgpt.com",
      "https://www.perplexity.ai",
      "https://perplexity.ai"
    ]),
    defaultMode: "perplexity",
    storageScopes: Object.freeze({
      bootstrap: "local",
      session: "session"
    })
  });

  function resolveRuntimeConfig(overrides = {}) {
    const merged = {
      backendBaseUrl: String(overrides.backendBaseUrl || defaultConfig.backendBaseUrl).replace(/\/+$/, ""),
      sessionTtlMs: Number.isFinite(overrides.sessionTtlMs) ? overrides.sessionTtlMs : defaultConfig.sessionTtlMs,
      heartbeatIntervalMs: Number.isFinite(overrides.heartbeatIntervalMs)
        ? overrides.heartbeatIntervalMs
        : defaultConfig.heartbeatIntervalMs,
      requestTimeoutMs: Number.isFinite(overrides.requestTimeoutMs)
        ? overrides.requestTimeoutMs
        : defaultConfig.requestTimeoutMs,
      controlledOrigins: Array.isArray(overrides.controlledOrigins) && overrides.controlledOrigins.length > 0
        ? Object.freeze(overrides.controlledOrigins.map((origin) => String(origin).trim()).filter(Boolean))
        : defaultConfig.controlledOrigins,
      defaultMode: String(overrides.defaultMode || defaultConfig.defaultMode).trim() || defaultConfig.defaultMode,
      storageScopes: Object.freeze({
        bootstrap: String(overrides.storageScopes?.bootstrap || defaultConfig.storageScopes.bootstrap),
        session: String(overrides.storageScopes?.session || defaultConfig.storageScopes.session)
      })
    };

    return Object.freeze(merged);
  }

  globalThis.ArborRuntimeConfig = resolveRuntimeConfig();
  globalThis.ArborRuntimeConfigDefaults = defaultConfig;
  globalThis.ArborRuntimeConfigFactory = Object.freeze({
    resolveRuntimeConfig
  });
})();
