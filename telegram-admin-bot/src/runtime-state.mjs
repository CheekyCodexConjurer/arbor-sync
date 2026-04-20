export function createRuntimeState(mode = "polling") {
  const state = {
    startedAt: new Date().toISOString(),
    mode,
    polling: {
      status: "starting",
      lastStartedAt: null,
      lastCompletedAt: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      lastOffset: 0,
      updatesFetched: 0,
      updatesHandled: 0,
      lastUpdateId: null
    },
    webhook: {
      status: mode === "webhook" ? "starting" : "disabled",
      lastReceivedAt: null,
      lastHandledAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      requestsReceived: 0,
      updatesHandled: 0,
      lastUpdateId: null
    }
  };

  return {
    snapshot() {
      return {
        startedAt: state.startedAt,
        mode: state.mode,
        polling: { ...state.polling },
        webhook: { ...state.webhook }
      };
    },
    setMode(modeName) {
      state.mode = modeName;
      if (modeName === "webhook" && state.webhook.status === "disabled") {
        state.webhook.status = "ready";
      }
    },
    markPollingStart(offset) {
      state.polling.status = "polling";
      state.polling.lastStartedAt = new Date().toISOString();
      state.polling.lastOffset = Number(offset || 0);
    },
    markPollingSuccess(offset, updates) {
      state.polling.status = "idle";
      state.polling.lastCompletedAt = new Date().toISOString();
      state.polling.lastSuccessAt = state.polling.lastCompletedAt;
      state.polling.lastErrorAt = null;
      state.polling.lastErrorMessage = null;
      state.polling.lastOffset = Number(offset || 0);
      state.polling.updatesFetched += Number(updates || 0);
    },
    markUpdateHandled(updateId, offset) {
      state.polling.updatesHandled += 1;
      state.polling.lastUpdateId = Number(updateId || 0);
      state.polling.lastOffset = Number(offset || 0);
    },
    markPollingError(error, offset) {
      state.polling.status = "error";
      state.polling.lastCompletedAt = new Date().toISOString();
      state.polling.lastErrorAt = state.polling.lastCompletedAt;
      state.polling.lastErrorMessage = String(error?.message || error || "Unknown polling error");
      state.polling.lastOffset = Number(offset || 0);
    },
    markWebhookReady() {
      state.webhook.status = "ready";
      state.webhook.lastErrorAt = null;
      state.webhook.lastErrorMessage = null;
    },
    markWebhookReceived(updateId) {
      state.webhook.status = "handling";
      state.webhook.requestsReceived += 1;
      state.webhook.lastReceivedAt = new Date().toISOString();
      state.webhook.lastUpdateId = Number(updateId || 0);
    },
    markWebhookHandled(updateId) {
      state.webhook.status = "ready";
      state.webhook.updatesHandled += 1;
      state.webhook.lastHandledAt = new Date().toISOString();
      state.webhook.lastUpdateId = Number(updateId || 0);
    },
    markWebhookError(error, updateId) {
      state.webhook.status = "error";
      state.webhook.lastErrorAt = new Date().toISOString();
      state.webhook.lastErrorMessage = String(error?.message || error || "Unknown webhook error");
      state.webhook.lastUpdateId = Number(updateId || 0);
    }
  };
}
