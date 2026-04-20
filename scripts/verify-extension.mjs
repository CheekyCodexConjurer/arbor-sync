import fs from 'node:fs';
import path from 'node:path';
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
const removedAssetPaths = [
  'assets/data/gpt.json',
  'assets/data/perplexity.json'
];

assertFileExists('manifest.json');
assertFileExists('package.json');
assertFileExists('src/background.js');
assertFileExists('src/service-worker.js');
assertFileExists('src/popup.html');
assertFileExists('src/popup.js');
assertFileExists('src/shared/chrome-version-gate.js');
assertFileExists('src/shared/session-contract.js');
assertFileExists('src/shared/runtime-config.js');
assertFileExists('src/session-store.js');
assertFileExists('src/session-client.js');
assertFileExists('src/cookie-proxy-manager.js');
assertFileExists('src/session-heartbeat.js');

assertJsParses('src/service-worker.js');
assertJsParses('src/popup.js');
assertJsParses('src/shared/chrome-version-gate.js');
assertJsParses('src/shared/session-contract.js');
assertJsParses('src/shared/runtime-config.js');
assertJsParses('src/session-store.js');
assertJsParses('src/session-client.js');
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

const backgroundSource = fs.readFileSync(path.join(root, 'src/service-worker.js'), 'utf8');
const bannedPatterns = [
  /cookieFile:\s*["']/,
  /loadAndInjectCookies\s*\(/,
  /chrome\.runtime\.getURL\(.*assets\/data\//,
  /assets\/data\/gpt\.json/,
  /assets\/data\/perplexity\.json/
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

console.log('Extension check passed.');
