(function () {
  const CONTRACT = globalThis.ArborSessionContract || {};
  const STORAGE_KEYS = CONTRACT.STORAGE_KEYS || Object.freeze({
    bootstrapConfig: "arbor_remote_bootstrap_config",
    sessionState: "arbor_remote_session_state",
    proxyState: "arbor_remote_proxy_state",
    proxyBackupState: "arbor_remote_proxy_backup_state",
    cookieState: "arbor_remote_cookie_state",
    cookieBackupState: "arbor_remote_cookie_backup_state"
  });

  function storageArea(name) {
    const area = globalThis.chrome?.storage?.[name];
    if (!area) {
      throw new Error(`chrome.storage.${name} is unavailable.`);
    }

    return area;
  }

  function invokeStorage(area, method, payload) {
    return new Promise((resolve, reject) => {
      const callback = (result) => {
        const lastError = globalThis.chrome?.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        resolve(result);
      };

      try {
        if (method === "get") {
          area.get(payload, callback);
          return;
        }

        if (method === "set") {
          area.set(payload, callback);
          return;
        }

        if (method === "remove") {
          area.remove(payload, callback);
          return;
        }

        throw new Error(`Unsupported storage method: ${method}`);
      } catch (error) {
        reject(error);
      }
    });
  }

  function normalizeBootstrapConfig(value) {
    if (CONTRACT.createBootstrapConfig) {
      return CONTRACT.createBootstrapConfig(value || {});
    }

    return Object.freeze({
      licenseKey: String(value?.licenseKey || "").trim(),
      deviceId: String(value?.deviceId || "").trim(),
      mode: CONTRACT.normalizeMode ? CONTRACT.normalizeMode(value?.mode, CONTRACT.MODES?.gpt || "gpt") : String(value?.mode || "gpt"),
      clientVersion: String(value?.clientVersion || "").trim(),
      updatedAt: Number.isFinite(value?.updatedAt) ? value.updatedAt : Date.now()
    });
  }

  function normalizeSessionState(value) {
    if (CONTRACT.createSessionState) {
      return CONTRACT.createSessionState(value || {});
    }

    return Object.freeze({
      status: CONTRACT.normalizeStatus ? CONTRACT.normalizeStatus(value?.status, CONTRACT.SESSION_STATUS?.idle || "idle") : String(value?.status || "idle"),
      mode: CONTRACT.normalizeMode ? CONTRACT.normalizeMode(value?.mode, CONTRACT.MODES?.gpt || "gpt") : String(value?.mode || "gpt"),
      sessionId: String(value?.sessionId || "").trim(),
      sessionToken: String(value?.sessionToken || "").trim(),
      expiresAtMs: Number.isFinite(value?.expiresAtMs) ? value.expiresAtMs : 0,
      lastHeartbeatAtMs: Number.isFinite(value?.lastHeartbeatAtMs) ? value.lastHeartbeatAtMs : 0,
      heartbeatEveryMs: Number.isFinite(value?.heartbeatEveryMs) ? value.heartbeatEveryMs : 0,
      managedCookies: Array.isArray(value?.managedCookies) ? value.managedCookies : [],
      managedProxy: value?.managedProxy || null,
      reason: String(value?.reason || "").trim(),
      updatedAt: Number.isFinite(value?.updatedAt) ? value.updatedAt : Date.now()
    });
  }

  async function readRecord(areaName, key) {
    const result = await invokeStorage(storageArea(areaName), "get", [key]);
    return result && Object.prototype.hasOwnProperty.call(result, key) ? result[key] : null;
  }

  async function writeRecord(areaName, key, value) {
    await invokeStorage(storageArea(areaName), "set", { [key]: value });
    return value;
  }

  async function removeRecord(areaName, key) {
    await invokeStorage(storageArea(areaName), "remove", key);
  }

  async function getBootstrapConfig() {
    const value = await readRecord("local", STORAGE_KEYS.bootstrapConfig);
    return value ? normalizeBootstrapConfig(value) : null;
  }

  async function setBootstrapConfig(nextConfig) {
    const normalized = normalizeBootstrapConfig(nextConfig);
    await writeRecord("local", STORAGE_KEYS.bootstrapConfig, normalized);
    return normalized;
  }

  async function clearBootstrapConfig() {
    await removeRecord("local", STORAGE_KEYS.bootstrapConfig);
  }

  async function updateBootstrapConfig(patch) {
    const current = (await getBootstrapConfig()) || normalizeBootstrapConfig();
    return setBootstrapConfig({ ...current, ...patch, updatedAt: Date.now() });
  }

  async function getSessionState() {
    const value = await readRecord("local", STORAGE_KEYS.sessionState);
    return value ? normalizeSessionState(value) : null;
  }

  async function setSessionState(nextState) {
    const normalized = normalizeSessionState(nextState);
    await writeRecord("local", STORAGE_KEYS.sessionState, normalized);
    return normalized;
  }

  async function updateSessionState(patch) {
    const current = (await getSessionState()) || normalizeSessionState();
    return setSessionState({ ...current, ...patch, updatedAt: Date.now() });
  }

  async function clearSessionState() {
    await removeRecord("local", STORAGE_KEYS.sessionState);
  }

  async function snapshot() {
    const [bootstrapConfig, sessionState] = await Promise.all([
      getBootstrapConfig(),
      getSessionState()
    ]);

    return Object.freeze({
      bootstrapConfig,
      sessionState
    });
  }

  globalThis.ArborSessionStore = Object.freeze({
    storageKeys: STORAGE_KEYS,
    getBootstrapConfig,
    setBootstrapConfig,
    updateBootstrapConfig,
    clearBootstrapConfig,
    getSessionState,
    setSessionState,
    updateSessionState,
    clearSessionState,
    snapshot
  });
})();
