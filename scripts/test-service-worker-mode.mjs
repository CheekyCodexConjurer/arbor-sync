import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const serviceWorkerStatusSource = fs.readFileSync(path.join(root, 'src', 'service-worker-status.js'), 'utf8');
const sessionContractSource = fs.readFileSync(path.join(root, 'src', 'shared', 'session-contract.js'), 'utf8');
const runtimeConfigSource = fs.readFileSync(path.join(root, 'src', 'shared', 'runtime-config.js'), 'utf8');
const guardSource = fs.readFileSync(path.join(root, 'src', 'service-worker-guards.js'), 'utf8');
const manifestSource = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8');
const sessionSharedSource = fs.readFileSync(path.join(root, 'supabase', 'functions', '_shared', 'session.ts'), 'utf8');

test('service worker reports the saved mode preference before the active session mode', () => {
  assert.match(
    serviceWorkerStatusSource,
    /mode:\s*CONTRACT\.normalizeMode\(bootstrapConfig\?\.\s*mode\s*\|\|\s*sessionState\?\.\s*mode,\s*RUNTIME\.defaultMode\)/,
    'expected buildStatusResponse to prefer the saved bootstrap mode'
  );
});

test('service worker status refreshes Chrome compatibility instead of reusing stale cached state', () => {
  assert.match(
    serviceWorkerStatusSource,
    /GUARDS\.refreshCompatibilityState\(\)/,
    'expected buildStatusResponse to refresh Chrome compatibility for each status request'
  );
  assert.match(
    guardSource,
    /refreshCompatibilityState,/,
    'expected service-worker-guards.js to expose refreshCompatibilityState'
  );
});

test('shared mode contract and guards include Gemini and Claude', () => {
  assert.match(sessionContractSource, /gemini:\s*"gemini"/, 'expected session-contract.js to register Gemini as a supported mode');
  assert.match(sessionContractSource, /claude:\s*"claude"/, 'expected session-contract.js to register Claude as a supported mode');
  assert.match(sessionContractSource, /value === MODES\.gpt \|\| value === MODES\.gemini \|\| value === MODES\.claude/, 'expected session-contract.js to accept Gemini and Claude as valid modes');
  assert.match(runtimeConfigSource, /https:\/\/gemini\.google\.com/, 'expected runtime-config.js to control the Gemini origin');
  assert.match(runtimeConfigSource, /https:\/\/claude\.ai/, 'expected runtime-config.js to control the Claude origin');
  assert.match(guardSource, /gemini:\s*Object\.freeze\(\{[\s\S]*targetUrl:\s*"https:\/\/gemini\.google\.com\/"/, 'expected service-worker-guards.js to route Gemini to gemini.google.com');
  assert.match(guardSource, /claude:\s*Object\.freeze\(\{[\s\S]*targetUrl:\s*"https:\/\/claude\.ai\/"/, 'expected service-worker-guards.js to route Claude to claude.ai');
  assert.match(guardSource, /hostname === "chatgpt\.com"[\s\S]*CONTRACT\.MODES\.gpt[\s\S]*hostname === "gemini\.google\.com"[\s\S]*CONTRACT\.MODES\.gemini[\s\S]*hostname === "claude\.ai"[\s\S]*CONTRACT\.MODES\.claude/, 'expected service-worker-guards.js to detect Gemini and Claude URLs');
  assert.match(manifestSource, /https:\/\/gemini\.google\.com\/\*/, 'expected manifest.json to inject session heartbeat on Gemini');
  assert.match(sessionSharedSource, /SUPPORTED_MODES = \["gpt", "gemini", "claude"\]/, 'expected Supabase functions to accept Gemini and Claude modes');
});
