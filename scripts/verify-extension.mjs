import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertFileExists(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing file: ${relativePath}`);
  }
}

function assertJsParses(relativePath) {
  const fullPath = path.join(root, relativePath);
  const source = fs.readFileSync(fullPath, 'utf8');

  try {
    // Parse only. Do not execute browser-specific globals.
    new Function(source);
  } catch (error) {
    throw new Error(`Syntax check failed for ${relativePath}\n${String(error?.message || error)}`);
  }
}

const manifestPath = path.join(root, 'manifest.json');
const manifest = readJson(manifestPath);
const packageJson = readJson(path.join(root, 'package.json'));
const packageLock = readJson(path.join(root, 'package-lock.json'));
const removedAssetPaths = [
  'assets/data/gpt.json',
  'assets/data/perplexity.json',
  'assets/data/gemini.json',
  'assets/data/claude.json'
];

assertFileExists('manifest.json');
assertFileExists('package.json');
assertFileExists('src/background.js');
assertFileExists('src/service-worker.js');
assertFileExists('src/service-worker-guards.js');
assertFileExists('src/service-worker-status.js');
assertFileExists('src/service-worker-artifacts.js');
assertFileExists('src/service-worker-runtime.js');
assertFileExists('src/service-worker-session.js');
assertFileExists('src/service-worker-router.js');
assertFileExists('src/popup.html');
assertFileExists('src/popup.js');
assertFileExists('src/popup-shell.css');
assertFileExists('src/popup-views.css');
assertFileExists('src/popup-components.css');
assertFileExists('src/popup-dom.js');
assertFileExists('src/popup-view-state.js');
assertFileExists('src/popup-renderers.js');
assertFileExists('src/popup-catalog.js');
assertFileExists('src/popup-actions.js');
assertFileExists('src/shared/chrome-version-gate.js');
assertFileExists('src/shared/payload-cookie-filter.js');
assertFileExists('src/shared/session-contract.js');
assertFileExists('src/shared/runtime-config.js');
assertFileExists('src/proxy-auth-config.js');
assertFileExists('src/chatgpt-settings-main-guard.js');
assertFileExists('src/redirect-settings-guard.js');
assertFileExists('src/session-store.js');
assertFileExists('src/session-client.js');
assertFileExists('src/cookie-proxy-storage.js');
assertFileExists('src/cookie-proxy-cookies.js');
assertFileExists('src/cookie-proxy-proxy.js');
assertFileExists('src/cookie-proxy-manager.js');
assertFileExists('src/session-heartbeat.js');
assertFileExists('scripts/test-session-heartbeat-context-invalidated.mjs');
assertFileExists('scripts/test-chrome-version-gate.mjs');
assertFileExists('scripts/test-service-worker-runtime-reconcile.mjs');
assertFileExists('scripts/test-redirect-settings-guard.mjs');
assertFileExists('scripts/test-license-entitlements.mjs');
assertFileExists('scripts/test-device-transfer-policy.mjs');
assertFileExists('scripts/test-proxy-auth-config.mjs');
assertFileExists('supabase/functions/license-status/index.ts');
assertFileExists('supabase/migrations/20260423_create_license_entitlements.sql');
assertFileExists('supabase/migrations/20260423_zz_add_device_transfer_policy.sql');

assertJsParses('src/service-worker.js');
assertJsParses('src/service-worker-guards.js');
assertJsParses('src/service-worker-status.js');
assertJsParses('src/service-worker-artifacts.js');
assertJsParses('src/service-worker-runtime.js');
assertJsParses('src/service-worker-session.js');
assertJsParses('src/service-worker-router.js');
assertJsParses('src/popup.js');
assertJsParses('src/popup-dom.js');
assertJsParses('src/popup-view-state.js');
assertJsParses('src/popup-renderers.js');
assertJsParses('src/popup-catalog.js');
assertJsParses('src/popup-actions.js');
assertJsParses('src/shared/chrome-version-gate.js');
assertJsParses('src/shared/payload-cookie-filter.js');
assertJsParses('src/shared/session-contract.js');
assertJsParses('src/shared/runtime-config.js');
assertJsParses('src/proxy-auth-config.js');
assertJsParses('src/chatgpt-settings-main-guard.js');
assertJsParses('src/redirect-settings-guard.js');
assertJsParses('src/session-store.js');
assertJsParses('src/session-client.js');
assertJsParses('src/cookie-proxy-storage.js');
assertJsParses('src/cookie-proxy-cookies.js');
assertJsParses('src/cookie-proxy-proxy.js');
assertJsParses('src/cookie-proxy-manager.js');
assertJsParses('src/session-heartbeat.js');

const iconPaths = [
  manifest?.action?.default_icon,
  manifest?.icons
]
  .filter(Boolean)
  .flatMap((group) => Object.values(group));

for (const iconPath of iconPaths) {
  assertFileExists(iconPath);
}

const popupPath = manifest?.action?.default_popup;
if (popupPath) {
  assertFileExists(popupPath);
}

const backgroundPath = manifest?.background?.service_worker;
if (backgroundPath) {
  assertFileExists(backgroundPath);
}

const versionSources = {
  'manifest.json': manifest.version,
  'package.json': packageJson.version,
  'package-lock.json': packageLock.version,
  'package-lock.json packages[""]': packageLock.packages?.['']?.version
};

for (const [sourceName, version] of Object.entries(versionSources)) {
  if (!/^\d+\.\d+\.\d+$/.test(String(version || ''))) {
    throw new Error(`Invalid semver version in ${sourceName}: ${version}`);
  }

  if (version !== manifest.version) {
    throw new Error(`Version mismatch: ${sourceName} is ${version}, expected ${manifest.version}`);
  }
}

const backgroundSource = fs.readFileSync(path.join(root, 'src/service-worker.js'), 'utf8');
const bannedPatterns = [
  /cookieFile:\s*["']/,
  /loadAndInjectCookies\s*\(/,
  /chrome\.runtime\.getURL\(.*assets\/data\//,
  /assets\/data\/gpt\.json/,
  /assets\/data\/perplexity\.json/,
  /assets\/data\/gemini\.json/,
  /assets\/data\/claude\.json/
];

for (const pattern of bannedPatterns) {
  if (pattern.test(backgroundSource)) {
    throw new Error(`Legacy local cookie runtime still present: ${pattern}`);
  }
}

for (const removedAssetPath of removedAssetPaths) {
  if (fs.existsSync(path.join(root, removedAssetPath))) {
    throw new Error(`Sensitive local payload file should not ship anymore: ${removedAssetPath}`);
  }
}

const payloadFilterCheck = spawnSync(process.execPath, [path.join(root, 'scripts', 'test-payload-cookie-filter.mjs')], {
  stdio: 'inherit'
});

if (payloadFilterCheck.status !== 0) {
  throw new Error('Payload cookie filter regression check failed.');
}

const serviceWorkerModeCheck = spawnSync(process.execPath, ['--test', path.join(root, 'scripts', 'test-service-worker-mode.mjs')], {
  stdio: 'inherit'
});

if (serviceWorkerModeCheck.status !== 0) {
  throw new Error('Service worker mode regression check failed.');
}

const licenseEntitlementsCheck = spawnSync(process.execPath, ['--test', path.join(root, 'scripts', 'test-license-entitlements.mjs')], {
  stdio: 'inherit'
});

if (licenseEntitlementsCheck.status !== 0) {
  throw new Error('License entitlement regression check failed.');
}

const deviceTransferPolicyCheck = spawnSync(process.execPath, ['--test', path.join(root, 'scripts', 'test-device-transfer-policy.mjs')], {
  stdio: 'inherit'
});

if (deviceTransferPolicyCheck.status !== 0) {
  throw new Error('Device transfer policy regression check failed.');
}

const proxyAuthConfigCheck = spawnSync(process.execPath, ['--test', path.join(root, 'scripts', 'test-proxy-auth-config.mjs')], {
  stdio: 'inherit'
});

if (proxyAuthConfigCheck.status !== 0) {
  throw new Error('Proxy auth config secret guard failed.');
}

const runtimeReconcileCheck = spawnSync(process.execPath, ['--test', path.join(root, 'scripts', 'test-service-worker-runtime-reconcile.mjs')], {
  stdio: 'inherit'
});

if (runtimeReconcileCheck.status !== 0) {
  throw new Error('Service worker runtime reconciliation check failed.');
}

const popupUiCheck = spawnSync(process.execPath, ['--test', path.join(root, 'scripts', 'test-popup-premium-ui.mjs')], {
  stdio: 'inherit'
});

if (popupUiCheck.status !== 0) {
  throw new Error('Popup premium UI contract check failed.');
}

const chromeVersionGateCheck = spawnSync(process.execPath, ['--test', path.join(root, 'scripts', 'test-chrome-version-gate.mjs')], {
  stdio: 'inherit'
});

if (chromeVersionGateCheck.status !== 0) {
  throw new Error('Chrome version gate regression check failed.');
}

const antiGodfileCheck = spawnSync(process.execPath, ['--test', path.join(root, 'scripts', 'test-anti-godfile-architecture.mjs')], {
  stdio: 'inherit'
});

if (antiGodfileCheck.status !== 0) {
  throw new Error('Anti-godfile architecture check failed.');
}

const heartbeatContextCheck = spawnSync(process.execPath, ['--test', path.join(root, 'scripts', 'test-session-heartbeat-context-invalidated.mjs')], {
  stdio: 'inherit'
});

if (heartbeatContextCheck.status !== 0) {
  throw new Error('Session heartbeat context invalidation check failed.');
}

const redirectSettingsGuardCheck = spawnSync(process.execPath, ['--test', path.join(root, 'scripts', 'test-redirect-settings-guard.mjs')], {
  stdio: 'inherit'
});

if (redirectSettingsGuardCheck.status !== 0) {
  throw new Error('Redirect settings guard regression check failed.');
}

console.log('Extension check passed.');
