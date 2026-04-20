(function () {
  const CONTRACT = globalThis.ArborSessionContract || {};
  const RUNTIME = globalThis.ArborRuntimeConfig || Object.freeze({
    heartbeatIntervalMs: 60 * 1000
  });

  const HEARTBEAT_EVENT = "arbor-session-heartbeat";

  let heartbeatTimer = null;
  let heartbeatStarted = false;

  function getHeartbeatIntervalMs() {
    const interval = Number(RUNTIME.heartbeatIntervalMs);
    return Number.isFinite(interval) && interval > 0 ? interval : 60 * 1000;
  }

  function buildHeartbeatMessage(reason = "interval") {
    const locationObject = globalThis.location || { href: "", };
    const documentObject = globalThis.document || { title: "", visibilityState: "visible" };

    return {
      action: CONTRACT.MESSAGE_TYPES?.heartbeat || "heartbeat",
      url: locationObject.href,
      title: documentObject.title || "",
      visibilityState: documentObject.visibilityState || "visible",
      reason,
      at: Date.now()
    };
  }

  function sendRuntimeMessage(payload) {
    return new Promise((resolve) => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        resolve({ sent: false });
        return;
      }

      globalThis.chrome.runtime.sendMessage(payload, () => {
        const lastError = globalThis.chrome?.runtime?.lastError;
        if (lastError) {
          resolve({ sent: false, error: lastError.message });
          return;
        }

        resolve({ sent: true });
      });
    });
  }

  async function sendHeartbeat(reason = "interval") {
    return sendRuntimeMessage(buildHeartbeatMessage(reason));
  }

  function startHeartbeat() {
    if (heartbeatStarted) {
      return;
    }

    heartbeatStarted = true;
    void sendHeartbeat("startup");

    heartbeatTimer = setInterval(() => {
      void sendHeartbeat("interval");
    }, getHeartbeatIntervalMs());
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    if (!heartbeatStarted) {
      return;
    }

    heartbeatStarted = false;
  }

  function handleVisibilityChange() {
    if ((globalThis.document?.visibilityState || "visible") === "visible") {
      void sendHeartbeat("visibilitychange");
    }
  }

  if (!globalThis.__ArborSessionHeartbeatBound) {
    globalThis.__ArborSessionHeartbeatBound = true;
    if (globalThis.document?.addEventListener) {
      globalThis.document.addEventListener("visibilitychange", handleVisibilityChange, { passive: true });
    }
  }

  startHeartbeat();

  globalThis.ArborSessionHeartbeat = Object.freeze({
    eventName: HEARTBEAT_EVENT,
    getHeartbeatIntervalMs,
    buildHeartbeatMessage,
    sendHeartbeat,
    startHeartbeat,
    stopHeartbeat
  });
})();
