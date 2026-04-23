(function () {
  const DOM = globalThis.ArborPopupDOM;
  const VIEW = globalThis.ArborPopupViewState;
  const RENDER = globalThis.ArborPopupRenderers;
  const CATALOG = globalThis.ArborPopupCatalog;
  const { refs, state, tabButtons } = DOM;

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

  async function refreshStatus(helpers) {
    const { response, error } = await sendMessage({ action: "getStatus" });

    if (error) {
      RENDER.renderCompatibilityView({
        error,
        currentVersion: "desconhecida",
        requiredVersion: "desconhecida"
      });
      return;
    }

    if (response?.extensionGuard?.blocked) {
      RENDER.renderConflictView(response.extensionGuard);
      return;
    }

    if (response?.compatibility?.supported) {
      RENDER.renderSupportedView(response, helpers);
      return;
    }

    RENDER.renderCompatibilityView(response?.compatibility || {});
  }

  async function selectMode(mode, helpers) {
    const { response } = await sendMessage({ action: "setMode", mode });
    if (response?.success) {
      RENDER.updateModeUI(mode);
      await refreshStatus(helpers);
      return;
    }

    RENDER.setStatus(response?.error || "Produto indisponivel", "warning");
  }

  function wireActions(helpers) {
    Object.entries(tabButtons).forEach(([tabName, tabButton]) => {
      tabButton.addEventListener("click", () => {
        if (state.activeView === "main") {
          VIEW.setActiveTab(tabName);
        }
      });
    });

    refs.accessBtn.addEventListener("click", async () => {
      RENDER.setButtonLoading(refs.accessBtn, refs.accessBtnLabel, true, "Abrindo...", "Abrir");
      RENDER.setStatus("Iniciando sessão...");

      const { response } = await sendMessage({
        action: "startSession",
        mode: helpers.getSelectedMode()
      });

      RENDER.setButtonLoading(refs.accessBtn, refs.accessBtnLabel, false, "Abrindo...", "Abrir");
      if (!response?.success) {
        RENDER.setStatus(response?.error || "Produto indisponivel", "warning");
        return;
      }

      await refreshStatus(helpers);
    });

    refs.stopBtn.addEventListener("click", async () => {
      RENDER.setButtonLoading(refs.stopBtn, null, true, "Saindo...", "Sair");
      const { response } = await sendMessage({ action: "stopSession", reason: "popup-stop" });
      RENDER.setButtonLoading(refs.stopBtn, null, false, "Saindo...", "Sair");

      if (!response?.success) {
        RENDER.setStatus("Falha ao encerrar", "warning");
        return;
      }

      await refreshStatus(helpers);
    });

    refs.saveLicenseBtn.addEventListener("click", async () => {
      const licenseKey = String(refs.licenseKeyInput.value || "").trim();
      if (!licenseKey) {
        RENDER.setStatus("Cole sua licença", "warning");
        refs.licenseKeyInput.focus();
        return;
      }

      RENDER.setButtonLoading(refs.saveLicenseBtn, null, true, "Validando...", "Ativar");
      const { response } = await sendMessage({
        action: "saveBootstrapConfig",
        licenseKey,
        mode: helpers.getSelectedMode()
      });
      RENDER.setButtonLoading(refs.saveLicenseBtn, null, false, "Validando...", "Ativar");

      if (!response?.success) {
        RENDER.setStatus("Falha ao salvar", "warning");
        refs.licenseKeyInput.value = "";
        refs.licenseKeyInput.placeholder = response?.error || "Não foi possível salvar a licença.";
        return;
      }

      refs.licenseKeyInput.value = "";
      RENDER.setControlsEnabled(false);
      VIEW.setActiveView("success");
      RENDER.replaySuccessAnimation();
      RENDER.setStatus("Licença validada");
      await new Promise((resolve) => setTimeout(resolve, 980));
      await refreshStatus(helpers);
    });

    refs.modeGpt.addEventListener("click", async () => {
      await selectMode("gpt", helpers);
    });

    refs.checkoutBtn.addEventListener("click", () => {
      RENDER.setStatus("Finalização visual disponível");
    });

    refs.copyLicenseBtn.addEventListener("click", async () => {
      const licenseKey = String(state.latestStatusResponse?.bootstrapConfig?.licenseKey || "").trim();
      if (!licenseKey) {
        RENDER.setStatus("Nenhuma chave para copiar", "warning");
        return;
      }

      try {
        await navigator.clipboard.writeText(licenseKey);
        RENDER.setStatus("Chave copiada");
      } catch {
        RENDER.setStatus("Não foi possível copiar", "warning");
      }
    });

    [
      [refs.productCycle1, 1],
      [refs.productCycle2, 2],
      [refs.productCycle3, 3]
    ].forEach(([button, months]) => {
      button.addEventListener("click", () => {
        CATALOG.setBillingCycleMonths(months);
        RENDER.renderProductCatalog();
        RENDER.setStatus(`Plano ajustado para ${months} ${months === 1 ? "mês" : "meses"}`);
      });
    });

    refs.checkEnvironmentBtn.addEventListener("click", async () => {
      RENDER.setStatus("Verificando ambiente...");
      await refreshStatus(helpers);
    });

    refs.reloadExtensionBtn.addEventListener("click", () => {
      chrome.runtime.reload();
    });

    refs.updateExtensionBtn.addEventListener("click", () => {
      chrome.runtime.reload();
    });

    refs.updateChromeBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: ChromeVersionGate.updateUrl });
    });

    refs.retryGuardBtn.addEventListener("click", () => {
      void refreshStatus(helpers);
    });
  }

  globalThis.ArborPopupActions = Object.freeze({
    sendMessage,
    refreshStatus,
    wireActions
  });
})();
