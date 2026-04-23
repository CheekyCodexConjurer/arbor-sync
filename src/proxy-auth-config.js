(function () {
  const CONTRACT = globalThis.ArborSessionContract || {};
  const STORAGE_KEYS = CONTRACT.STORAGE_KEYS || Object.freeze({
    proxyState: "arbor_remote_proxy_state"
  });

  function normalizeHost(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizePort(value) {
    const port = Number(value);
    return Number.isFinite(port) ? port : 0;
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function readManagedProxyState() {
    return new Promise((resolve) => {
      const area = globalThis.chrome?.storage?.local;
      if (!area) {
        resolve(null);
        return;
      }

      area.get([STORAGE_KEYS.proxyState], (result) => {
        if (globalThis.chrome?.runtime?.lastError) {
          resolve(null);
          return;
        }

        resolve(result?.[STORAGE_KEYS.proxyState] || null);
      });
    });
  }

  function normalizeAuthEntry(value) {
    const username = String(value?.username || "").trim();
    const password = String(value?.password || "").trim();
    const host = normalizeHost(value?.host);
    const port = normalizePort(value?.port);

    if (!username || !password || !host || !port) {
      return null;
    }

    return Object.freeze({ host, port, username, password });
  }

  function resolveProxyAuthEntries(proxyState) {
    const authEntries = [
      ...toArray(proxyState?.auth),
      ...toArray(proxyState?.proxyAuth)
    ]
      .map(normalizeAuthEntry)
      .filter(Boolean);

    return Object.freeze(authEntries);
  }

  function matchesProxyChallenge(details, authEntry) {
    if (!details?.isProxy || !details?.challenger || !authEntry) {
      return false;
    }

    const challengerHost = normalizeHost(details.challenger.host);
    const challengerPort = normalizePort(details.challenger.port);
    return challengerHost === authEntry.host && challengerPort === authEntry.port;
  }

  async function getAuthCredentials(details) {
    const proxyState = await readManagedProxyState();
    const authEntry = resolveProxyAuthEntries(proxyState).find((entry) =>
      matchesProxyChallenge(details, entry)
    );

    if (!authEntry) {
      return null;
    }

    return Object.freeze({
      username: authEntry.username,
      password: authEntry.password
    });
  }

  globalThis.ArborProxyAuthConfig = Object.freeze({
    matchesProxyChallenge,
    resolveProxyAuthEntries,
    getAuthCredentials
  });
})();
