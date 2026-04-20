(function (global) {
  const UPDATE_URL = "https://www.google.com/chrome/";

  function compareVersions(a, b) {
    const left = String(a || "")
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
    const right = String(b || "")
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
    const length = Math.max(left.length, right.length);

    for (let index = 0; index < length; index += 1) {
      const leftPart = left[index] || 0;
      const rightPart = right[index] || 0;
      if (leftPart > rightPart) return 1;
      if (leftPart < rightPart) return -1;
    }

    return 0;
  }

  function getPlatformKey() {
    const rawPlatform = String(
      global.navigator?.userAgentData?.platform ||
        global.navigator?.platform ||
        ""
    ).toLowerCase();

    if (rawPlatform.includes("win")) return "win";
    if (rawPlatform.includes("mac")) return "mac";
    if (rawPlatform.includes("linux")) return "linux";
    if (rawPlatform.includes("cros") || rawPlatform.includes("chrome os")) return "chromeos";
    return "win";
  }

  async function getCurrentChromeVersion() {
    try {
      if (global.navigator?.userAgentData?.getHighEntropyValues) {
        const values = await global.navigator.userAgentData.getHighEntropyValues([
          "uaFullVersion"
        ]);
        if (values?.uaFullVersion) {
          return values.uaFullVersion;
        }
      }
    } catch {
      // Fall back to the user agent string below.
    }

    const match = String(global.navigator?.userAgent || "").match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
    return match ? match[1] : "";
  }

  async function getLatestStableVersion(platformKey) {
    const response = await fetch(
      `https://versionhistory.googleapis.com/v1/chrome/platforms/${platformKey}/channels/stable/versions?order_by=version%20desc`
    );

    if (!response.ok) {
      throw new Error(`Falha ao consultar a Stable para ${platformKey}.`);
    }

    const payload = await response.json();
    const latestVersion = payload?.versions?.[0]?.version;

    if (!latestVersion) {
      throw new Error("Não foi possível identificar a versão Stable mais recente.");
    }

    return latestVersion;
  }

  async function checkCompatibility() {
    const platformKey = getPlatformKey();
    const [currentVersion, requiredVersion] = await Promise.all([
      getCurrentChromeVersion(),
      getLatestStableVersion(platformKey)
    ]);

    const supported = compareVersions(currentVersion, requiredVersion) >= 0;
    return {
      supported,
      currentVersion: currentVersion || "desconhecida",
      requiredVersion,
      platformKey,
      updateUrl: UPDATE_URL
    };
  }

  global.ChromeVersionGate = {
    compareVersions,
    getCurrentChromeVersion,
    getLatestStableVersion,
    getPlatformKey,
    checkCompatibility,
    updateUrl: UPDATE_URL
  };
})(typeof self !== "undefined" ? self : window);
