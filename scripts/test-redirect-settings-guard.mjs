import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const source = fs.readFileSync(path.join(root, 'src', 'chatgpt-settings-main-guard.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function createGuardSandbox(initialHref = 'https://chatgpt.com/c/safe') {
  let currentUrl = new URL(initialHref);
  const listeners = {};
  const replacements = [];
  const storage = new Map();

  const location = {
    get href() {
      return currentUrl.href;
    },
    get origin() {
      return currentUrl.origin;
    },
    get pathname() {
      return currentUrl.pathname;
    },
    get search() {
      return currentUrl.search;
    },
    replace(value) {
      replacements.push(String(value));
      currentUrl = new URL(value, currentUrl.href);
    }
  };

  const sandbox = {
    URL,
    document: {
      referrer: ''
    },
    location,
    sessionStorage: {
      getItem(key) {
        return storage.get(key) || null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      }
    },
    window: {
      addEventListener(type, listener) {
        listeners[type] = listener;
      },
      history: {
        pushState(_state, _title, value) {
          if (value) {
            currentUrl = new URL(value, currentUrl.href);
          }
        },
        replaceState(_state, _title, value) {
          if (value) {
            currentUrl = new URL(value, currentUrl.href);
          }
        }
      }
    },
    chrome: {}
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  return {
    get href() {
      return location.href;
    },
    listeners,
    replacements,
    history: sandbox.window.history
  };
}

test('redirect guard blocks ChatGPT settings reached through History API pushState', () => {
  const sandbox = createGuardSandbox();

  sandbox.history.pushState({}, '', 'https://chatgpt.com/#settings');

  assert.equal(sandbox.href, 'https://chatgpt.com/c/safe');
  assert.deepEqual(sandbox.replacements, ['https://chatgpt.com/c/safe']);
});

test('redirect guard blocks ChatGPT settings reached through History API replaceState', () => {
  const sandbox = createGuardSandbox();

  sandbox.history.replaceState({}, '', 'https://chatgpt.com/#settings');

  assert.equal(sandbox.href, 'https://chatgpt.com/c/safe');
  assert.deepEqual(sandbox.replacements, ['https://chatgpt.com/c/safe']);
});

test('manifest runs the ChatGPT settings guard in the page main world', () => {
  const settingsGuardEntry = manifest.content_scripts.find((entry) => (
    entry.world === 'MAIN' &&
    entry.matches?.includes('https://chatgpt.com/*') &&
    entry.js?.includes('src/chatgpt-settings-main-guard.js')
  ));

  assert.ok(settingsGuardEntry, 'expected a dedicated MAIN-world guard for ChatGPT settings');
  assert.equal(settingsGuardEntry.run_at, 'document_start');
});
