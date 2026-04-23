(function () {
  const COOKIE_FILTER = globalThis.ArborPayloadCookieFilter;
  const CLIENT = globalThis.ArborSessionClient;
  const STORE = globalThis.ArborSessionStore;
  const ARTIFACTS = globalThis.ArborCookieProxyManager;
  const GUARDS = globalThis.ArborServiceWorkerGuards;
  const CONTRACT = globalThis.ArborSessionContract;
  const STATUS = globalThis.ArborServiceWorkerStatus;

  function buildDefaultProxyConfig() {
    return null;
  }

  function normalizeArtifactPayload(mode, payload) {
    const modeConfig = GUARDS.modeConfigFor(mode);
    const targetUrl = payload?.targetUrl || modeConfig.targetUrl;
    const rawCookies = Array.isArray(payload?.cookies) ? payload.cookies : [];
    const cookies = COOKIE_FILTER?.filterPayloadCookies
      ? COOKIE_FILTER.filterPayloadCookies(rawCookies, targetUrl)
      : rawCookies;

    return {
      cookies,
      proxy: payload?.proxy || buildDefaultProxyConfig(mode),
      targetUrl,
      payloadVersion: Number(payload?.version || 0)
    };
  }

  async function fetchRemotePayload(sessionState) {
    const payload = await CLIENT.fetchPayload(
      { mode: sessionState.mode },
      {
        headers: {
          authorization: `Bearer ${sessionState.sessionToken}`
        }
      }
    );

    return normalizeArtifactPayload(sessionState.mode, payload);
  }

  async function refreshActivePayload() {
    const sessionState = await STORE.getSessionState();
    if (!sessionState || !CONTRACT.isSessionActive(sessionState)) {
      return null;
    }

    const artifacts = await fetchRemotePayload(sessionState);
    await ARTIFACTS.syncManagedArtifacts({
      cookies: artifacts.cookies,
      proxy: artifacts.proxy,
      cookieOptions: {
        fallbackDomain: GUARDS.modeConfigFor(sessionState.mode).domain
      }
    });

    const nextSession = CONTRACT.createSessionState({
      ...sessionState,
      targetUrl: artifacts.targetUrl,
      payloadVersion: artifacts.payloadVersion,
      managedCookies: artifacts.cookies,
      managedProxy: artifacts.proxy,
      updatedAt: Date.now()
    });

    await STORE.setSessionState(nextSession);
    return STATUS.sanitizeSessionState(nextSession);
  }

  globalThis.ArborServiceWorkerArtifacts = Object.freeze({
    fetchRemotePayload,
    refreshActivePayload
  });
})();
