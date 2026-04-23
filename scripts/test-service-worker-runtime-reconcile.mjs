import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

function readSource(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function createStorageArea(seed = {}) {
  const data = new Map(Object.entries(seed));

  return {
    data,
    get(keys, callback) {
      const result = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((key) => {
        if (data.has(key)) {
          result[key] = data.get(key);
        }
      });
      callback(result);
    },
    set(payload, callback) {
      Object.entries(payload || {}).forEach(([key, value]) => {
        data.set(key, value);
      });
      callback?.();
    },
    remove(keys, callback) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((key) => data.delete(key));
      callback?.();
    }
  };
}

function cookieKey(cookie) {
  return `${cookie.storeId || "0"}|${cookie.url}|${cookie.name}`;
}

function createRuntimeSandbox() {
  const managedCookie = {
    url: "https://chatgpt.com/",
    name: "__Secure-next-auth.session-token.0",
    value: "extension-cookie",
    domain: "chatgpt.com",
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "no_restriction",
    storeId: "0"
  };
  const local = createStorageArea({
    arbor_remote_bootstrap_config: {
      licenseKey: "ARBOR-TEST",
      deviceId: "device-1",
      mode: "gpt",
      clientVersion: "1.0.5",
      updatedAt: 1
    },
    arbor_remote_session_state: {
      status: "active",
      mode: "gpt",
      sessionId: "session-1",
      sessionToken: "token-1",
      expiresAtMs: Date.now() + 60 * 60 * 1000,
      heartbeatEveryMs: 60 * 1000,
      activeTabId: 7,
      targetUrl: "https://chatgpt.com/",
      managedCookies: [managedCookie],
      managedProxy: {
        mode: "fixed_servers",
        rules: {
          singleProxy: {
            scheme: "http",
            host: "127.0.0.1",
            port: 8080
          }
        },
        scope: "regular"
      },
      updatedAt: 1
    },
    arbor_remote_cookie_state: [managedCookie],
    arbor_remote_proxy_state: {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: "http",
          host: "127.0.0.1",
          port: 8080
        }
      },
      scope: "regular"
    }
  });
  const session = createStorageArea({});
  const browserCookies = new Map([[cookieKey(managedCookie), managedCookie]]);
  const removedCookies = [];
  let proxyCleared = false;

  const sandbox = {
    URL,
    Date,
    crypto: {
      randomUUID: () => "runtime-device"
    },
    console,
    setTimeout,
    clearTimeout,
    ChromeVersionGate: {
      updateUrl: "chrome://settings/help",
      getPlatformKey: () => "win",
      checkCompatibility: async () => ({
        supported: true,
        currentVersion: "148.0.0.0",
        requiredVersion: "148.0.0.0",
        platformKey: "win",
        updateUrl: "chrome://settings/help"
      })
    },
    chrome: {
      runtime: {
        id: "arbor-extension",
        lastError: null,
        getManifest: () => ({ version: "1.0.5" })
      },
      storage: {
        local,
        session
      },
      management: {
        getAll(callback) {
          callback([]);
        }
      },
      cookies: {
        getAll(details, callback) {
          const domain = String(details?.domain || "").replace(/^\./, "");
          const cookies = Array.from(browserCookies.values()).filter((cookie) => (
            String(cookie.domain || "").replace(/^\./, "") === domain &&
            String(cookie.name || "") === String(details?.name || "") &&
            String(cookie.path || "/") === String(details?.path || "/") &&
            String(cookie.storeId || "0") === String(details?.storeId || "0")
          ));
          callback(cookies);
        },
        set(cookie, callback) {
          browserCookies.set(cookieKey(cookie), cookie);
          callback(cookie);
        },
        remove(cookie, callback) {
          const key = cookieKey(cookie);
          const removed = browserCookies.get(key) || null;
          browserCookies.delete(key);
          removedCookies.push(cookie);
          callback(removed);
        }
      },
      proxy: {
        settings: {
          get(_details, callback) {
            callback({ value: null });
          },
          set(_details, callback) {
            callback();
          },
          clear(_details, callback) {
            proxyCleared = true;
            callback();
          }
        }
      }
    }
  };

  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  [
    "src/shared/session-contract.js",
    "src/shared/runtime-config.js",
    "src/session-store.js",
    "src/session-client.js",
    "src/cookie-proxy-storage.js",
    "src/cookie-proxy-cookies.js",
    "src/cookie-proxy-proxy.js",
    "src/cookie-proxy-manager.js",
    "src/service-worker-guards.js",
    "src/service-worker-status.js",
    "src/service-worker-artifacts.js",
    "src/service-worker-runtime.js",
    "src/service-worker-session.js",
    "src/service-worker-router.js"
  ].forEach((relativePath) => {
    vm.runInContext(readSource(relativePath), sandbox, { filename: relativePath });
  });

  return {
    sandbox,
    local,
    session,
    browserCookies,
    removedCookies,
    get proxyCleared() {
      return proxyCleared;
    }
  };
}

function requestStatus(router) {
  return new Promise((resolve, reject) => {
    const handled = router.handleMessage({ action: "getStatus" }, {}, resolve);
    if (!handled) {
      reject(new Error("getStatus was not handled"));
    }
  });
}

test("getStatus clears stale active session artifacts when Chrome restarted without runtime marker", async () => {
  const runtime = createRuntimeSandbox();

  const response = await requestStatus(runtime.sandbox.ArborServiceWorkerRouter);

  assert.equal(response.session?.status, "idle");
  assert.equal(response.session?.reason, "runtime-reset");
  assert.equal(runtime.browserCookies.size, 0);
  assert.equal(runtime.removedCookies.length, 1);
  assert.equal(runtime.proxyCleared, true);
  assert.equal(runtime.local.data.has("arbor_remote_cookie_state"), false);
  assert.equal(runtime.local.data.has("arbor_remote_proxy_state"), false);
});
