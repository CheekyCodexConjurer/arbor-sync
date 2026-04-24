(function () {
  const byId = (id) => document.getElementById(id);

  const refs = {
    accessBtn: byId("accessBtn"),
    accessBtnLabel: byId("accessBtnLabel"),
    stopBtn: byId("stopBtn"),
    saveLicenseBtn: byId("saveLicenseBtn"),
    buyLicenseBtn: byId("buyLicenseBtn"),
    licenseKeyInput: byId("licenseKey"),
    modeGpt: byId("modeGpt"),
    loadingView: byId("loadingView"),
    compatView: byId("compatView"),
    conflictView: byId("conflictView"),
    authView: byId("authView"),
    successView: byId("successView"),
    mainView: byId("mainView"),
    bottomNav: byId("bottomNav"),
    pageStage: byId("pageStage"),
    compatText: byId("compatText"),
    currentVersionChip: byId("currentVersionChip"),
    requiredVersionChip: byId("requiredVersionChip"),
    updateChromeBtn: byId("updateChromeBtn"),
    conflictText: byId("conflictText"),
    conflictList: byId("conflictList"),
    retryGuardBtn: byId("retryGuardBtn"),
    licenseMeta: byId("licenseMeta"),
    expiryMeta: byId("expiryMeta"),
    productList: byId("productList"),
    productTotal: byId("productTotal"),
    productDiscountBadge: byId("productDiscountBadge"),
    productCycle1: byId("productCycle1"),
    productCycle2: byId("productCycle2"),
    productCycle3: byId("productCycle3"),
    copyLicenseBtn: byId("copyLicenseBtn"),
    checkoutBtn: byId("checkoutBtn"),
    licenseStatusPill: byId("licenseStatusPill"),
    licenseActivatedValue: byId("licenseActivatedValue"),
    licenseRenewalValue: byId("licenseRenewalValue"),
    licenseKeyValue: byId("licenseKeyValue"),
    settingsModeValue: byId("settingsModeValue"),
    checkEnvironmentBtn: byId("checkEnvironmentBtn"),
    reloadExtensionBtn: byId("reloadExtensionBtn"),
    updateExtensionBtn: byId("updateExtensionBtn")
  };

  const viewMap = Object.freeze({
    loading: refs.loadingView,
    auth: refs.authView,
    success: refs.successView,
    main: refs.mainView,
    compat: refs.compatView,
    conflict: refs.conflictView
  });

  const panelMap = Object.freeze({
    home: byId("homePanel"),
    products: byId("productsPanel"),
    license: byId("licensePanel"),
    settings: byId("settingsPanel")
  });

  const tabButtons = Object.freeze({
    home: byId("tabHome"),
    products: byId("tabProducts"),
    license: byId("tabLicense"),
    settings: byId("tabSettings")
  });

  globalThis.ArborPopupDOM = Object.freeze({
    refs,
    viewMap,
    panelMap,
    tabButtons,
    sharedStatusNodes: Array.from(document.querySelectorAll("[data-shared-status]")),
    sharedVersionNodes: Array.from(document.querySelectorAll("[data-shared-version]")),
    state: {
      activeTab: "",
      activeView: "",
      latestStatusResponse: null,
      updateAvailable: false
    }
  });
})();
