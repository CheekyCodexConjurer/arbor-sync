const DOM = globalThis.ArborPopupDOM;
const VIEW = globalThis.ArborPopupViewState;
const RENDER = globalThis.ArborPopupRenderers;
const ACTIONS = globalThis.ArborPopupActions;
const { refs, state } = DOM;

function setActiveTab(tab) {
  return VIEW.setActiveTab(tab, arguments[1] === true);
}

function setActiveView(view) {
  return VIEW.setActiveView(view);
}

function formatExpiryCountdown(expiresAtMs, nowMs = Date.now()) {
  const expiryTime = Number(expiresAtMs);
  if (!Number.isFinite(expiryTime) || expiryTime <= 0) {
    return "Sem sessão ativa";
  }

  const remainingMs = expiryTime - nowMs;
  if (remainingMs <= 0) {
    return "Expirada";
  }

  const totalMinutes = Math.ceil(remainingMs / 60000);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalDays > 0) {
    return `em ${totalDays} dia${totalDays === 1 ? "" : "s"}`;
  }

  if (totalHours > 0) {
    return `em ${totalHours} hora${totalHours === 1 ? "" : "s"}`;
  }

  return `em ${totalMinutes} minuto${totalMinutes === 1 ? "" : "s"}`;
}

function truncateValue(value, length = 8) {
  if (!value) {
    return "--";
  }

  return String(value).slice(0, length);
}

function maskLicenseKey(licenseKey) {
  const raw = String(licenseKey || "").trim();
  if (!raw) {
    return "--";
  }

  if (raw.length <= 14) {
    return raw;
  }

  return `${raw.slice(0, 8)}****${raw.slice(-12)}`;
}

function formatDateLabel(dateMs) {
  const time = Number(dateMs);
  if (!Number.isFinite(time) || time <= 0) {
    return "--";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(time));
}

function formatSessionExpiry(session) {
  return session?.expiresAtMs > 0
    ? `Expira ${formatExpiryCountdown(session.expiresAtMs)}`
    : "Sem sessão ativa";
}

function getSelectedMode() {
  if (refs.modeClaude.classList.contains("active")) {
    return "claude";
  }

  if (refs.modeGemini.classList.contains("active")) {
    return "gemini";
  }

  return "gpt";
}

function applyManifestVersion() {
  if (DOM.sharedVersionNodes.length === 0) {
    return;
  }

  const manifest = chrome.runtime.getManifest();
  RENDER.setSharedVersion(`v${manifest.version}`);
}

function checkForUpdates() {
  if (!refs.updateExtensionBtn) {
    return;
  }

  chrome.runtime.requestUpdateCheck((status) => {
    state.updateAvailable = status === "update_available";
    RENDER.renderUpdateControls();
  });
}

function setControlsEnabled(enabled) {
  return RENDER.setControlsEnabled(enabled);
}

function formatLicenseDate(dateMs) {
  return formatDateLabel(dateMs);
}

function refreshStatus() {
  return ACTIONS.refreshStatus({
    formatSessionExpiry,
    formatLicenseDate,
    maskLicenseKey,
    truncateValue
  });
}

function bootPopup() {
  applyManifestVersion();
  checkForUpdates();
  ACTIONS.wireActions({
    formatSessionExpiry,
    formatLicenseDate,
    maskLicenseKey,
    getSelectedMode,
    truncateValue
  });
  setActiveTab("home", true);
  setActiveView("loading");
  setControlsEnabled(false);
  refreshStatus();
}

bootPopup();

if (typeof module !== "undefined") {
  module.exports = {
    setActiveTab,
    setActiveView,
    formatExpiryCountdown,
    truncateValue,
    maskLicenseKey,
    formatDateLabel
  };
}
