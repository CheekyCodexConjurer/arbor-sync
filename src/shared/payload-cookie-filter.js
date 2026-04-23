(function () {
  function normalizeHost(value) {
    return String(value || "").trim().replace(/^\./, "").toLowerCase();
  }

  function normalizePath(value) {
    const path = String(value || "/").trim();
    return path || "/";
  }

  function parseTargetUrl(targetUrl) {
    try {
      const parsed = new URL(String(targetUrl || ""));
      return {
        host: normalizeHost(parsed.hostname),
        path: normalizePath(parsed.pathname)
      };
    } catch {
      return {
        host: "",
        path: "/"
      };
    }
  }

  function cookieHost(cookie) {
    if (cookie?.domain) {
      return normalizeHost(cookie.domain);
    }

    try {
      return normalizeHost(new URL(String(cookie?.url || "")).hostname);
    } catch {
      return "";
    }
  }

  function cookieAppliesToHost(cookie, targetHost) {
    const host = cookieHost(cookie);
    if (!host || !targetHost) {
      return false;
    }

    return targetHost === host || targetHost.endsWith(`.${host}`);
  }

  function cookieAppliesToPath(cookie, targetPath) {
    const cookiePath = normalizePath(cookie?.path);
    return targetPath === cookiePath || targetPath.startsWith(`${cookiePath}/`) || cookiePath === "/";
  }

  function specificityScore(cookie, targetHost) {
    const rawDomain = String(cookie?.domain || "").trim();
    const normalizedDomain = normalizeHost(rawDomain);
    if (!normalizedDomain) {
      return 0;
    }

    if (normalizedDomain === targetHost && !rawDomain.startsWith(".")) {
      return 3;
    }

    if (normalizedDomain === targetHost) {
      return 2;
    }

    if (targetHost.endsWith(`.${normalizedDomain}`)) {
      return 1;
    }

    return 0;
  }

  function dedupeCookies(cookies, targetHost) {
    const chosen = new Map();

    for (const cookie of cookies) {
      const key = `${String(cookie?.name || "").trim()}|${normalizePath(cookie?.path)}`;
      if (!key || key === "|/") {
        continue;
      }

      const current = chosen.get(key);
      if (!current) {
        chosen.set(key, cookie);
        continue;
      }

      if (specificityScore(cookie, targetHost) > specificityScore(current, targetHost)) {
        chosen.set(key, cookie);
      }
    }

    return Array.from(chosen.values());
  }

  function filterPayloadCookies(cookies, targetUrl) {
    const items = Array.isArray(cookies) ? cookies : [];
    const target = parseTargetUrl(targetUrl);

    if (!target.host) {
      return [];
    }

    const relevant = items.filter((cookie) => {
      return cookieAppliesToHost(cookie, target.host) && cookieAppliesToPath(cookie, target.path);
    });

    return dedupeCookies(relevant, target.host);
  }

  globalThis.ArborPayloadCookieFilter = Object.freeze({
    filterPayloadCookies
  });
})();
