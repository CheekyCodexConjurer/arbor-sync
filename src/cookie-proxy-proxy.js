(function () {
  const STORAGE = globalThis.ArborCookieProxyStorage;
  const { STORAGE_KEYS, readStoredValue, writeStoredValue, removeStoredValue } = STORAGE;

  function normalizeProxyConfig(proxyConfig) {
    if (!proxyConfig) {
      return null;
    }

    if (proxyConfig.value && typeof proxyConfig.value === "object") {
      return {
        ...proxyConfig.value,
        auth: Array.isArray(proxyConfig.auth) ? proxyConfig.auth : proxyConfig.value.auth
      };
    }

    if (proxyConfig.mode) {
      return {
        mode: proxyConfig.mode,
        pacScript: proxyConfig.pacScript || undefined,
        rules: proxyConfig.rules || undefined,
        auth: Array.isArray(proxyConfig.auth) ? proxyConfig.auth : undefined,
        scope: proxyConfig.scope || "regular"
      };
    }

    if (proxyConfig.pacScript || proxyConfig.rules) {
      return {
        mode: proxyConfig.pacScript ? "pac_script" : "fixed_servers",
        pacScript: proxyConfig.pacScript || undefined,
        rules: proxyConfig.rules || undefined,
        auth: Array.isArray(proxyConfig.auth) ? proxyConfig.auth : undefined,
        scope: proxyConfig.scope || "regular"
      };
    }

    return null;
  }

  function proxySignature(proxyConfig) {
    return proxyConfig ? JSON.stringify(proxyConfig) : "";
  }

  async function getManagedProxyConfig() {
    return (await readStoredValue(STORAGE_KEYS.proxyState)) || null;
  }

  async function getProxyBackupConfig() {
    return (await readStoredValue(STORAGE_KEYS.proxyBackupState)) || null;
  }

  async function getCurrentBrowserProxyConfig() {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome?.proxy?.settings?.get) {
        resolve(null);
        return;
      }

      globalThis.chrome.proxy.settings.get({ incognito: false }, (result) => {
        const lastError = globalThis.chrome?.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        resolve(result || null);
      });
    });
  }

  async function applyProxyConfig(proxyConfig, options = {}) {
    const normalized = normalizeProxyConfig(proxyConfig);
    const scope = String(options.scope || normalized?.scope || "regular");
    const current = await getManagedProxyConfig();

    if (proxySignature({ ...normalized, scope }) === proxySignature(current)) {
      return Object.freeze({
        changed: false,
        proxy: current
      });
    }

    if (!normalized) {
      return clearProxyConfig(options);
    }

    const backup = await getProxyBackupConfig();
    if (!backup && !current) {
      const browserProxy = await getCurrentBrowserProxyConfig();
      if (browserProxy?.value) {
        await writeStoredValue(STORAGE_KEYS.proxyBackupState, {
          value: browserProxy.value,
          scope
        });
      }
    }

    const proxyValue = { ...normalized };
    delete proxyValue.scope;
    delete proxyValue.auth;

    await new Promise((resolve, reject) => {
      if (!globalThis.chrome?.proxy?.settings?.set) {
        resolve(null);
        return;
      }

      globalThis.chrome.proxy.settings.set({ value: proxyValue, scope }, () => {
        const lastError = globalThis.chrome?.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        resolve(true);
      });
    });

    const storedProxy = Object.freeze({ ...normalized, scope });
    await writeStoredValue(STORAGE_KEYS.proxyState, storedProxy);

    return Object.freeze({
      changed: true,
      proxy: storedProxy
    });
  }

  async function clearProxyConfig(options = {}) {
    const scope = String(options.scope || "regular");
    const current = await getManagedProxyConfig();
    const backup = await getProxyBackupConfig();

    if (!current && !backup) {
      return Object.freeze({
        changed: false,
        proxy: null
      });
    }

    await new Promise((resolve, reject) => {
      if (!globalThis.chrome?.proxy?.settings) {
        resolve(null);
        return;
      }

      const callback = () => {
        const lastError = globalThis.chrome?.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        resolve(true);
      };

      if (backup?.value && globalThis.chrome.proxy.settings.set) {
        globalThis.chrome.proxy.settings.set(
          {
            value: backup.value,
            scope: backup.scope || scope
          },
          callback
        );
        return;
      }

      if (!globalThis.chrome.proxy.settings.clear) {
        resolve(null);
        return;
      }

      globalThis.chrome.proxy.settings.clear({ scope }, callback);
    });

    await removeStoredValue(STORAGE_KEYS.proxyState);
    await removeStoredValue(STORAGE_KEYS.proxyBackupState);

    return Object.freeze({
      changed: true,
      proxy: null
    });
  }

  globalThis.ArborCookieProxyProxy = Object.freeze({
    getManagedProxyConfig,
    applyProxyConfig,
    clearProxyConfig
  });
})();
