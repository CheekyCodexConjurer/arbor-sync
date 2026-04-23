import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const source = fs.readFileSync(path.join(root, 'src', 'shared', 'chrome-version-gate.js'), 'utf8');

function createGate(options = {}) {
  const currentVersion = options.currentVersion || '129.0.0.0';
  const latestStableVersion = options.latestStableVersion || '130.0.0.0';
  const browserGlobal = {
    navigator: {
      platform: 'Win32',
      userAgent: `Mozilla/5.0 Chrome/${currentVersion} Safari/537.36`
    }
  };
  const sandbox = {
    fetch: async () => ({
      ok: true,
      async json() {
        return { versions: [{ version: latestStableVersion }] };
      }
    }),
    self: browserGlobal
  };
  sandbox.window = browserGlobal;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.self.ChromeVersionGate;
}

test('Chrome update action opens the native Chrome update settings page', () => {
  const gate = createGate();

  assert.equal(gate.updateUrl, 'chrome://settings/help');
});

test('compatibility payload exposes the same native Chrome update destination', async () => {
  const gate = createGate();
  const compatibility = await gate.checkCompatibility();

  assert.equal(compatibility.updateUrl, 'chrome://settings/help');
});

test('Chrome is supported during staged stable rollout when one major behind latest API version', async () => {
  const gate = createGate({
    currentVersion: '147.0.7727.117',
    latestStableVersion: '148.0.7778.56'
  });

  const compatibility = await gate.checkCompatibility();

  assert.equal(compatibility.supported, true);
  assert.equal(compatibility.currentVersion, '147.0.7727.117');
  assert.equal(compatibility.requiredVersion, '147.0.0.0');
});

test('Chrome is blocked when more than one major behind latest stable API version', async () => {
  const gate = createGate({
    currentVersion: '146.0.7727.117',
    latestStableVersion: '148.0.7778.56'
  });

  const compatibility = await gate.checkCompatibility();

  assert.equal(compatibility.supported, false);
  assert.equal(compatibility.requiredVersion, '147.0.0.0');
});
