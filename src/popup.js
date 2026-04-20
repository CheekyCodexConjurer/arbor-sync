const accessBtn = document.getElementById("accessBtn");
const stopBtn = document.getElementById("stopBtn");
const saveLicenseBtn = document.getElementById("saveLicenseBtn");
const licenseKeyInput = document.getElementById("licenseKey");
const modeGpt = document.getElementById("modeGpt");
const modePerplexity = document.getElementById("modePerplexity");
const statusDiv = document.getElementById("status");
const sessionMeta = document.getElementById("sessionMeta");
const compatNotice = document.getElementById("compatNotice");
const conflictNotice = document.getElementById("conflictNotice");
const appShell = document.getElementById("appShell");
const compatText = document.getElementById("compatText");
const conflictText = document.getElementById("conflictText");
const conflictList = document.getElementById("conflictList");
const authView = document.getElementById("authView");
const successView = document.getElementById("successView");
const mainView = document.getElementById("mainView");
const currentVersionChip = document.getElementById("currentVersionChip");
const requiredVersionChip = document.getElementById("requiredVersionChip");
const updateChromeBtn = document.getElementById("updateChromeBtn");
const retryGuardBtn = document.getElementById("retryGuardBtn");
const appVersionEl = document.getElementById("appVersion");
const updateExtensionBtn = document.getElementById("updateExtensionBtn");

const STATUS_LABELS = {
  idle: "Pronto",
  starting: "Iniciando sessão...",
  active: "Sessão ativa",
  expiring: "Sessão expirando",
  expired: "Sessão expirada",
  error: "Erro de sessão"
};

if (appVersionEl) {
  const manifest = chrome.runtime.getManifest();
  appVersionEl.textContent = `v${manifest.version}`;
}

if (updateExtensionBtn) {
  chrome.runtime.requestUpdateCheck((status) => {
    if (status === "update_available") {
      updateExtensionBtn.classList.remove("hidden");
    }
  });

  updateExtensionBtn.addEventListener("click", () => {
    chrome.runtime.reload();
  });
}

function updateModeUI(mode) {
  modeGpt.classList.toggle("active", mode === "gpt");
  modePerplexity.classList.toggle("active", mode === "perplexity");
}

function setControlsEnabled(enabled) {
  accessBtn.disabled = !enabled;
  stopBtn.disabled = !enabled;
  saveLicenseBtn.disabled = !enabled;
  licenseKeyInput.disabled = !enabled;
  modeGpt.disabled = !enabled;
  modePerplexity.disabled = !enabled;
}

function showCompatibilityBlock(compatibility) {
  compatNotice.classList.remove("hidden");
  conflictNotice.classList.add("hidden");
  appShell.classList.add("hidden");
  setControlsEnabled(false);

  const currentVersion = compatibility?.currentVersion || "desconhecida";
  const requiredVersion = compatibility?.requiredVersion || "desconhecida";
  const detail = compatibility?.error ? `${compatibility.error} ` : "";

  compatText.textContent = `${detail}Esta extensao exige a versao Stable mais recente do Chrome para funcionar.`;
  currentVersionChip.textContent = `Atual: ${currentVersion}`;
  requiredVersionChip.textContent = `Requerido: ${requiredVersion}`;
  statusDiv.textContent = "Bloqueado ate atualizar o Chrome";
}

function showExtensionConflictBlock(extensionGuard) {
  compatNotice.classList.add("hidden");
  conflictNotice.classList.remove("hidden");
  appShell.classList.add("hidden");
  setControlsEnabled(false);

  const names = Array.isArray(extensionGuard?.conflictingExtensions)
    ? extensionGuard.conflictingExtensions.map((extension) => extension.name).filter(Boolean)
    : [];
  const detail = extensionGuard?.error ? `${extensionGuard.error} ` : "";

  conflictList.textContent = "";

  if (names.length > 0) {
    names.forEach((name) => {
      const chip = document.createElement("div");
      chip.className = "conflict-chip";
      chip.textContent = name;
      conflictList.appendChild(chip);
    });
  } else {
    const chip = document.createElement("div");
    chip.className = "conflict-chip";
    chip.textContent = "Nenhum nome detalhado disponivel";
    conflictList.appendChild(chip);
  }

  const instruction = names.length === 1
    ? `Desinstale a extensao "${names[0]}" para continuar usando a Arbor Sync.`
    : "Desinstale uma das extensoes acima para continuar usando a Arbor Sync.";

  conflictText.textContent = `${detail}Uma extensao instalada com "Cookie" ou "Cookies" foi detectada, entao a Arbor Sync foi bloqueada. ${instruction}`;
  statusDiv.textContent = "Bloqueado por conflito";
}

function renderSessionMeta(response) {
  const bootstrapConfig = response?.bootstrapConfig || {};
  const session = response?.session || {};
  const sessionLabel = STATUS_LABELS[session.status] || "Pronto";
  const expiry = session.expiresAtMs ? new Date(session.expiresAtMs).toLocaleTimeString("pt-BR") : "--";
  const licenseState = bootstrapConfig.licenseKeyConfigured ? "Licença ativa" : "Licença pendente";
  const deviceId = bootstrapConfig.deviceId ? bootstrapConfig.deviceId.slice(0, 8) : "--";

  statusDiv.textContent = sessionLabel;
  sessionMeta.textContent = `${licenseState} | device ${deviceId} | expira ${expiry}`;

  if (typeof bootstrapConfig.licenseKeyConfigured === "boolean" && !bootstrapConfig.licenseKeyConfigured) {
    licenseKeyInput.placeholder = "Cole sua licença";
  }
}

function showSupportedView(response) {
  compatNotice.classList.add("hidden");
  conflictNotice.classList.add("hidden");
  appShell.classList.remove("hidden");
  setControlsEnabled(true);

  const isConfigured = response?.bootstrapConfig?.licenseKeyConfigured;
  if (isConfigured) {
    authView.classList.add("hidden");
    mainView.classList.remove("hidden");
  } else {
    authView.classList.remove("hidden");
    mainView.classList.add("hidden");
  }

  updateModeUI(response.mode);
  renderSessionMeta(response);
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve({
        response,
        error: chrome.runtime.lastError?.message || ""
      });
    });
  });
}

setControlsEnabled(false);

async function refreshStatus() {
  const { response, error } = await sendMessage({ action: "getStatus" });

  if (error) {
    showCompatibilityBlock({
      error,
      currentVersion: "desconhecida",
      requiredVersion: "desconhecida"
    });
    return;
  }

  if (response?.extensionGuard?.blocked) {
    showExtensionConflictBlock(response.extensionGuard);
    return;
  }

  if (response?.compatibility?.supported) {
    showSupportedView(response);
    return;
  }

  showCompatibilityBlock(response?.compatibility || {});
}

accessBtn.addEventListener("click", async () => {
  const selectedMode = modeGpt.classList.contains("active") ? "gpt" : "perplexity";
  statusDiv.textContent = "Iniciando sessao...";
  sessionMeta.textContent = "Aguardando resposta remota...";

  const { response } = await sendMessage({
    action: "startSession",
    mode: selectedMode
  });

  if (!response?.success) {
    statusDiv.textContent = "Falha ao iniciar";
    sessionMeta.textContent = response?.error || "Nao foi possivel iniciar a sessao.";
    return;
  }

  await refreshStatus();
});

stopBtn.addEventListener("click", async () => {
  const { response } = await sendMessage({
    action: "stopSession",
    reason: "popup-stop"
  });

  if (!response?.success) {
    statusDiv.textContent = "Falha ao encerrar";
    sessionMeta.textContent = response?.error || "Nao foi possivel encerrar a sessao.";
    return;
  }

  await refreshStatus();
});

saveLicenseBtn.addEventListener("click", async () => {
  const licenseKey = String(licenseKeyInput.value || "").trim();
  const selectedMode = modeGpt.classList.contains("active") ? "gpt" : "perplexity";
  const { response } = await sendMessage({
    action: "saveBootstrapConfig",
    licenseKey,
    mode: selectedMode
  });

  if (!response?.success) {
    statusDiv.textContent = "Falha ao salvar";
    sessionMeta.textContent = response?.error || "Nao foi possivel salvar a licenca.";
    return;
  }

  // Handle visual transition sequence
  licenseKeyInput.value = "";
  setControlsEnabled(false);
  authView.classList.add("hidden");
  successView.classList.remove("hidden");

  // Re-trigger SVG animation logic by cloning node (forces animation reset in case it ran before)
  const svgNode = successView.querySelector('svg');
  if (svgNode) {
    const clonedSvg = svgNode.cloneNode(true);
    svgNode.parentNode.replaceChild(clonedSvg, svgNode);
  }

  // Wait for animation to play
  await new Promise(r => setTimeout(r, 1400));
  
  successView.classList.add("hidden");
  await refreshStatus();
});

modeGpt.addEventListener("click", async () => {
  const { response } = await sendMessage({ action: "setMode", mode: "gpt" });
  if (response?.success) {
    updateModeUI("gpt");
    await refreshStatus();
  }
});

modePerplexity.addEventListener("click", async () => {
  const { response } = await sendMessage({ action: "setMode", mode: "perplexity" });
  if (response?.success) {
    updateModeUI("perplexity");
    await refreshStatus();
  }
});

updateChromeBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: ChromeVersionGate.updateUrl });
});

retryGuardBtn.addEventListener("click", () => {
  refreshStatus();
});

refreshStatus();
