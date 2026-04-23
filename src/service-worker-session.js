(function () {
  const CONTRACT = globalThis.ArborSessionContract;
  const RUNTIME = globalThis.ArborRuntimeConfig;
  const STORE = globalThis.ArborSessionStore;
  const CLIENT = globalThis.ArborSessionClient;
  const ARTIFACTS = globalThis.ArborCookieProxyManager;
  const GUARDS = globalThis.ArborServiceWorkerGuards;
  const STATUS = globalThis.ArborServiceWorkerStatus;
  const ARTIFACT_HELPERS = globalThis.ArborServiceWorkerArtifacts;
  const LIFECYCLE = globalThis.ArborServiceWorkerRuntime;
  const TRANSIENT_HEARTBEAT_WINDOW_MS = 20 * 1000;

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

  async function ensureNoCookieExtensionConflict() {
    const guard = await GUARDS.refreshExtensionGuardState();
    if (guard.blocked) {
      await ARTIFACTS.clearManagedArtifacts({});
    }

    return guard;
  }

  async function stopActiveSession(reason, options = {}) {
    const sessionState = await STORE.getSessionState();
    if (sessionState?.sessionToken && options.notifyBackend !== false) {
      try {
        const bootstrapConfig = await STATUS.ensureBootstrapConfig();
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
      sessionState?.managedCookies?.length ? { cookies: sessionState.managedCookies } : {}
    );
    await LIFECYCLE.clearRuntimeState();

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
    return STATUS.sanitizeSessionState(snapshot);
  }

  async function startRemoteSession(modeInput) {
    const guard = await ensureNoCookieExtensionConflict();
    if (guard.blocked) {
      throw new Error("Extensao com Cookie/Cookies detectada. A Arbor Sync foi bloqueada.");
    }

    const compatibility = await GUARDS.ensureCompatibilityState();
    if (!compatibility.supported) {
      throw new Error(`Chrome atual ${compatibility.currentVersion} precisa ser atualizado para ${compatibility.requiredVersion}.`);
    }

    const bootstrapConfig = await STATUS.ensureBootstrapConfig();
    const mode = CONTRACT.normalizeMode(modeInput || bootstrapConfig.mode, RUNTIME.defaultMode);
    if (!bootstrapConfig.licenseKey) {
      throw new Error("Informe uma licenca antes de abrir uma sessao.");
    }

    if (!CONTRACT.isModeEnabled(bootstrapConfig.enabledModes, mode)) {
      throw new Error("Produto nao incluso nesta licenca.");
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
    await STORE.setSessionState(CONTRACT.createSessionState({
      status: CONTRACT.SESSION_STATUS.starting,
      mode,
      reason: "starting",
      updatedAt: Date.now()
    }));

    const startedSession = await CLIENT.startSession({
      licenseKey: bootstrapConfig.licenseKey,
      deviceId: bootstrapConfig.deviceId,
      mode,
      clientVersion: chrome.runtime.getManifest().version
    });
    await STORE.updateBootstrapConfig({
      mode,
      enabledModes: CONTRACT.normalizeEnabledModes(startedSession.enabledModes) || bootstrapConfig.enabledModes,
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
      const artifacts = await ARTIFACT_HELPERS.fetchRemotePayload(baseSession);
      await ARTIFACTS.syncManagedArtifacts({
        cookies: artifacts.cookies,
        proxy: artifacts.proxy,
        cookieOptions: {
          fallbackDomain: GUARDS.modeConfigFor(mode).domain
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
      const openedTab = await createTab({ url: artifacts.targetUrl });
      const activeSession = await LIFECYCLE.markActiveSession(CONTRACT.createSessionState({
        ...preparedSession,
        status: CONTRACT.SESSION_STATUS.active,
        activeTabId: Number(openedTab?.id || 0),
        openedAtMs: Date.now(),
        updatedAt: Date.now()
      }));

      await STORE.setSessionState(activeSession);
      return STATUS.sanitizeSessionState(activeSession);
    } catch (error) {
      await stopActiveSession("start-failed", {
        notifyBackend: true,
        swallowErrors: true,
        finalStatus: CONTRACT.SESSION_STATUS.error
      });
      throw error;
    }
  }

  async function handleHeartbeat(message, sender) {
    const sessionState = await LIFECYCLE.reconcileRuntimeState();
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
    if (url && !GUARDS.isControlledUrl(url)) {
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
        session: STATUS.sanitizeSessionState(sessionState)
      };
    }

    const bootstrapConfig = await STATUS.ensureBootstrapConfig();

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
        session: STATUS.sanitizeSessionState(nextSession)
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
    await GUARDS.ensureCompatibilityState();
    await LIFECYCLE.reconcileRuntimeState();
  }

  async function handleTabRemoved(tabId) {
    const sessionState = await STORE.getSessionState();
    if (sessionState?.activeTabId === tabId) {
      await stopActiveSession("tab-closed", {
        notifyBackend: true,
        swallowErrors: true
      });
    }
  }

  async function handleTabUpdated(tabId, url) {
    const sessionState = await STORE.getSessionState();
    if (sessionState?.activeTabId !== tabId) {
      return;
    }

    if (!GUARDS.isControlledUrl(url)) {
      await stopActiveSession("navigated-away", {
        notifyBackend: true,
        swallowErrors: true
      });
      return;
    }

    await STORE.setSessionState(CONTRACT.createSessionState({
      ...sessionState,
      targetUrl: url,
      mode: GUARDS.modeForUrl(url) || sessionState.mode,
      updatedAt: Date.now()
    }));
  }

  globalThis.ArborServiceWorkerSession = Object.freeze({
    initialize,
    stopActiveSession,
    startRemoteSession,
    refreshActivePayload: ARTIFACT_HELPERS.refreshActivePayload,
    reconcileRuntimeState: LIFECYCLE.reconcileRuntimeState,
    handleHeartbeat,
    handleTabRemoved,
    handleTabUpdated
  });
})();
