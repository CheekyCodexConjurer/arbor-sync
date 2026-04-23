(function () {
  const STORAGE_KEY = "arbor_sync_last_good_url";
  const SETTINGS_HASH = "#settings";
  const GUARD_FLAG = "__ARBOR_CHATGPT_SETTINGS_GUARD__";

  if (window[GUARD_FLAG]) {
    return;
  }
  window[GUARD_FLAG] = true;

  function toUrl(value) {
    try {
      return new URL(value, location.href);
    } catch {
      return null;
    }
  }

  function isSettingsUrl(value) {
    const url = toUrl(value);
    if (!url) {
      return false;
    }

    const hash = String(url.hash || "").toLowerCase();
    return hash === SETTINGS_HASH || hash.startsWith(`${SETTINGS_HASH}/`);
  }

  function getStoredUrl() {
    try {
      const value = sessionStorage.getItem(STORAGE_KEY);
      if (value && !isSettingsUrl(value)) {
        return value;
      }
    } catch {
      return null;
    }

    return null;
  }

  function setStoredUrl(url) {
    if (!url || isSettingsUrl(url)) {
      return;
    }

    try {
      sessionStorage.setItem(STORAGE_KEY, url);
    } catch {
      // Storage is best-effort; the live URL fallback still protects the route.
    }
  }

  function getFallbackUrl() {
    const referrer = document.referrer ? toUrl(document.referrer) : null;
    if (referrer && referrer.origin === location.origin && !isSettingsUrl(referrer.href)) {
      return referrer.href;
    }

    return `${location.origin}${location.pathname}${location.search}`;
  }

  function redirectAwayFromSettings() {
    const target = getStoredUrl() || getFallbackUrl();
    if (target && target !== location.href) {
      location.replace(target);
    }
  }

  function handleNavigation() {
    if (isSettingsUrl(location.href)) {
      redirectAwayFromSettings();
      return;
    }

    setStoredUrl(location.href);
  }

  function patchHistoryMethod(methodName) {
    const original = window.history?.[methodName];
    if (typeof original !== "function") {
      return;
    }

    window.history[methodName] = function (...args) {
      const result = original.apply(this, args);
      handleNavigation();
      return result;
    };
  }

  patchHistoryMethod("pushState");
  patchHistoryMethod("replaceState");
  window.addEventListener("hashchange", handleNavigation, { passive: true });
  window.addEventListener("popstate", handleNavigation, { passive: true });
  handleNavigation();
})();
