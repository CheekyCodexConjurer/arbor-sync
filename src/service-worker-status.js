(function () {
  const CONTRACT = globalThis.ArborSessionContract;
  const RUNTIME = globalThis.ArborRuntimeConfig;
  const STORE = globalThis.ArborSessionStore;
  const GUARDS = globalThis.ArborServiceWorkerGuards;

  function sameEnabledModes(left, right) {
    if (!Array.isArray(left) && !Array.isArray(right)) {
      return true;
    }

    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((mode, index) => mode === right[index]);
  }

  async function ensureBootstrapConfig() {
    const existing = await STORE.getBootstrapConfig();
    const nextBootstrap = CONTRACT.createBootstrapConfig({
      licenseKey: existing?.licenseKey || "",
      deviceId: existing?.deviceId || crypto.randomUUID(),
      mode: existing?.mode || RUNTIME.defaultMode,
      enabledModes: existing?.enabledModes,
      clientVersion: chrome.runtime.getManifest().version,
      updatedAt: Date.now()
    });

    if (
      !existing ||
      existing.licenseKey !== nextBootstrap.licenseKey ||
      existing.deviceId !== nextBootstrap.deviceId ||
      existing.mode !== nextBootstrap.mode ||
      !sameEnabledModes(existing.enabledModes, nextBootstrap.enabledModes) ||
      existing.clientVersion !== nextBootstrap.clientVersion
    ) {
      return STORE.setBootstrapConfig(nextBootstrap);
    }

    return existing;
  }

  function sanitizeBootstrapConfig(bootstrapConfig) {
    return {
      licenseKeyConfigured: Boolean(bootstrapConfig?.licenseKey),
      licenseKey: String(bootstrapConfig?.licenseKey || ""),
      deviceId: String(bootstrapConfig?.deviceId || ""),
      mode: CONTRACT.normalizeMode(bootstrapConfig?.mode, RUNTIME.defaultMode),
      enabledModes: bootstrapConfig?.enabledModes,
      clientVersion: String(bootstrapConfig?.clientVersion || chrome.runtime.getManifest().version),
      updatedAt: Number(bootstrapConfig?.updatedAt || 0)
    };
  }

  function sanitizeSessionState(sessionState) {
    if (!sessionState) {
      return null;
    }

    return {
      status: CONTRACT.normalizeStatus(sessionState.status, CONTRACT.SESSION_STATUS.idle),
      mode: CONTRACT.normalizeMode(sessionState.mode, RUNTIME.defaultMode),
      sessionId: String(sessionState.sessionId || ""),
      expiresAtMs: Number(sessionState.expiresAtMs || 0),
      lastHeartbeatAtMs: Number(sessionState.lastHeartbeatAtMs || 0),
      heartbeatEveryMs: Number(sessionState.heartbeatEveryMs || 0),
      activeTabId: Number(sessionState.activeTabId || 0),
      targetUrl: String(sessionState.targetUrl || ""),
      payloadVersion: Number(sessionState.payloadVersion || 0),
      reason: String(sessionState.reason || ""),
      updatedAt: Number(sessionState.updatedAt || 0)
    };
  }

  async function buildStatusResponse() {
    const [compatibility, extensionGuard, bootstrapConfig, sessionState] = await Promise.all([
      GUARDS.refreshCompatibilityState(),
      GUARDS.refreshExtensionGuardState(),
      ensureBootstrapConfig(),
      STORE.getSessionState()
    ]);

    return {
      ready: true,
      mode: CONTRACT.normalizeMode(bootstrapConfig?.mode || sessionState?.mode, RUNTIME.defaultMode),
      compatibility,
      extensionGuard,
      bootstrapConfig: sanitizeBootstrapConfig(bootstrapConfig),
      session: sanitizeSessionState(sessionState)
    };
  }

  globalThis.ArborServiceWorkerStatus = Object.freeze({
    ensureBootstrapConfig,
    sanitizeBootstrapConfig,
    sanitizeSessionState,
    buildStatusResponse
  });
})();
