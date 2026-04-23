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

const transferMigration = readIfExists('supabase/migrations/20260423_zz_add_device_transfer_policy.sql');
const sessionStart = read('supabase/functions/session-start/index.ts');

test('database records and limits one approved device transfer per license month', () => {
  assert.match(transferMigration, /create table if not exists public\.device_transfer_events/, 'expected device transfer audit table');
  assert.match(transferMigration, /license_id uuid not null references public\.licenses\(id\) on delete cascade/, 'expected transfers to belong to licenses');
  assert.match(transferMigration, /previous_device_id uuid references public\.devices\(id\) on delete set null/, 'expected previous device reference');
  assert.match(transferMigration, /next_device_id text not null/, 'expected destination device id to be recorded');
  assert.match(transferMigration, /month_key text not null check \(month_key ~ '\^\[0-9\]\{4\}-\[0-9\]\{2\}\$'\)/, 'expected yyyy-mm month key guard');
  assert.match(transferMigration, /status text not null check \(status in \('approved', 'blocked'\)\)/, 'expected approved and blocked audit states');
  assert.match(transferMigration, /device_transfer_events_one_approved_per_month_idx[\s\S]*where status = 'approved'/, 'expected one approved transfer per license per month');
  assert.match(transferMigration, /alter table public\.device_transfer_events enable row level security;/, 'expected RLS to be enabled');
});

test('session-start performs one self-service transfer then blocks extra devices that month', () => {
  assert.match(sessionStart, /const monthKey = serverTime\.slice\(0, 7\)/, 'expected monthly policy to use server month');
  assert.match(sessionStart, /\.from\("device_transfer_events"\)/, 'expected session-start to audit device transfer events');
  assert.match(sessionStart, /\.eq\("month_key", monthKey\)/, 'expected transfer lookup to be scoped to the current month');
  assert.match(sessionStart, /device_transfer_limit_reached/, 'expected a dedicated monthly transfer limit error');
  assert.match(sessionStart, /status: "blocked"/, 'expected blocked attempts to be audited');
  assert.match(sessionStart, /status: "approved"/, 'expected approved transfer to be audited');
  assert.match(sessionStart, /\.from\("devices"\)[\s\S]*\.update\(\{\s*status: "revoked",\s*revoked_at: serverTime\s*\}\)/, 'expected previous active device to be revoked during transfer');
  assert.match(sessionStart, /Device transfer monthly limit reached\./, 'expected user-safe failure message');
});
