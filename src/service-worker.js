importScripts(
  "shared/chrome-version-gate.js",
  "shared/session-contract.js",
  "shared/runtime-config.js",
  "session-store.js",
  "session-client.js",
  "cookie-proxy-manager.js"
);

const CONTRACT = globalThis.ArborSessionContract;
const RUNTIME = globalThis.ArborRuntimeConfig;
const STORE = globalThis.ArborSessionStore;
const CLIENT = globalThis.ArborSessionClient;
const ARTIFACTS = globalThis.ArborCookieProxyManager;

const MODES = Object.freeze({
  gpt: Object.freeze({
    domain: "chatgpt.com",
    targetUrl: "https://chatgpt.com/"
  }),
  perplexity: Object.freeze({
    domain: "www.perplexity.ai",
    targetUrl: "https://www.perplexity.ai/"
  })
});

const COOKIE_EXTENSION_MATCHER = /cookie/i;
const TRANSIENT_HEARTBEAT_WINDOW_MS = 20 * 1000;

let compatibilityState = {
  checking: true,
  supported: false,
  currentVersion: "",
  requiredVersion: "",
  platformKey: "",
  updateUrl: ChromeVersionGate.updateUrl,
  error: ""
};

let compatibilityPromise = null;

let extensionGuardState = {
  checked: false,
  blocked: false,
  conflictingExtensions: [],
  error: ""
};

function createTab(details) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(details, (tab) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(tab);
    });
  });
}

function modeConfigFor(mode) {
  return MODES[CONTRACT.normalizeMode(mode, RUNTIME.defaultMode)];
}

function isControlledUrl(url) {
  try {
    const parsed = new URL(url);
    return RUNTIME.controlledOrigins.includes(parsed.origin);
  } catch {
    return false;
  }
}

function modeForUrl(url) {
  if (!isControlledUrl(url)) {
    return null;
  }

  try {
    const { hostname } = new URL(url);
    return hostname === "chatgpt.com" ? CONTRACT.MODES.gpt : CONTRACT.MODES.perplexity;
  } catch {
    return null;
  }
}

function buildDefaultProxyConfig() {
  return null;
}

async function refreshCompatibilityState() {
  compatibilityState = {
    checking: true,
    supported: false,
    currentVersion: "",
    requiredVersion: "",
    platformKey: "",
    updateUrl: ChromeVersionGate.updateUrl,
    error: ""
  };

  try {
    const result = await ChromeVersionGate.checkCompatibility();
    compatibilityState = {
      checking: false,
      error: "",
      ...result
    };
  } catch (error) {
    compatibilityState = {
      checking: false,
      supported: false,
      currentVersion: "",
      requiredVersion: "",
      platformKey: ChromeVersionGate.getPlatformKey(),
      updateUrl: ChromeVersionGate.updateUrl,
      error: String(error?.message || error)
    };
  }

  return compatibilityState;
}

function ensureCompatibilityState() {
  if (!compatibilityPromise) {
    compatibilityPromise = refreshCompatibilityState();
  }

  return compatibilityPromise;
}

async function requireSupportedChrome() {
  const state = await ensureCompatibilityState();
  return state;
}

function getManagementExtensions() {
  return new Promise((resolve, reject) => {
    if (!chrome.management?.getAll) {
      reject(new Error("chrome.management.getAll indisponivel."));
      return;
    }

    chrome.management.getAll((extensions) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(Array.isArray(extensions) ? extensions : []);
    });
  });
}

async function refreshExtensionGuardState() {
  try {
    const extensions = await getManagementExtensions();
    const conflicts = extensions
      .filter((extension) => {
        if (!extension || extension.id === chrome.runtime.id) {
          return false;
        }

        return extension.enabled !== false && COOKIE_EXTENSION_MATCHER.test(String(extension.name || ""));
      })
      .map((extension) => ({
        id: extension.id,
        name: extension.name,
        enabled: extension.enabled !== false
      }));

    extensionGuardState = {
      checked: true,
      blocked: conflicts.length > 0,
      conflictingExtensions: conflicts,
      error: ""
    };
  } catch (error) {
    extensionGuardState = {
      checked: true,
      blocked: true,
      conflictingExtensions: [],
      error: String(error?.message || error)
    };
  }

  return extensionGuardState;
}

async function ensureNoCookieExtensionConflict() {
  const guard = await refreshExtensionGuardState();
  if (guard.blocked) {
    await ARTIFACTS.clearManagedArtifacts({});
  }

  return guard;
}

async function ensureBootstrapConfig() {
  const existing = await STORE.getBootstrapConfig();
  const nextBootstrap = CONTRACT.createBootstrapConfig({
    licenseKey: existing?.licenseKey || "",
    deviceId: existing?.deviceId || crypto.randomUUID(),
    mode: existing?.mode || RUNTIME.defaultMode,
    clientVersion: chrome.runtime.getManifest().version,
    updatedAt: Date.now()
  });

  if (
    !existing ||
    existing.licenseKey !== nextBootstrap.licenseKey ||
    existing.deviceId !== nextBootstrap.deviceId ||
    existing.mode !== nextBootstrap.mode ||
    existing.clientVersion !== nextBootstrap.clientVersion
  ) {
    return STORE.setBootstrapConfig(nextBootstrap);
  }

  return existing;
}

function sanitizeBootstrapConfig(bootstrapConfig) {
  return {
    licenseKeyConfigured: Boolean(bootstrapConfig?.licenseKey),
    deviceId: String(bootstrapConfig?.deviceId || ""),
    mode: CONTRACT.normalizeMode(bootstrapConfig?.mode, RUNTIME.defaultMode),
    clientVersion: String(bootstrapConfig?.clientVersion || chrome.runtime.getManifest().version)
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

function normalizeArtifactPayload(mode, payload) {
  const modeConfig = modeConfigFor(mode);
  const cookies = Array.isArray(payload?.cookies) ? payload.cookies : [];
  const proxy = payload?.proxy || buildDefaultProxyConfig(mode);
  const targetUrl = payload?.targetUrl || modeConfig.targetUrl;
  const payloadVersion = Number(payload?.version || 0);

  return {
    cookies,
    proxy,
    targetUrl,
    payloadVersion
  };
}

async function fetchRemotePayload(sessionState) {
  const payload = await CLIENT.fetchPayload(
    { mode: sessionState.mode },
    {
      headers: {
        authorization: `Bearer ${sessionState.sessionToken}`
      }
    }
  );

  return normalizeArtifactPayload(sessionState.mode, payload);
}

async function buildStatusResponse() {
  const [compatibility, guard, bootstrapConfig, sessionState] = await Promise.all([
    ensureCompatibilityState(),
    refreshExtensionGuardState(),
    ensureBootstrapConfig(),
    STORE.getSessionState()
  ]);

  return {
    ready: true,
    mode: CONTRACT.normalizeMode(sessionState?.mode || bootstrapConfig?.mode, RUNTIME.defaultMode),
    compatibility,
    extensionGuard: guard,
    bootstrapConfig: sanitizeBootstrapConfig(bootstrapConfig),
    session: sanitizeSessionState(sessionState)
  };
}

async function stopActiveSession(reason, options = {}) {
  const sessionState = await STORE.getSessionState();
  if (sessionState?.sessionToken && options.notifyBackend !== false) {
    try {
      const bootstrapConfig = await ensureBootstrapConfig();
      await CLIENT.stopSession({
        sessionToken: sessionState.sessionToken,
        deviceId: bootstrapConfig.deviceId
      });
    } catch (error) {
      if (!options.swallowErrors) {
        console.warn("Falha ao encerrar sessao remota:", error);
      }
    }
  }

  await ARTIFACTS.clearManagedArtifacts(
    sessionState?.managedCookies?.length
      ? { cookies: sessionState.managedCookies }
      : {}
  );

  if (!sessionState) {
    await STORE.clearSessionState();
    return {
      status: CONTRACT.SESSION_STATUS.idle,
      reason
    };
  }

  const finalStatus = options.finalStatus || (
    String(reason || "").includes("expired")
      ? CONTRACT.SESSION_STATUS.expired
      : CONTRACT.SESSION_STATUS.idle
  );

  const snapshot = CONTRACT.createSessionState({
    status: finalStatus,
    mode: sessionState.mode,
    reason: String(reason || ""),
    updatedAt: Date.now()
  });

  await STORE.setSessionState(snapshot);
  return sanitizeSessionState(snapshot);
}

async function startRemoteSession(modeInput) {
  const guard = await ensureNoCookieExtensionConflict();
  if (guard.blocked) {
    throw new Error("Extensao com Cookie/Cookies detectada. A Arbor Sync foi bloqueada.");
  }

  const compatibility = await requireSupportedChrome();
  if (!compatibility.supported) {
    throw new Error(
      `Chrome atual ${compatibility.currentVersion} precisa ser atualizado para ${compatibility.requiredVersion}.`
    );
  }

  const bootstrapConfig = await ensureBootstrapConfig();
  const mode = CONTRACT.normalizeMode(modeInput || bootstrapConfig.mode, RUNTIME.defaultMode);
  if (!bootstrapConfig.licenseKey) {
    throw new Error("Informe uma licenca antes de abrir uma sessao.");
  }

  await stopActiveSession("restart-session", {
    notifyBackend: true,
    swallowErrors: true,
    finalStatus: CONTRACT.SESSION_STATUS.idle
  });

  await STORE.updateBootstrapConfig({
    mode,
    clientVersion: chrome.runtime.getManifest().version
  });

  const pendingState = CONTRACT.createSessionState({
    status: CONTRACT.SESSION_STATUS.starting,
    mode,
    reason: "starting",
    updatedAt: Date.now()
  });
  await STORE.setSessionState(pendingState);

  const startedSession = await CLIENT.startSession({
    licenseKey: bootstrapConfig.licenseKey,
    deviceId: bootstrapConfig.deviceId,
    mode,
    clientVersion: chrome.runtime.getManifest().version
  });

  const baseSession = CONTRACT.createSessionState({
    status: CONTRACT.SESSION_STATUS.starting,
    mode,
    sessionId: startedSession.sessionId,
    sessionToken: startedSession.sessionToken,
    expiresAtMs: Date.parse(startedSession.expiresAt),
    heartbeatEveryMs: Number(startedSession.heartbeatEverySec || 0) * 1000,
    lastHeartbeatAtMs: Date.now(),
    payloadVersion: Number(startedSession.payloadVersion || 0),
    updatedAt: Date.now()
  });
  await STORE.setSessionState(baseSession);

  try {
    const artifacts = await fetchRemotePayload(baseSession);
    await ARTIFACTS.syncManagedArtifacts({
      cookies: artifacts.cookies,
      proxy: artifacts.proxy,
      cookieOptions: {
        fallbackDomain: modeConfigFor(mode).domain
      }
    });
    const preparedSession = CONTRACT.createSessionState({
      ...baseSession,
      targetUrl: artifacts.targetUrl,
      payloadVersion: artifacts.payloadVersion || baseSession.payloadVersion,
      managedCookies: artifacts.cookies,
      managedProxy: artifacts.proxy,
      reason: "",
      updatedAt: Date.now()
    });
    await STORE.setSessionState(preparedSession);

    const openedTab = await createTab({ url: artifacts.targetUrl });
    const activeSession = CONTRACT.createSessionState({
      ...preparedSession,
      status: CONTRACT.SESSION_STATUS.active,
      activeTabId: Number(openedTab?.id || 0),
      openedAtMs: Date.now(),
      updatedAt: Date.now()
    });

    await STORE.setSessionState(activeSession);
    return sanitizeSessionState(activeSession);
  } catch (error) {
    await stopActiveSession("start-failed", {
      notifyBackend: true,
      swallowErrors: true,
      finalStatus: CONTRACT.SESSION_STATUS.error
    });
    throw error;
  }
}

async function refreshActivePayload() {
  const sessionState = await STORE.getSessionState();
  if (!sessionState || !CONTRACT.isSessionActive(sessionState)) {
    return null;
  }

  const artifacts = await fetchRemotePayload(sessionState);
  await ARTIFACTS.syncManagedArtifacts({
    cookies: artifacts.cookies,
    proxy: artifacts.proxy,
    cookieOptions: {
      fallbackDomain: modeConfigFor(sessionState.mode).domain
    }
  });

  const nextSession = CONTRACT.createSessionState({
    ...sessionState,
    targetUrl: artifacts.targetUrl,
    payloadVersion: artifacts.payloadVersion,
    managedCookies: artifacts.cookies,
    managedProxy: artifacts.proxy,
    updatedAt: Date.now()
  });

  await STORE.setSessionState(nextSession);
  return sanitizeSessionState(nextSession);
}

async function handleHeartbeat(message, sender) {
  const sessionState = await STORE.getSessionState();
  if (!sessionState || !CONTRACT.isSessionActive(sessionState)) {
    return {
      success: false,
      ignored: true,
      reason: "no-active-session"
    };
  }

  if (CONTRACT.isSessionExpired(sessionState)) {
    await stopActiveSession("session-expired", {
      notifyBackend: false,
      finalStatus: CONTRACT.SESSION_STATUS.expired
    });
    return {
      success: false,
      reason: "session-expired"
    };
  }

  const senderTabId = Number(sender?.tab?.id || 0);
  if (sessionState.activeTabId && senderTabId && sessionState.activeTabId !== senderTabId) {
    return {
      success: false,
      ignored: true,
      reason: "other-tab"
    };
  }

  const url = String(message?.url || sender?.tab?.url || "");
  if (url && !isControlledUrl(url)) {
    await stopActiveSession("navigated-away", {
      notifyBackend: true,
      swallowErrors: true
    });
    return {
      success: false,
      reason: "navigated-away"
    };
  }

  const nowMs = Date.now();
  const minimumWindowMs = Math.min(
    Math.max(10 * 1000, Number(sessionState.heartbeatEveryMs || RUNTIME.heartbeatIntervalMs) / 2),
    TRANSIENT_HEARTBEAT_WINDOW_MS
  );
  if (
    Number(sessionState.lastHeartbeatAtMs || 0) > 0 &&
    nowMs - Number(sessionState.lastHeartbeatAtMs || 0) < minimumWindowMs &&
    message?.reason !== "startup"
  ) {
    return {
      success: true,
      skipped: true,
      session: sanitizeSessionState(sessionState)
    };
  }

  const bootstrapConfig = await ensureBootstrapConfig();
  try {
    const renewed = await CLIENT.heartbeat({
      sessionToken: sessionState.sessionToken,
      deviceId: bootstrapConfig.deviceId,
      mode: sessionState.mode
    });

    const nextSession = CONTRACT.createSessionState({
      ...sessionState,
      status: CONTRACT.SESSION_STATUS.active,
      expiresAtMs: Date.parse(renewed.expiresAt),
      lastHeartbeatAtMs: nowMs,
      heartbeatEveryMs: Number(renewed.heartbeatEverySec || sessionState.heartbeatEveryMs / 1000 || RUNTIME.heartbeatIntervalMs / 1000) * 1000,
      activeTabId: senderTabId || sessionState.activeTabId,
      targetUrl: url || sessionState.targetUrl,
      reason: "",
      updatedAt: nowMs
    });

    await STORE.setSessionState(nextSession);
    return {
      success: true,
      session: sanitizeSessionState(nextSession)
    };
  } catch (error) {
    const status = Number(error?.status || 0);
    if (status === 403 || status === 409 || status === 410) {
      await stopActiveSession("remote-expired", {
        notifyBackend: false,
        finalStatus: CONTRACT.SESSION_STATUS.expired
      });
    }

    return {
      success: false,
      error: String(error?.message || error),
      status
    };
  }
}

async function initialize() {
  await ensureCompatibilityState();
  const existingSession = await STORE.getSessionState();
  const [managedCookies, managedProxy] = await Promise.all([
    ARTIFACTS.getManagedCookieSnapshot(),
    ARTIFACTS.getManagedProxyConfig()
  ]);

  if (!existingSession && managedCookies.length === 0 && !managedProxy) {
    return;
  }

  if (existingSession) {
    await stopActiveSession("startup-reset", {
      notifyBackend: false,
      swallowErrors: true,
      finalStatus: CONTRACT.SESSION_STATUS.idle
    });
    return;
  }

  await ARTIFACTS.clearManagedArtifacts({});
}

function handleProxyAuth(details, callback) {
  if (!details.isProxy) {
    callback({});
    return;
  }

  callback({});
}

chrome.webRequest.onAuthRequired.addListener(
  handleProxyAuth,
  { urls: ["<all_urls>"] },
  ["asyncBlocking"]
);

chrome.runtime.onInstalled.addListener(() => {
  void initialize().catch((error) => {
    console.error("Falha no initialize (onInstalled):", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  void initialize().catch((error) => {
    console.error("Falha no initialize (onStartup):", error);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void STORE.getSessionState()
    .then((sessionState) => {
      if (sessionState?.activeTabId === tabId) {
        return stopActiveSession("tab-closed", {
          notifyBackend: true,
          swallowErrors: true
        });
      }

      return null;
    })
    .catch((error) => {
      console.error("Falha ao tratar fechamento de aba:", error);
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) {
    return;
  }

  void STORE.getSessionState()
    .then((sessionState) => {
      if (sessionState?.activeTabId !== tabId) {
        return null;
      }

      if (!isControlledUrl(changeInfo.url)) {
        return stopActiveSession("navigated-away", {
          notifyBackend: true,
          swallowErrors: true
        });
      }

      return STORE.setSessionState(
        CONTRACT.createSessionState({
          ...sessionState,
          targetUrl: changeInfo.url,
          mode: modeForUrl(changeInfo.url) || sessionState.mode,
          updatedAt: Date.now()
        })
      );
    })
    .catch((error) => {
      console.error("Falha ao tratar atualizacao de aba:", error);
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "saveBootstrapConfig") {
    void ensureBootstrapConfig()
      .then((bootstrapConfig) =>
        STORE.setBootstrapConfig(
          CONTRACT.createBootstrapConfig({
            ...bootstrapConfig,
            licenseKey: String(message.licenseKey || "").trim(),
            mode: CONTRACT.normalizeMode(message.mode || bootstrapConfig.mode, bootstrapConfig.mode),
            clientVersion: chrome.runtime.getManifest().version,
            updatedAt: Date.now()
          })
        )
      )
      .then((savedBootstrap) => sendResponse({ success: true, bootstrapConfig: sanitizeBootstrapConfig(savedBootstrap) }))
      .catch((error) => sendResponse({ success: false, error: String(error?.message || error) }));
    return true;
  }

  if (message.action === CONTRACT.MESSAGE_TYPES.getStatus) {
    void buildStatusResponse()
      .then((status) => sendResponse(status))
      .catch((error) =>
        sendResponse({
          ready: false,
          error: String(error?.message || error)
        })
      );
    return true;
  }

  if (message.action === "setMode") {
    void ensureBootstrapConfig()
      .then((bootstrapConfig) =>
        STORE.setBootstrapConfig(
          CONTRACT.createBootstrapConfig({
            ...bootstrapConfig,
            mode: CONTRACT.normalizeMode(message.mode, bootstrapConfig.mode),
            clientVersion: chrome.runtime.getManifest().version,
            updatedAt: Date.now()
          })
        )
      )
      .then((savedBootstrap) => sendResponse({ success: true, mode: savedBootstrap.mode }))
      .catch((error) => sendResponse({ success: false, error: String(error?.message || error) }));
    return true;
  }

  if (message.action === "startSession" || message.action === "openSite") {
    void startRemoteSession(message.mode)
      .then((session) => sendResponse({ success: true, session }))
      .catch((error) => sendResponse({ success: false, error: String(error?.message || error) }));
    return true;
  }

  if (message.action === CONTRACT.MESSAGE_TYPES.stopSession) {
    void stopActiveSession(String(message.reason || "manual-stop"), {
      notifyBackend: true,
      swallowErrors: true
    })
      .then((session) => sendResponse({ success: true, session }))
      .catch((error) => sendResponse({ success: false, error: String(error?.message || error) }));
    return true;
  }

  if (message.action === CONTRACT.MESSAGE_TYPES.heartbeat) {
    void handleHeartbeat(message, sender)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: String(error?.message || error) }));
    return true;
  }

  if (message.action === "reloadCookies") {
    void refreshActivePayload()
      .then((session) => sendResponse({ success: true, session }))
      .catch((error) => sendResponse({ success: false, error: String(error?.message || error) }));
    return true;
  }
});

self.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled rejection capturada:", event.reason);
});
