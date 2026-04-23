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
    return globalThis.chrome?.storage?.[name] || null;
  }

  function invokeStorage(area, method, payload) {
    return new Promise((resolve, reject) => {
      if (!area) {
        resolve(null);
        return;
      }

      try {
        area[method](payload, () => {
          const lastError = globalThis.chrome?.runtime?.lastError;
          if (lastError) {
            reject(new Error(lastError.message));
            return;
          }

          resolve(true);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function uniqueByKey(items, keyFn) {
    const seen = new Set();
    const result = [];

    for (const item of toArray(items)) {
      const key = keyFn(item);
      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(item);
    }

    return result;
  }

  async function readStoredValue(key) {
    const area = storageArea("local");
    if (!area) {
      return null;
    }

    return new Promise((resolve, reject) => {
      area.get([key], (result) => {
        const lastError = globalThis.chrome?.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        resolve(result && Object.prototype.hasOwnProperty.call(result, key) ? result[key] : null);
      });
    });
  }

  async function writeStoredValue(key, value) {
    const area = storageArea("local");
    if (!area) {
      return value;
    }

    await invokeStorage(area, "set", { [key]: value });
    return value;
  }

  async function removeStoredValue(key) {
    const area = storageArea("local");
    if (!area) {
      return;
    }

    await invokeStorage(area, "remove", key);
  }

  async function persistArraySnapshot(key, items) {
    if (items.length === 0) {
      await removeStoredValue(key);
      return [];
    }

    await writeStoredValue(key, items);
    return items;
  }

  globalThis.ArborCookieProxyStorage = Object.freeze({
    STORAGE_KEYS,
    invokeStorage,
    toArray,
    uniqueByKey,
    readStoredValue,
    writeStoredValue,
    removeStoredValue,
    persistArraySnapshot
  });
})();
