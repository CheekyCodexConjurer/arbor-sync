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

test('shared mode contract and guards expose only GPT Pro', () => {
  assert.match(sessionContractSource, /gpt:\s*"gpt"/, 'expected session-contract.js to register GPT as the supported mode');
  assert.doesNotMatch(sessionContractSource, /gemini:\s*"gemini"|claude:\s*"claude"/, 'expected session-contract.js to omit Gemini and Claude modes');
  assert.match(sessionContractSource, /return value === MODES\.gpt;/, 'expected session-contract.js to accept only GPT as a valid mode');
  assert.doesNotMatch(runtimeConfigSource, /https:\/\/gemini\.google\.com|https:\/\/claude\.ai/, 'expected runtime-config.js not to control Gemini or Claude origins');
  assert.doesNotMatch(guardSource, /gemini:\s*Object\.freeze|claude:\s*Object\.freeze/, 'expected service-worker-guards.js not to route Gemini or Claude');
  assert.doesNotMatch(guardSource, /gemini\.google\.com|claude\.ai/, 'expected service-worker-guards.js not to detect Gemini or Claude URLs');
  assert.doesNotMatch(manifestSource, /https:\/\/gemini\.google\.com\/\*|https:\/\/claude\.ai\/\*/, 'expected manifest.json not to inject session heartbeat on Gemini or Claude');
  assert.match(sessionSharedSource, /SUPPORTED_MODES = \["gpt"\]/, 'expected Supabase functions to accept only GPT mode');
});
