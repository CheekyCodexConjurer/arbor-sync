(function () {
  const DOM = globalThis.ArborPopupDOM;
  const VIEW = globalThis.ArborPopupViewState;
  const CATALOG = globalThis.ArborPopupCatalog;
  const { refs, state, sharedStatusNodes, sharedVersionNodes } = DOM;

  const STATUS_LABELS = Object.freeze({
    idle: "",
    starting: "Iniciando...",
    active: "Ativo",
    expiring: "Expirando",
    expired: "Expirado",
    error: "Erro"
  });

  const MODE_BUTTONS = Object.freeze({
    gpt: () => refs.modeGpt
  });

  function getKnownEnabledModes(response) {
    const enabledModes = response?.bootstrapConfig?.enabledModes;
    return Array.isArray(enabledModes) ? enabledModes : null;
  }

  function isEntitled(enabledModes, mode) {
    return !Array.isArray(enabledModes) || enabledModes.includes(mode);
  }

  function setStatus(text, tone = "default") {
    sharedStatusNodes.forEach((node) => {
      node.textContent = text;
      node.classList.toggle("is-warning", tone === "warning");
    });
  }

  function setSharedVersion(versionText) {
    sharedVersionNodes.forEach((node) => {
      node.textContent = versionText;
    });
  }

  function setButtonLoading(button, labelNode, isLoading, loadingText, defaultText) {
    button.disabled = isLoading;
    button.setAttribute("aria-busy", String(isLoading));
    const resolvedLabelNode = labelNode || button.querySelector("[data-button-label]");
    if (resolvedLabelNode) {
      resolvedLabelNode.textContent = isLoading ? loadingText : defaultText;
      return;
    }

    if (button.querySelector("svg")) {
      const labelText = isLoading ? loadingText : defaultText;
      button.setAttribute("aria-label", labelText);
      button.setAttribute("title", labelText);
      return;
    }

    button.textContent = isLoading ? loadingText : defaultText;
  }

  function setControlsEnabled(enabled) {
    [
      refs.accessBtn,
      refs.stopBtn,
      refs.saveLicenseBtn,
      refs.licenseKeyInput,
      refs.modeGpt,
      refs.copyLicenseBtn,
      refs.checkoutBtn,
      refs.checkEnvironmentBtn,
      refs.reloadExtensionBtn,
      refs.updateExtensionBtn
    ].filter(Boolean).forEach((node) => {
      node.disabled = !enabled;
    });

    Object.values(DOM.tabButtons).forEach((button) => {
      button.disabled = !enabled;
    });
  }

  function updateModeUI(mode) {
    const isGpt = mode === "gpt";

    refs.modeGpt.classList.toggle("active", isGpt);
    refs.modeGpt.setAttribute("aria-pressed", String(isGpt));
    refs.settingsModeValue.textContent = "GPT";
  }

  function renderProductCatalog(response = state.latestStatusResponse) {
    const enabledModes = getKnownEnabledModes(response);
    if (Array.isArray(enabledModes)) {
      CATALOG.setProductSelection(enabledModes);
    }

    refs.productList.textContent = "";

    CATALOG.PRODUCT_CATALOG.forEach((product) => {
      const productEnabled = isEntitled(enabledModes, product.id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "product-card";
      button.dataset.productId = product.id;
      button.setAttribute("aria-pressed", String(CATALOG.productSelection.has(product.id)));
      button.innerHTML = `
        <span class="product-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </span>
        <span class="product-copy">
          <span class="product-head">
            <span class="product-mark">${product.icon}</span>
            <span class="product-name">${product.name}</span>
          </span>
        </span>
        <span class="product-price">${product.priceLabel}</span>
      `;

      if (CATALOG.productSelection.has(product.id)) {
        button.classList.add("is-selected");
      }

      button.classList.toggle("is-locked", !productEnabled);
      button.setAttribute("aria-disabled", String(!productEnabled));

      if (Array.isArray(enabledModes)) {
        button.disabled = true;
      } else {
        button.addEventListener("click", () => {
          CATALOG.toggleProductSelection(product.id);
          renderProductCatalog();
          setStatus("Licença atualizada");
        });
      }

      refs.productList.appendChild(button);
    });

    const selectedProducts = CATALOG.getSelectedProducts();
    const cycleMonths = CATALOG.billingCycleMonths;
    const total = selectedProducts.reduce((sum, product) => sum + product.priceValue, 0) * cycleMonths;
    refs.productTotal.textContent = `R$ ${total.toFixed(2).replace(".", ",")}`;

    [
      [refs.productCycle1, 1],
      [refs.productCycle2, 2],
      [refs.productCycle3, 3]
    ].forEach(([button, months]) => {
      const isActive = cycleMonths === months;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function renderEntitlementUI(response) {
    const enabledModes = getKnownEnabledModes(response);
    const selectedMode = response?.mode || "gpt";

    Object.entries(MODE_BUTTONS).forEach(([mode, resolveButton]) => {
      const button = resolveButton();
      const allowed = isEntitled(enabledModes, mode);
      if (!button.dataset.title) {
        button.dataset.title = button.getAttribute("title") || "";
      }
      button.classList.toggle("is-locked", !allowed);
      button.disabled = !allowed;
      button.setAttribute("aria-disabled", String(!allowed));
      button.setAttribute("title", allowed ? button.dataset.title : "Produto indisponivel");
    });

    if (Array.isArray(enabledModes) && !enabledModes.includes(selectedMode)) {
      refs.accessBtn.disabled = true;
      refs.accessBtn.setAttribute("title", "Produto indisponivel");
      return;
    }

    refs.accessBtn.removeAttribute("title");
  }

  function renderLicensePanel(response, helpers) {
    const bootstrapConfig = response?.bootstrapConfig || {};
    const session = response?.session || {};
    const isConfigured = Boolean(bootstrapConfig.licenseKeyConfigured);
    const enabledModes = getKnownEnabledModes(response);
    const statusLabel = isConfigured && Array.isArray(enabledModes) && enabledModes.length === 0
      ? "Sem produtos"
      : isConfigured ? "Ativa" : "Inativa";
    const licenseKey = String(bootstrapConfig.licenseKey || "");

    refs.licenseStatusPill.textContent = statusLabel;
    refs.licenseKeyValue.textContent = helpers.maskLicenseKey(licenseKey);
    refs.licenseActivatedValue.textContent = helpers.formatLicenseDate(bootstrapConfig.updatedAt);
    refs.licenseRenewalValue.textContent = helpers.formatLicenseDate(session.expiresAtMs);
    refs.copyLicenseBtn.disabled = !isConfigured;
  }

  function renderPrimaryMeta(response, helpers) {
    const bootstrapConfig = response?.bootstrapConfig || {};
    const session = response?.session || {};
    const enabledModes = getKnownEnabledModes(response);

    refs.licenseMeta.textContent = bootstrapConfig.licenseKeyConfigured && Array.isArray(enabledModes) && enabledModes.length === 0
      ? "Sem produtos ativos"
      : bootstrapConfig.licenseKeyConfigured ? "Licença ativa" : "Licença inativa";
    refs.expiryMeta.textContent = helpers.formatSessionExpiry(session);
    setStatus(
      STATUS_LABELS[session.status] || STATUS_LABELS.idle,
      session.status === "error" || session.status === "expired" ? "warning" : "default"
    );

    if (!bootstrapConfig.licenseKeyConfigured) {
      refs.licenseKeyInput.placeholder = "Sua chave...";
    }
  }

  function renderUpdateControls() {
    refs.updateExtensionBtn.classList.toggle("hidden", !state.updateAvailable);
  }

  function renderSupportedView(response, helpers) {
    state.latestStatusResponse = response;
    updateModeUI(response?.mode || "gpt");
    renderPrimaryMeta(response, helpers);
    renderLicensePanel(response, helpers);
    renderProductCatalog(response);
    renderUpdateControls();
    setControlsEnabled(true);
    renderEntitlementUI(response);

    if (response?.bootstrapConfig?.licenseKeyConfigured) {
      VIEW.setActiveView("main");
      VIEW.setActiveTab(state.activeTab || "home", true);
      return;
    }

    VIEW.setActiveView("auth");
  }

  function renderCompatibilityView(compatibility) {
    refs.compatText.textContent = `${compatibility?.error ? `${compatibility.error} ` : ""}Esta extensão exige a versão Stable mais recente do Chrome para funcionar.`;
    refs.currentVersionChip.textContent = `Atual: ${compatibility?.currentVersion || "desconhecida"}`;
    refs.requiredVersionChip.textContent = `Requerido: ${compatibility?.requiredVersion || "desconhecida"}`;
    setControlsEnabled(false);
    setStatus("Atualize o navegador", "warning");
    VIEW.setActiveView("compat");
  }

  function renderConflictView(extensionGuard) {
    const names = Array.isArray(extensionGuard?.conflictingExtensions)
      ? extensionGuard.conflictingExtensions.map((extension) => extension.name).filter(Boolean)
      : [];
    const instruction = names.length === 1
      ? `Desinstale "${names[0]}" para continuar usando a Arbor Sync.`
      : "Desinstale uma das extensões detectadas para continuar usando a Arbor Sync.";

    refs.conflictText.textContent = `${extensionGuard?.error ? `${extensionGuard.error} ` : ""}Uma extensão com Cookie ou Cookies foi detectada e a Arbor Sync foi pausada. ${instruction}`;
    refs.conflictList.textContent = "";
    setControlsEnabled(false);

    if (names.length === 0) {
      const fallback = document.createElement("div");
      fallback.className = "metric-chip";
      fallback.textContent = "Nenhuma extensão detalhada foi informada.";
      refs.conflictList.appendChild(fallback);
    } else {
      names.forEach((name) => {
        const item = document.createElement("div");
        item.className = "metric-chip";
        item.textContent = name;
        refs.conflictList.appendChild(item);
      });
    }

    setStatus("Conflito detectado", "warning");
    VIEW.setActiveView("conflict");
  }

  function replaySuccessAnimation() {
    const svgNode = refs.successView.querySelector("svg");
    if (!svgNode) {
      return;
    }

    const clone = svgNode.cloneNode(true);
    svgNode.parentNode.replaceChild(clone, svgNode);
  }

  globalThis.ArborPopupRenderers = Object.freeze({
    setStatus,
    setSharedVersion,
    setButtonLoading,
    setControlsEnabled,
    updateModeUI,
    renderProductCatalog,
    renderPrimaryMeta,
    renderLicensePanel,
    renderEntitlementUI,
    renderUpdateControls,
    renderSupportedView,
    renderCompatibilityView,
    renderConflictView,
    replaySuccessAnimation
  });
})();
