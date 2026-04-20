# Telegram Admin Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-only Telegram bot that manages Arbor Sync licenses, devices, payload uploads, and future admin jobs directly through Supabase.

**Architecture:** A standalone Node.js polling worker lives inside the repo, talks to Telegram over HTTPS, and uses the Supabase service role for administrative queries. The bot is split into config/runtime, Telegram transport, per-feature services, and shared format/validation helpers, with audit logs stored in Supabase.

**Tech Stack:** Node.js ESM, native fetch, `@supabase/supabase-js`, Supabase SQL migrations, Telegram Bot HTTP API

---

### Task 1: Bootstrap the bot workspace and configuration

**Files:**
- Create: `telegram-admin-bot/package.json`
- Create: `telegram-admin-bot/.env.example`
- Create: `telegram-admin-bot/src/config.mjs`
- Create: `telegram-admin-bot/src/index.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add package metadata and scripts for the bot**

```json
{
  "name": "telegram-admin-bot",
  "private": true,
  "type": "module",
  "version": "1.0.0",
  "scripts": {
    "start": "node src/index.mjs",
    "check": "node ../scripts/check-telegram-admin-bot.mjs"
  }
}
```

- [ ] **Step 2: Add env template for Telegram and Supabase admin access**

```env
TELEGRAM_BOT_TOKEN=
ADMIN_TELEGRAM_USER_ID=8756917796
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
PAYLOAD_ENCRYPTION_SECRET=
BOT_NAME=Arbor Sync Admin
POLLING_TIMEOUT_SEC=30
```

- [ ] **Step 3: Add config loader with required env validation**

```js
export function getConfig() {
  const required = ["TELEGRAM_BOT_TOKEN", "ADMIN_TELEGRAM_USER_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PAYLOAD_ENCRYPTION_SECRET"];
  // validate env and return normalized config
}
```

- [ ] **Step 4: Add bot entrypoint**

```js
import { getConfig } from "./config.mjs";
import { runBot } from "./runtime.mjs";

const config = getConfig();
await runBot(config);
```

- [ ] **Step 5: Wire root scripts**

```json
{
  "scripts": {
    "telegram:bot": "node telegram-admin-bot/src/index.mjs",
    "telegram:check": "node scripts/check-telegram-admin-bot.mjs"
  }
}
```

### Task 2: Add Supabase admin schema for bot audit logs and jobs

**Files:**
- Create: `supabase/migrations/20260419_add_admin_bot_tables.sql`

- [ ] **Step 1: Create `admin_audit_logs` table**

```sql
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_telegram_user_id text not null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Create `admin_jobs` table**

```sql
create table if not exists public.admin_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique,
  label text not null,
  description text not null,
  schedule_text text,
  enabled boolean not null default false,
  status text not null default 'planned',
  last_run_at timestamptz,
  last_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 3: Add trigger and seed placeholder jobs**

```sql
insert into public.admin_jobs (job_key, label, description, schedule_text, enabled, status)
values
  ('weekly-json-revoke', 'Revogar JSON semanal', 'Placeholder para rotacao semanal de payload.', 'Domingo 00:00', false, 'planned'),
  ('delete-all-chats', 'Excluir todos os chats', 'Placeholder para rotina administrativa futura.', null, false, 'planned')
on conflict (job_key) do update
set label = excluded.label,
    description = excluded.description,
    schedule_text = excluded.schedule_text;
```

- [ ] **Step 4: Enable RLS to match existing schema posture**

```sql
alter table public.admin_audit_logs enable row level security;
alter table public.admin_jobs enable row level security;
```

### Task 3: Build shared Supabase and utility layer

**Files:**
- Create: `telegram-admin-bot/src/lib/supabase.mjs`
- Create: `telegram-admin-bot/src/lib/payload-crypto.mjs`
- Create: `telegram-admin-bot/src/lib/json.mjs`
- Create: `telegram-admin-bot/src/lib/format.mjs`

- [ ] **Step 1: Add service-role Supabase client factory**

```js
import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdmin(config) {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
```

- [ ] **Step 2: Reuse AES-GCM payload encryption compatible with existing functions**

```js
export async function encryptPayloadBundle(payload, secret) {
  // compatible with existing mode_payloads encrypted_payload format
}
```

- [ ] **Step 3: Add JSON parsing and validation helpers**

```js
export function parseJsonDocument(buffer) {
  return JSON.parse(Buffer.from(buffer).toString("utf8"));
}
```

- [ ] **Step 4: Add formatters for Telegram messages**

```js
export function formatLicenseSummary(license) {
  return `Licenca: ${license.license_key}`;
}
```

### Task 4: Implement domain services for licenses, devices, payloads, dashboard and jobs

**Files:**
- Create: `telegram-admin-bot/src/services/audit-service.mjs`
- Create: `telegram-admin-bot/src/services/license-service.mjs`
- Create: `telegram-admin-bot/src/services/device-service.mjs`
- Create: `telegram-admin-bot/src/services/payload-service.mjs`
- Create: `telegram-admin-bot/src/services/dashboard-service.mjs`
- Create: `telegram-admin-bot/src/services/job-service.mjs`

- [ ] **Step 1: Add audit logging wrapper**

```js
export async function logAdminAction(db, entry) {
  await db.from("admin_audit_logs").insert(entry);
}
```

- [ ] **Step 2: Add license CRUD/admin operations**

```js
export async function createLicense(db, input) {}
export async function findLicenseByKey(db, licenseKey) {}
export async function listActiveLicenses(db) {}
export async function updateLicensePlan(db, licenseId, plan) {}
export async function updateLicenseMaxDevices(db, licenseId, maxDevices) {}
export async function revokeLicense(db, licenseId) {}
export async function reactivateLicense(db, licenseId, currentPeriodEnd) {}
```

- [ ] **Step 3: Add device operations**

```js
export async function listDevicesForLicense(db, licenseId) {}
export async function revokeDevice(db, deviceId) {}
export async function reactivateDevice(db, deviceId) {}
```

- [ ] **Step 4: Add payload versioning operations**

```js
export async function getActivePayloads(db) {}
export async function uploadPayloadVersion(db, mode, payload, secret) {}
export async function listPayloadVersions(db, mode, limit = 5) {}
export async function activatePayloadVersion(db, mode, version) {}
```

- [ ] **Step 5: Add dashboard and job catalog reads**

```js
export async function getDashboardSummary(db) {}
export async function listAdminJobs(db) {}
export async function toggleAdminJob(db, jobKey, enabled) {}
```

### Task 5: Implement Telegram API client and stateful routing

**Files:**
- Create: `telegram-admin-bot/src/runtime.mjs`
- Create: `telegram-admin-bot/src/telegram/client.mjs`
- Create: `telegram-admin-bot/src/telegram/menus.mjs`
- Create: `telegram-admin-bot/src/telegram/session-store.mjs`
- Create: `telegram-admin-bot/src/telegram/router.mjs`

- [ ] **Step 1: Add Telegram HTTP client**

```js
export class TelegramClient {
  async getUpdates(offset) {}
  async sendMessage(chatId, text, extra = {}) {}
  async editMessage(chatId, messageId, text, extra = {}) {}
  async answerCallbackQuery(callbackQueryId, text) {}
  async getFile(fileId) {}
  async downloadFile(filePath) {}
}
```

- [ ] **Step 2: Add inline keyboard builders for all menus**

```js
export function buildMainMenu() {}
export function buildLicensesMenu() {}
export function buildPayloadsMenu() {}
export function buildScriptsMenu() {}
```

- [ ] **Step 3: Add in-memory conversation state store**

```js
export class SessionStore {
  set(chatId, state) {}
  get(chatId) {}
  clear(chatId) {}
}
```

- [ ] **Step 4: Add router with admin allowlist enforcement**

```js
export async function handleUpdate(ctx, update) {
  // reject non-admin, dispatch commands, callbacks, text replies and documents
}
```

- [ ] **Step 5: Add polling runtime with retry/backoff**

```js
export async function runBot(config) {
  // loop getUpdates, update offset, dispatch router, handle transient failures
}
```

### Task 6: Implement admin flows and JSON upload wizard

**Files:**
- Modify: `telegram-admin-bot/src/telegram/router.mjs`
- Modify: `telegram-admin-bot/src/telegram/menus.mjs`

- [ ] **Step 1: Implement `/start` and main menu navigation**

```js
if (message.text === "/start") {
  return showMainMenu(ctx);
}
```

- [ ] **Step 2: Implement license and device callbacks**

```js
// callbacks for search, create, revoke, reactivate, change plan, change device limit
```

- [ ] **Step 3: Implement payload wizard state transitions**

```js
// payload:new -> choose mode -> wait_document -> validate -> upload -> confirm
```

- [ ] **Step 4: Implement scripts placeholders with toggle/list UX**

```js
// display status, enabled flag, schedule text, "em breve"
```

- [ ] **Step 5: Implement config and health views**

```js
// show project ref, admin id, polling mode, env summary
```

### Task 7: Add verification script and operational docs

**Files:**
- Create: `scripts/check-telegram-admin-bot.mjs`
- Create: `telegram-admin-bot/README.md`
- Modify: `package.json`

- [ ] **Step 1: Add static config check script**

```js
// validate required files, env example keys, and bot source imports
```

- [ ] **Step 2: Document local setup, Supabase migration, and bot start**

```md
1. Fill `.env`
2. Run migration
3. Start `npm run telegram:bot`
```

- [ ] **Step 3: Add root npm scripts for bot lifecycle**

```json
{
  "scripts": {
    "telegram:bot": "node telegram-admin-bot/src/index.mjs",
    "telegram:check": "node scripts/check-telegram-admin-bot.mjs"
  }
}
```

### Task 8: Verify end-to-end locally and document hosting recommendation

**Files:**
- Modify: `telegram-admin-bot/README.md`
- Modify: `docs/superpowers/plans/2026-04-19-telegram-admin-bot.md`

- [ ] **Step 1: Run bot verification**

Run: `npm run telegram:check`
Expected: PASS with configuration summary and no missing required files

- [ ] **Step 2: Run existing extension verification**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Smoke test bot actions against Telegram and Supabase**

Run: start bot, send `/start`, open menus, upload a valid JSON, confirm a new payload version appears in Supabase
Expected: menus respond, payload version increments, audit log row created

- [ ] **Step 4: Document hosting recommendation with current pricing/limits**

```md
Compare at least two current hosting options for always-on Node workloads and recommend the best free starting point.
```
