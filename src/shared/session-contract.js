(function () {
  const MODES = Object.freeze({
    gpt: "gpt",
    gemini: "gemini",
    claude: "claude"
  });

  const SESSION_STATUS = Object.freeze({
    idle: "idle",
    starting: "starting",
    active: "active",
    expiring: "expiring",
    expired: "expired",
    error: "error"
  });

  const MESSAGE_TYPES = Object.freeze({
    getStatus: "getStatus",
    startSession: "startSession",
    stopSession: "stopSession",
    heartbeat: "heartbeat",
    saveBootstrapConfig: "saveBootstrapConfig"
  });

  const STORAGE_KEYS = Object.freeze({
    bootstrapConfig: "arbor_remote_bootstrap_config",
    sessionState: "arbor_remote_session_state",
    proxyState: "arbor_remote_proxy_state",
    proxyBackupState: "arbor_remote_proxy_backup_state",
    cookieState: "arbor_remote_cookie_state",
    cookieBackupState: "arbor_remote_cookie_backup_state",
    runtimeState: "arbor_remote_runtime_state"
  });

  function isMode(value) {
    return value === MODES.gpt || value === MODES.gemini || value === MODES.claude;
  }

  function normalizeMode(value, fallback = MODES.gpt) {
    return isMode(value) ? value : fallback;
  }

  function normalizeEnabledModes(value) {
    if (!Array.isArray(value)) {
      return null;
    }

    const enabledModes = [];
    value.forEach((mode) => {
      const normalizedMode = normalizeMode(mode, "");
      if (normalizedMode && !enabledModes.includes(normalizedMode)) {
        enabledModes.push(normalizedMode);
      }
    });

    return Object.freeze(enabledModes);
  }

  function isModeEnabled(enabledModes, mode) {
    const normalizedMode = normalizeMode(mode, "");
    return !Array.isArray(enabledModes) || enabledModes.includes(normalizedMode);
  }

  function isSessionStatus(value) {
    return (
      value === SESSION_STATUS.idle ||
      value === SESSION_STATUS.starting ||
      value === SESSION_STATUS.active ||
      value === SESSION_STATUS.expiring ||
      value === SESSION_STATUS.expired ||
      value === SESSION_STATUS.error
    );
  }

  function normalizeStatus(value, fallback = SESSION_STATUS.idle) {
    return isSessionStatus(value) ? value : fallback;
  }

  function createBootstrapConfig(partial = {}) {
    const bootstrapConfig = {
      licenseKey: String(partial.licenseKey || "").trim(),
      deviceId: String(partial.deviceId || "").trim(),
      mode: normalizeMode(partial.mode, MODES.gpt),
      enabledModes: normalizeEnabledModes(partial.enabledModes),
      clientVersion: String(partial.clientVersion || "").trim(),
      updatedAt: Number.isFinite(partial.updatedAt) ? partial.updatedAt : Date.now()
    };

    return Object.freeze(bootstrapConfig);
  }

  function createSessionState(partial = {}) {
    const expiresAtMs = Number(partial.expiresAtMs);
    const lastHeartbeatAtMs = Number(partial.lastHeartbeatAtMs);
    const activeTabId = Number(partial.activeTabId);
    const payloadVersion = Number(partial.payloadVersion);
    const openedAtMs = Number(partial.openedAtMs);

    const sessionState = {
      status: normalizeStatus(partial.status, SESSION_STATUS.idle),
      mode: normalizeMode(partial.mode, MODES.gpt),
      sessionId: String(partial.sessionId || "").trim(),
      sessionToken: String(partial.sessionToken || "").trim(),
      runtimeId: String(partial.runtimeId || "").trim(),
      expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : 0,
      lastHeartbeatAtMs: Number.isFinite(lastHeartbeatAtMs) ? lastHeartbeatAtMs : 0,
      heartbeatEveryMs: Number.isFinite(partial.heartbeatEveryMs) ? partial.heartbeatEveryMs : 0,
      activeTabId: Number.isFinite(activeTabId) ? activeTabId : 0,
      targetUrl: String(partial.targetUrl || "").trim(),
      payloadVersion: Number.isFinite(payloadVersion) ? payloadVersion : 0,
      openedAtMs: Number.isFinite(openedAtMs) ? openedAtMs : 0,
      managedCookies: Array.isArray(partial.managedCookies) ? partial.managedCookies : [],
      managedProxy: partial.managedProxy || null,
      reason: String(partial.reason || "").trim(),
      updatedAt: Number.isFinite(partial.updatedAt) ? partial.updatedAt : Date.now()
    };

    return Object.freeze(sessionState);
  }

  function isSessionActive(sessionState) {
    return Boolean(sessionState && sessionState.status === SESSION_STATUS.active);
  }

  function isSessionExpired(sessionState, nowMs = Date.now()) {
    if (!sessionState) {
      return true;
    }

    if (sessionState.status === SESSION_STATUS.expired) {
      return true;
    }

    return Number.isFinite(sessionState.expiresAtMs) && sessionState.expiresAtMs > 0
      ? nowMs >= sessionState.expiresAtMs
      : false;
  }

  function createStatusSnapshot(partial = {}) {
    return Object.freeze({
      status: normalizeStatus(partial.status, SESSION_STATUS.idle),
      mode: normalizeMode(partial.mode, MODES.gpt),
      sessionId: String(partial.sessionId || "").trim(),
      message: String(partial.message || "").trim(),
      updatedAt: Number.isFinite(partial.updatedAt) ? partial.updatedAt : Date.now()
    });
  }

  globalThis.ArborSessionContract = Object.freeze({
    MODES,
    SESSION_STATUS,
    MESSAGE_TYPES,
    STORAGE_KEYS,
    isMode,
    normalizeMode,
    normalizeEnabledModes,
    isModeEnabled,
    isSessionStatus,
    normalizeStatus,
    createBootstrapConfig,
    createSessionState,
    createStatusSnapshot,
    isSessionActive,
    isSessionExpired
  });
})();
