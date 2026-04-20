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

  function extractCookieHost(cookie) {
    const directDomain = String(cookie?.domain || "").trim();
    if (directDomain) {
      return directDomain.replace(/^\./, "").toLowerCase();
    }

    try {
      return new URL(String(cookie?.url || "")).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  function cookieIdentity(cookie) {
    if (!cookie) {
      return "";
    }

    const host = extractCookieHost(cookie);
    const hostScope = cookie?.hostOnly === true ? "host" : "domain";
    const name = String(cookie.name || "").trim();
    const path = String(cookie.path || "/").trim();
    const storeId = String(cookie.storeId || "0").trim();
    return `${storeId}|${hostScope}|${host}|${name}|${path}`;
  }

  function buildCookieUrl(cookie) {
    if (cookie?.url) {
      return String(cookie.url).trim();
    }

    const host = extractCookieHost(cookie);
    const path = String(cookie?.path || "/").trim() || "/";
    const secure = cookie?.secure !== false;
    const protocol = secure ? "https" : "http";
    if (!host) {
      return "";
    }

    return `${protocol}://${host}${path}`;
  }

  function normalizeCookie(cookie, fallbackDomain) {
    const hostOnly = cookie?.hostOnly === true;
    const rawDomain = String(cookie?.domain || fallbackDomain || "").trim();
    const host = rawDomain.replace(/^\./, "");
    const path = String(cookie?.path || "/").trim() || "/";
    const normalized = {
      url: buildCookieUrl({
        ...cookie,
        domain: host,
        path
      }),
      name: String(cookie?.name || "").trim(),
      value: String(cookie?.value || ""),
      path,
      hostOnly,
      secure: Boolean(cookie?.secure),
      httpOnly: Boolean(cookie?.httpOnly),
      sameSite: cookie?.sameSite || "unspecified",
      storeId: String(cookie?.storeId || "0")
    };

    if (rawDomain && !hostOnly) {
      normalized.domain = rawDomain;
    }

    if (cookie?.expirationDate !== undefined && cookie?.expirationDate !== null && cookie?.session !== true) {
      normalized.expirationDate = Math.floor(Number(cookie.expirationDate));
    }

    if (cookie?.partitionKey) {
      normalized.partitionKey = cookie.partitionKey;
    }

    return normalized;
  }

  function snapshotCookie(cookie) {
    return normalizeCookie(
      {
        ...cookie,
        domain: String(cookie?.domain || "").trim(),
        hostOnly: cookie?.hostOnly === true,
        session: cookie?.session === true
      },
      extractCookieHost(cookie)
    );
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

  function cookieLookupMap(cookies) {
    return new Map(toArray(cookies).map((cookie) => [cookieIdentity(cookie), cookie]));
  }

  async function getManagedCookieSnapshot() {
    const snapshot = await readStoredValue(STORAGE_KEYS.cookieState);
    return Array.isArray(snapshot) ? snapshot : [];
  }

  async function getCookieBackupSnapshot() {
    const snapshot = await readStoredValue(STORAGE_KEYS.cookieBackupState);
    return Array.isArray(snapshot) ? snapshot : [];
  }

  async function findExistingCookie(cookie) {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome?.cookies?.getAll) {
        resolve(null);
        return;
      }

      const host = extractCookieHost(cookie);
      globalThis.chrome.cookies.getAll(
        {
          domain: host,
          name: cookie.name,
          path: cookie.path,
          storeId: cookie.storeId
        },
        (results) => {
          const lastError = globalThis.chrome?.runtime?.lastError;
          if (lastError) {
            reject(new Error(lastError.message));
            return;
          }

          const match = toArray(results).find((candidate) => {
            return (
              String(candidate.path || "/") === String(cookie.path || "/") &&
              String(candidate.storeId || "0") === String(cookie.storeId || "0") &&
              Boolean(candidate.hostOnly) === Boolean(cookie.hostOnly) &&
              String(candidate.domain || "").trim() === String(cookie.domain || host).trim()
            );
          });

          resolve(match || null);
        }
      );
    });
  }

  async function setCookie(cookie) {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome?.cookies?.set) {
        resolve(null);
        return;
      }

      const details = {
        url: cookie.url,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path,
        secure: Boolean(cookie.secure),
        httpOnly: Boolean(cookie.httpOnly),
        sameSite: cookie.sameSite,
        storeId: cookie.storeId
      };

      if (cookie.domain && cookie.hostOnly !== true) {
        details.domain = cookie.domain;
      }

      if (cookie.expirationDate !== undefined && cookie.expirationDate !== null) {
        details.expirationDate = cookie.expirationDate;
      }

      if (cookie.partitionKey) {
        details.partitionKey = cookie.partitionKey;
      }

      globalThis.chrome.cookies.set(details, (result) => {
        const lastError = globalThis.chrome?.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        resolve(result || null);
      });
    });
  }

  async function removeCookie(cookie) {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome?.cookies?.remove) {
        resolve(null);
        return;
      }

      globalThis.chrome.cookies.remove(
        {
          url: cookie.url,
          name: cookie.name,
          storeId: cookie.storeId
        },
        (result) => {
          const lastError = globalThis.chrome?.runtime?.lastError;
          if (lastError) {
            reject(new Error(lastError.message));
            return;
          }

          resolve(result || null);
        }
      );
    });
  }

  async function applyManagedCookies(cookies, options = {}) {
    const fallbackDomain = String(options.fallbackDomain || "").trim();
    const normalizedCookies = uniqueByKey(cookies, cookieIdentity).map((cookie) => normalizeCookie(cookie, fallbackDomain));
    const currentManaged = await getManagedCookieSnapshot();
    const currentBackups = await getCookieBackupSnapshot();
    const managedMap = cookieLookupMap(currentManaged);
    const backupMap = cookieLookupMap(currentBackups);
    const nextManagedMap = new Map();
    const applied = [];
    const skipped = [];

    for (const cookie of normalizedCookies) {
      if (!cookie.name || !cookie.url) {
        skipped.push({ cookie, reason: "missing-name-or-url" });
        continue;
      }

      const identity = cookieIdentity(cookie);
      const existing = await findExistingCookie(cookie);
      const wasManaged = managedMap.has(identity);

      const isSame =
        existing &&
        existing.value === cookie.value &&
        String(existing.domain || "") === String(cookie.domain || extractCookieHost(cookie)) &&
        String(existing.path || "/") === String(cookie.path || "/") &&
        Boolean(existing.secure) === Boolean(cookie.secure) &&
        Boolean(existing.httpOnly) === Boolean(cookie.httpOnly) &&
        Boolean(existing.hostOnly) === Boolean(cookie.hostOnly) &&
        String(existing.sameSite || "unspecified") === String(cookie.sameSite || "unspecified");

      if (isSame) {
        if (wasManaged) {
          nextManagedMap.set(identity, cookie);
        }

        skipped.push({ cookie, reason: wasManaged ? "unchanged-managed" : "unchanged-existing" });
        continue;
      }

      if (existing && !wasManaged && !backupMap.has(identity)) {
        backupMap.set(identity, snapshotCookie(existing));
      }

      await setCookie(cookie);
      applied.push(cookie);
      nextManagedMap.set(identity, cookie);
    }

    const persistedCookies = Array.from(nextManagedMap.values());
    const persistedBackups = persistedCookies
      .map((cookie) => backupMap.get(cookieIdentity(cookie)))
      .filter(Boolean);
    await persistArraySnapshot(STORAGE_KEYS.cookieState, persistedCookies);
    await persistArraySnapshot(STORAGE_KEYS.cookieBackupState, persistedBackups);

    return Object.freeze({
      applied,
      skipped,
      cookies: persistedCookies
    });
  }

  async function clearManagedCookies(cookies = null) {
    const currentManaged = await getManagedCookieSnapshot();
    const currentBackups = await getCookieBackupSnapshot();
    const snapshot = cookies ? toArray(cookies) : currentManaged;
    const normalizedCookies = uniqueByKey(snapshot, cookieIdentity);
    const managedMap = cookieLookupMap(currentManaged);
    const backupMap = cookieLookupMap(currentBackups);
    const targetIds = new Set(normalizedCookies.map((cookie) => cookieIdentity(cookie)));
    const cleared = [];
    const restored = [];

    for (const cookie of normalizedCookies) {
      const identity = cookieIdentity(cookie);
      const normalized = managedMap.get(identity) || normalizeCookie(cookie);
      await removeCookie(normalized);

      const backupCookie = backupMap.get(identity);
      if (backupCookie) {
        await setCookie(backupCookie);
        restored.push(backupCookie);
      }

      cleared.push(normalized);
    }

    const nextManaged = Array.from(managedMap.entries())
      .filter(([identity]) => !targetIds.has(identity))
      .map(([, cookie]) => cookie);
    const nextBackups = Array.from(backupMap.entries())
      .filter(([identity]) => !targetIds.has(identity))
      .map(([, cookie]) => cookie);
    await persistArraySnapshot(STORAGE_KEYS.cookieState, nextManaged);
    await persistArraySnapshot(STORAGE_KEYS.cookieBackupState, nextBackups);

    return Object.freeze({
      cleared,
      restored,
      cookies: normalizedCookies
    });
  }

  function normalizeProxyConfig(proxyConfig) {
    if (!proxyConfig) {
      return null;
    }

    if (proxyConfig.value && typeof proxyConfig.value === "object") {
      return proxyConfig.value;
    }

    if (proxyConfig.mode) {
      return {
        mode: proxyConfig.mode,
        pacScript: proxyConfig.pacScript || undefined,
        rules: proxyConfig.rules || undefined,
        scope: proxyConfig.scope || "regular"
      };
    }

    if (proxyConfig.pacScript || proxyConfig.rules) {
      return {
        mode: proxyConfig.pacScript ? "pac_script" : "fixed_servers",
        pacScript: proxyConfig.pacScript || undefined,
        rules: proxyConfig.rules || undefined,
        scope: proxyConfig.scope || "regular"
      };
    }

    return null;
  }

  function proxySignature(proxyConfig) {
    return proxyConfig ? JSON.stringify(proxyConfig) : "";
  }

  async function getManagedProxyConfig() {
    const stored = await readStoredValue(STORAGE_KEYS.proxyState);
    return stored || null;
  }

  async function getProxyBackupConfig() {
    const stored = await readStoredValue(STORAGE_KEYS.proxyBackupState);
    return stored || null;
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
    const nextSignature = proxySignature({ ...normalized, scope });
    const currentSignature = proxySignature(current);

    if (nextSignature === currentSignature) {
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

    await new Promise((resolve, reject) => {
      if (!globalThis.chrome?.proxy?.settings?.set) {
        resolve(null);
        return;
      }

      globalThis.chrome.proxy.settings.set(
        {
          value: proxyValue,
          scope
        },
        () => {
          const lastError = globalThis.chrome?.runtime?.lastError;
          if (lastError) {
            reject(new Error(lastError.message));
            return;
          }

          resolve(true);
        }
      );
    });

    const storedProxy = Object.freeze({
      ...normalized,
      scope
    });
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

  async function syncManagedArtifacts(input = {}) {
    let cookiesResult = null;
    if (input.cookies) {
      const fallbackDomain = String(input.cookieOptions?.fallbackDomain || "").trim();
      const desiredCookies = uniqueByKey(input.cookies, cookieIdentity).map((cookie) => normalizeCookie(cookie, fallbackDomain));
      const currentManaged = await getManagedCookieSnapshot();
      const desiredIds = new Set(desiredCookies.map((cookie) => cookieIdentity(cookie)));
      const staleCookies = currentManaged.filter((cookie) => !desiredIds.has(cookieIdentity(cookie)));

      if (staleCookies.length > 0) {
        await clearManagedCookies(staleCookies);
      }

      cookiesResult = await applyManagedCookies(desiredCookies, input.cookieOptions || {});
    }

    const proxyResult = input.proxy === undefined ? null : await applyProxyConfig(input.proxy, input.proxyOptions || {});

    return Object.freeze({
      cookies: cookiesResult,
      proxy: proxyResult
    });
  }

  async function clearManagedArtifacts(input = {}) {
    const cookiesResult = await clearManagedCookies(input.cookies || null);
    const proxyResult = await clearProxyConfig(input.proxyOptions || {});

    return Object.freeze({
      cookies: cookiesResult,
      proxy: proxyResult
    });
  }

  globalThis.ArborCookieProxyManager = Object.freeze({
    storageKeys: STORAGE_KEYS,
    getManagedCookieSnapshot,
    applyManagedCookies,
    clearManagedCookies,
    getManagedProxyConfig,
    applyProxyConfig,
    clearProxyConfig,
    syncManagedArtifacts,
    clearManagedArtifacts
  });
})();
