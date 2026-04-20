export function createRuntimeState() {
  const state = {
    startedAt: new Date().toISOString(),
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
    }
  };

  return {
    snapshot() {
      return {
        startedAt: state.startedAt,
        polling: { ...state.polling }
      };
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
    }
  };
}
