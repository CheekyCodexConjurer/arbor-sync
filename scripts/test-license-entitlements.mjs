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

function readIfExists(relativePath) {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

const entitlementMigration = readIfExists('supabase/migrations/20260423_create_license_entitlements.sql');
const sharedSession = read('supabase/functions/_shared/session.ts');
const sessionStart = read('supabase/functions/session-start/index.ts');
const licenseStatus = readIfExists('supabase/functions/license-status/index.ts');
const deployScript = read('scripts/deploy-supabase-functions.mjs');
const seedScript = read('scripts/seed-remote-session.mjs');
const sessionContract = read('src/shared/session-contract.js');
const sessionClient = read('src/session-client.js');
const serviceWorkerRouter = read('src/service-worker-router.js');
const serviceWorkerSession = read('src/service-worker-session.js');
const serviceWorkerStatus = read('src/service-worker-status.js');
const popupRenderers = read('src/popup-renderers.js');
const popupActions = read('src/popup-actions.js');
const popupComponentsCss = read('src/popup-components.css');

test('database schema stores one product entitlement per license and mode', () => {
  assert.match(entitlementMigration, /create table if not exists public\.license_entitlements/, 'expected a dedicated license_entitlements table');
  assert.match(entitlementMigration, /license_id uuid not null references public\.licenses\(id\) on delete cascade/, 'expected entitlements to belong to licenses');
  assert.match(entitlementMigration, /mode text not null check \(mode in \('gpt', 'gemini', 'claude'\)\)/, 'expected entitlements to be scoped to supported products');
  assert.match(entitlementMigration, /status text not null default 'active' check \(status in \('active', 'past_due', 'revoked', 'expired'\)\)/, 'expected entitlement lifecycle states');
  assert.match(entitlementMigration, /unique \(license_id, mode\)/, 'expected one entitlement row per product per license');
  assert.match(entitlementMigration, /license_entitlements_license_status_mode_idx/, 'expected lookup index for license status checks');
  assert.match(entitlementMigration, /alter table public\.license_entitlements enable row level security;/, 'expected RLS to be enabled');
  assert.match(entitlementMigration, /cross join \(values \('gpt'\), \('gemini'\), \('claude'\)\)/, 'expected existing active licenses to be backfilled safely');
});

test('Supabase functions expose and enforce enabled product modes', () => {
  assert.match(sharedSession, /function getEnabledModes\(/, 'expected a shared enabled-mode helper');
  assert.match(sharedSession, /function describeModeAccess\(/, 'expected shared access decision logic');
  assert.match(sessionStart, /\.from\("license_entitlements"\)/, 'expected session-start to read product entitlements');
  assert.match(sessionStart, /describeModeAccess\(entitlements \?\? \[\], mode\)/, 'expected session-start to evaluate requested mode access');
  assert.match(sharedSession, /product_not_in_license/, 'expected access decision logic to block products outside the license');
  assert.match(sharedSession, /product_expired/, 'expected access decision logic to block expired product entitlements');
  assert.match(sessionStart, /modeAccess\.code/, 'expected session-start to return the entitlement failure code');
  assert.match(sessionStart, /enabledModes/, 'expected session-start responses to return enabled modes');
  assert.match(licenseStatus, /Deno\.serve/, 'expected a license-status function');
  assert.match(licenseStatus, /\.from\("license_entitlements"\)/, 'expected license-status to read product entitlements');
  assert.match(licenseStatus, /enabledModes/, 'expected license-status responses to expose enabled modes');
  assert.match(deployScript, /"license-status"/, 'expected deploy script to include license-status');
});

test('seed script creates product entitlements for seeded licenses', () => {
  assert.match(seedScript, /MODE_PRICES/, 'expected seeded entitlements to carry product prices');
  assert.match(seedScript, /function upsertLicenseEntitlements\(/, 'expected seed script to upsert license_entitlements');
  assert.match(seedScript, /"license_entitlements"/, 'expected seed script to write to license_entitlements');
  assert.match(seedScript, /on_conflict=license_id,mode/, 'expected seed upserts to be idempotent per license and mode');
});

test('extension stores and respects enabled modes from the backend', () => {
  assert.match(sessionContract, /function normalizeEnabledModes\(/, 'expected shared contract to normalize enabled modes');
  assert.match(sessionContract, /enabledModes:/, 'expected bootstrap config to persist enabled modes');
  assert.match(sessionClient, /function getLicenseStatus\(/, 'expected extension client to call license-status');
  assert.match(serviceWorkerRouter, /CLIENT\.getLicenseStatus/, 'expected license activation to validate against backend entitlements');
  assert.match(serviceWorkerRouter, /Produto nao incluso nesta licenca\./, 'expected local mode switching to block disabled products');
  assert.match(serviceWorkerSession, /startedSession\.enabledModes/, 'expected session start to refresh enabled modes from backend');
  assert.match(serviceWorkerStatus, /enabledModes: bootstrapConfig\?\.enabledModes/, 'expected status snapshots to include enabled modes');
  assert.match(popupRenderers, /function renderEntitlementUI\(/, 'expected popup to render locked and enabled modes');
  assert.match(popupRenderers, /is-locked/, 'expected popup to mark disabled products or modes');
  assert.match(popupActions, /response\?\.error \|\| "Produto indisponivel"/, 'expected popup actions to surface entitlement failures');
  assert.match(popupComponentsCss, /\.mode-btn\.is-locked/, 'expected premium locked mode styling');
});
