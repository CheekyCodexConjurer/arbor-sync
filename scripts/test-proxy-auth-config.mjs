import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const proxyAuthConfig = read('src/proxy-auth-config.js');
const serviceWorker = read('src/service-worker.js');
const supabaseHelpers = read('scripts/supabase-admin-helpers.mjs');
const verifyExtension = read('scripts/verify-extension.mjs');

test('proxy auth config does not commit fixed proxy credentials', () => {
  assert.doesNotMatch(proxyAuthConfig, /host:\s*"\d{1,3}(?:\.\d{1,3}){3}"/, 'expected proxy host not to be hardcoded');
  assert.doesNotMatch(proxyAuthConfig, /username:\s*"[A-Za-z0-9_-]{8,}"/, 'expected proxy username not to be hardcoded');
  assert.doesNotMatch(proxyAuthConfig, /password:\s*"[A-Za-z0-9_-]{8,}"/, 'expected proxy password not to be hardcoded');
});

test('proxy auth is resolved from the managed proxy state', () => {
  assert.match(proxyAuthConfig, /STORAGE_KEYS\.proxyState/, 'expected proxy auth to read the managed proxy state key');
  assert.match(proxyAuthConfig, /function resolveProxyAuthEntries\(/, 'expected proxy auth to extract auth entries from stored proxy state');
  assert.match(proxyAuthConfig, /async function getAuthCredentials\(/, 'expected auth credential lookup to be async');
  assert.match(serviceWorker, /Promise\.resolve\(PROXY_AUTH\?\.getAuthCredentials\?\.\(details\)\)/, 'expected service worker to support async proxy auth lookup');
});

test('proxy seed helper keeps auth out of PAC rules and stores it separately', () => {
  assert.match(supabaseHelpers, /function parseProxyHop\(/, 'expected proxy chain entries to be parsed');
  assert.match(supabaseHelpers, /authEntries/, 'expected proxy credentials to be emitted as separate auth entries');
  assert.match(supabaseHelpers, /const endpoint = `\$\{url\.hostname\}:\$\{url\.port\}`/, 'expected PAC proxy endpoints to omit credentials');
});

test('extension verification runs the proxy auth secret guard', () => {
  assert.match(verifyExtension, /test-proxy-auth-config\.mjs/, 'expected verify-extension to run the proxy auth secret guard');
});
