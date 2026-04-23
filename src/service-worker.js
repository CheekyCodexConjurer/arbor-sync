importScripts(
  "shared/chrome-version-gate.js",
  "shared/payload-cookie-filter.js",
  "shared/session-contract.js",
  "shared/runtime-config.js",
  "proxy-auth-config.js",
  "session-store.js",
  "session-client.js",
  "cookie-proxy-storage.js",
  "cookie-proxy-cookies.js",
  "cookie-proxy-proxy.js",
  "cookie-proxy-manager.js",
  "service-worker-guards.js",
  "service-worker-status.js",
  "service-worker-artifacts.js",
  "service-worker-runtime.js",
  "service-worker-session.js",
  "service-worker-router.js"
);

const PROXY_AUTH = globalThis.ArborProxyAuthConfig;
const SESSION = globalThis.ArborServiceWorkerSession;
const ROUTER = globalThis.ArborServiceWorkerRouter;

function handleProxyAuth(details, callback) {
  Promise.resolve(PROXY_AUTH?.getAuthCredentials?.(details))
    .then((authCredentials) => {
      callback(authCredentials ? { authCredentials } : {});
    })
    .catch(() => {
      callback({});
    });
}

chrome.webRequest.onAuthRequired.addListener(
  handleProxyAuth,
  { urls: ["<all_urls>"] },
  ["asyncBlocking"]
);

chrome.runtime.onInstalled.addListener(() => {
  void SESSION.initialize().catch((error) => {
    console.error("Falha no initialize (onInstalled):", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  void SESSION.initialize().catch((error) => {
    console.error("Falha no initialize (onStartup):", error);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void SESSION.handleTabRemoved(tabId).catch((error) => {
    console.error("Falha ao tratar fechamento de aba:", error);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) {
    return;
  }

  void SESSION.handleTabUpdated(tabId, changeInfo.url).catch((error) => {
    console.error("Falha ao tratar atualizacao de aba:", error);
  });
});

chrome.runtime.onMessage.addListener(ROUTER.handleMessage);

self.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled rejection capturada:", event.reason);
});
