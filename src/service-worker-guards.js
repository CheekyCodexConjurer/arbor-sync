(function () {
  const CONTRACT = globalThis.ArborSessionContract;
  const RUNTIME = globalThis.ArborRuntimeConfig;

  const MODES = Object.freeze({
    gpt: Object.freeze({
      domain: "chatgpt.com",
      targetUrl: "https://chatgpt.com/"
    })
  });

  const COOKIE_EXTENSION_MATCHER = /cookie/i;
  let compatibilityPromise = null;
  let compatibilityState = {
    checking: true,
    supported: false,
    currentVersion: "",
    requiredVersion: "",
    platformKey: "",
    updateUrl: ChromeVersionGate.updateUrl,
    error: ""
  };

  function modeConfigFor(mode) {
    return MODES[CONTRACT.normalizeMode(mode, RUNTIME.defaultMode)];
  }

  function isControlledUrl(url) {
    try {
      return RUNTIME.controlledOrigins.includes(new URL(url).origin);
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
      return hostname === "chatgpt.com"
        ? CONTRACT.MODES.gpt
        : null;
    } catch {
      return null;
    }
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
      compatibilityState = {
        checking: false,
        error: "",
        ...await ChromeVersionGate.checkCompatibility()
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

    compatibilityPromise = Promise.resolve(compatibilityState);
    return compatibilityState;
  }

  function ensureCompatibilityState() {
    if (!compatibilityPromise) {
      compatibilityPromise = refreshCompatibilityState();
    }

    return compatibilityPromise;
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
      const conflicts = (await getManagementExtensions())
        .filter((extension) => extension && extension.id !== chrome.runtime.id)
        .filter((extension) => extension.enabled !== false)
        .filter((extension) => COOKIE_EXTENSION_MATCHER.test(String(extension.name || "")))
        .map((extension) => ({
          id: extension.id,
          name: extension.name,
          enabled: extension.enabled !== false
        }));

      return {
        checked: true,
        blocked: conflicts.length > 0,
        conflictingExtensions: conflicts,
        error: ""
      };
    } catch (error) {
      return {
        checked: true,
        blocked: true,
        conflictingExtensions: [],
        error: String(error?.message || error)
      };
    }
  }

  globalThis.ArborServiceWorkerGuards = Object.freeze({
    MODES,
    modeConfigFor,
    modeForUrl,
    isControlledUrl,
    ensureCompatibilityState,
    refreshCompatibilityState,
    refreshExtensionGuardState
  });
})();
