(function () {
  const STORAGE = globalThis.ArborCookieProxyStorage;
  const { STORAGE_KEYS, toArray, uniqueByKey, readStoredValue, persistArraySnapshot } = STORAGE;

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
    const protocol = cookie?.secure !== false ? "https" : "http";
    return host ? `${protocol}://${host}${path}` : "";
  }

  function normalizeCookie(cookie, fallbackDomain) {
    const hostOnly = cookie?.hostOnly === true;
    const rawDomain = String(cookie?.domain || fallbackDomain || "").trim();
    const host = rawDomain.replace(/^\./, "");
    const path = String(cookie?.path || "/").trim() || "/";
    const normalized = {
      url: buildCookieUrl({ ...cookie, domain: host, path }),
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

          const match = toArray(results).find((candidate) => (
            String(candidate.path || "/") === String(cookie.path || "/") &&
            String(candidate.storeId || "0") === String(cookie.storeId || "0") &&
            Boolean(candidate.hostOnly) === Boolean(cookie.hostOnly) &&
            String(candidate.domain || "").trim() === String(cookie.domain || host).trim()
          ));

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
        { url: cookie.url, name: cookie.name, storeId: cookie.storeId },
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
      const isSame = existing &&
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

  globalThis.ArborCookieProxyCookies = Object.freeze({
    cookieIdentity,
    normalizeCookie,
    getManagedCookieSnapshot,
    applyManagedCookies,
    clearManagedCookies
  });
})();
