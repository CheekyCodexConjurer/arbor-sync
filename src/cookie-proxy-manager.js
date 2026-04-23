(function () {
  const STORAGE = globalThis.ArborCookieProxyStorage;
  const COOKIES = globalThis.ArborCookieProxyCookies;
  const PROXY = globalThis.ArborCookieProxyProxy;

  async function syncManagedArtifacts(input = {}) {
    let cookiesResult = null;

    if (input.cookies) {
      const desiredCookies = STORAGE.uniqueByKey(input.cookies, COOKIES.cookieIdentity).map((cookie) =>
        COOKIES.normalizeCookie(cookie, String(input.cookieOptions?.fallbackDomain || "").trim())
      );
      const currentManaged = await COOKIES.getManagedCookieSnapshot();
      const desiredIds = new Set(desiredCookies.map((cookie) => COOKIES.cookieIdentity(cookie)));
      const staleCookies = currentManaged.filter((cookie) => !desiredIds.has(COOKIES.cookieIdentity(cookie)));

      if (staleCookies.length > 0) {
        await COOKIES.clearManagedCookies(staleCookies);
      }

      cookiesResult = await COOKIES.applyManagedCookies(desiredCookies, input.cookieOptions || {});
    }

    const proxyResult = input.proxy === undefined
      ? null
      : await PROXY.applyProxyConfig(input.proxy, input.proxyOptions || {});

    return Object.freeze({
      cookies: cookiesResult,
      proxy: proxyResult
    });
  }

  async function clearManagedArtifacts(input = {}) {
    const cookiesResult = await COOKIES.clearManagedCookies(input.cookies || null);
    const proxyResult = await PROXY.clearProxyConfig(input.proxyOptions || {});

    return Object.freeze({
      cookies: cookiesResult,
      proxy: proxyResult
    });
  }

  globalThis.ArborCookieProxyManager = Object.freeze({
    storageKeys: STORAGE.STORAGE_KEYS,
    getManagedCookieSnapshot: COOKIES.getManagedCookieSnapshot,
    applyManagedCookies: COOKIES.applyManagedCookies,
    clearManagedCookies: COOKIES.clearManagedCookies,
    getManagedProxyConfig: PROXY.getManagedProxyConfig,
    applyProxyConfig: PROXY.applyProxyConfig,
    clearProxyConfig: PROXY.clearProxyConfig,
    syncManagedArtifacts,
    clearManagedArtifacts
  });
})();
