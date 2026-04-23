(function () {
  const CONTRACT = globalThis.ArborSessionContract;
  const STORE = globalThis.ArborSessionStore;
  const CLIENT = globalThis.ArborSessionClient;
  const STATUS = globalThis.ArborServiceWorkerStatus;
  const SESSION = globalThis.ArborServiceWorkerSession;

  function firstEnabledMode(enabledModes, fallbackMode) {
    return Array.isArray(enabledModes) && enabledModes.length > 0
      ? enabledModes[0]
      : fallbackMode;
  }

  function assertModeEnabled(bootstrapConfig, mode) {
    if (!CONTRACT.isModeEnabled(bootstrapConfig?.enabledModes, mode)) {
      throw new Error("Produto nao incluso nesta licenca.");
    }
  }

  async function saveBootstrapConfig(message) {
    const bootstrapConfig = await STATUS.ensureBootstrapConfig();
    const licenseKey = String(message.licenseKey || "").trim();
    const mode = CONTRACT.normalizeMode(message.mode || bootstrapConfig.mode, bootstrapConfig.mode);
    const clientVersion = chrome.runtime.getManifest().version;
    const licenseStatus = await CLIENT.getLicenseStatus({
      licenseKey,
      deviceId: bootstrapConfig.deviceId,
      clientVersion
    });
    const enabledModes = CONTRACT.normalizeEnabledModes(licenseStatus?.enabledModes) || [];
    const savedBootstrap = await STORE.setBootstrapConfig(
      CONTRACT.createBootstrapConfig({
        ...bootstrapConfig,
        licenseKey,
        mode: CONTRACT.isModeEnabled(enabledModes, mode) ? mode : firstEnabledMode(enabledModes, mode),
        enabledModes,
        clientVersion,
        updatedAt: Date.now()
      })
    );

    return {
      success: true,
      bootstrapConfig: STATUS.sanitizeBootstrapConfig(savedBootstrap)
    };
  }

  function setMode(message) {
    return STATUS.ensureBootstrapConfig()
      .then((bootstrapConfig) => {
        const mode = CONTRACT.normalizeMode(message.mode, bootstrapConfig.mode);
        assertModeEnabled(bootstrapConfig, mode);
        return STORE.setBootstrapConfig(
          CONTRACT.createBootstrapConfig({
            ...bootstrapConfig,
            mode,
            clientVersion: chrome.runtime.getManifest().version,
            updatedAt: Date.now()
          })
        );
      })
      .then((savedBootstrap) => ({
        success: true,
        mode: savedBootstrap.mode
      }));
  }

  function handleMessage(message, sender, sendResponse) {
    if (message.action === CONTRACT.MESSAGE_TYPES.saveBootstrapConfig || message.action === "saveBootstrapConfig") {
      void saveBootstrapConfig(message)
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: String(error?.message || error) }));
      return true;
    }

    if (message.action === CONTRACT.MESSAGE_TYPES.getStatus) {
      void SESSION.reconcileRuntimeState()
        .then(() => STATUS.buildStatusResponse())
        .then(sendResponse)
        .catch((error) => sendResponse({ ready: false, error: String(error?.message || error) }));
      return true;
    }

    if (message.action === "setMode") {
      void setMode(message)
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: String(error?.message || error) }));
      return true;
    }

    if (message.action === "startSession" || message.action === "openSite") {
      void SESSION.startRemoteSession(message.mode)
        .then((session) => sendResponse({ success: true, session }))
        .catch((error) => sendResponse({ success: false, error: String(error?.message || error) }));
      return true;
    }

    if (message.action === CONTRACT.MESSAGE_TYPES.stopSession) {
      void SESSION.stopActiveSession(String(message.reason || "manual-stop"), {
        notifyBackend: true,
        swallowErrors: true
      })
        .then((session) => sendResponse({ success: true, session }))
        .catch((error) => sendResponse({ success: false, error: String(error?.message || error) }));
      return true;
    }

    if (message.action === CONTRACT.MESSAGE_TYPES.heartbeat) {
      void SESSION.handleHeartbeat(message, sender)
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: String(error?.message || error) }));
      return true;
    }

    if (message.action === "reloadCookies") {
      void SESSION.refreshActivePayload()
        .then((session) => sendResponse({ success: true, session }))
        .catch((error) => sendResponse({ success: false, error: String(error?.message || error) }));
      return true;
    }

    return false;
  }

  globalThis.ArborServiceWorkerRouter = Object.freeze({
    handleMessage
  });
})();
