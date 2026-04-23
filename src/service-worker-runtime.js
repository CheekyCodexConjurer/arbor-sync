(function () {
  const CONTRACT = globalThis.ArborSessionContract;
  const STORE = globalThis.ArborSessionStore;
  const ARTIFACTS = globalThis.ArborCookieProxyManager;

  function createRuntimeId() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    return `runtime-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function getOrCreateRuntimeState() {
    const existing = await STORE.getRuntimeState();
    if (existing?.runtimeId) {
      return existing;
    }

    return STORE.setRuntimeState({
      runtimeId: createRuntimeId(),
      createdAt: Date.now()
    });
  }

  async function clearRuntimeState() {
    await STORE.clearRuntimeState();
  }

  async function markActiveSession(sessionState) {
    const runtimeState = await getOrCreateRuntimeState();
    return CONTRACT.createSessionState({
      ...sessionState,
      runtimeId: runtimeState.runtimeId,
      updatedAt: Date.now()
    });
  }

  async function clearArtifactsForSession(sessionState) {
    if (sessionState?.managedCookies?.length) {
      await ARTIFACTS.clearManagedArtifacts({ cookies: sessionState.managedCookies });
    }

    await ARTIFACTS.clearManagedArtifacts({});
  }

  async function resetStaleSession(sessionState, reason = "runtime-reset") {
    await clearArtifactsForSession(sessionState);
    await clearRuntimeState();

    const snapshot = CONTRACT.createSessionState({
      status: CONTRACT.SESSION_STATUS.idle,
      mode: sessionState?.mode,
      reason,
      updatedAt: Date.now()
    });

    await STORE.setSessionState(snapshot);
    return snapshot;
  }

  async function clearOrphanArtifacts() {
    await ARTIFACTS.clearManagedArtifacts({});
    await clearRuntimeState();
  }

  async function reconcileRuntimeState() {
    const sessionState = await STORE.getSessionState();
    const [runtimeState, managedCookies, managedProxy] = await Promise.all([
      STORE.getRuntimeState(),
      ARTIFACTS.getManagedCookieSnapshot(),
      ARTIFACTS.getManagedProxyConfig()
    ]);

    if (CONTRACT.isSessionActive(sessionState)) {
      if (!sessionState.runtimeId || !runtimeState?.runtimeId || sessionState.runtimeId !== runtimeState.runtimeId) {
        return resetStaleSession(sessionState, "runtime-reset");
      }

      return sessionState;
    }

    if (managedCookies.length > 0 || managedProxy) {
      await clearOrphanArtifacts();
    }

    return sessionState;
  }

  globalThis.ArborServiceWorkerRuntime = Object.freeze({
    getOrCreateRuntimeState,
    markActiveSession,
    reconcileRuntimeState,
    clearRuntimeState
  });
})();
