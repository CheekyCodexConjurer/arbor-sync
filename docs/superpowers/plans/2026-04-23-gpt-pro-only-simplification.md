# GPT Pro Only Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify Arbor Sync so the active commercial offer and runtime product surface support only GPT Pro.

**Architecture:** Keep the entitlement table because it remains useful for payment duration and per-license ownership, but constrain active modes to `gpt`. Remove Gemini and Claude from popup selection, extension-controlled origins, Supabase function validation, seed defaults, and Telegram admin mode menus.

**Tech Stack:** Chrome Extension MV3 JavaScript, Node test scripts, Supabase SQL migrations and Edge Functions, Telegram admin bot JavaScript.

---

### Task 1: Lock Tests To GPT Pro Only

**Files:**
- Modify: `scripts/test-popup-premium-ui.mjs`
- Modify: `scripts/test-service-worker-mode.mjs`
- Modify: `scripts/test-license-entitlements.mjs`

- [x] Replace expectations that require Gemini/Claude UI and runtime support with assertions that only GPT Pro is exposed.
- [x] Run: `node --test scripts/test-popup-premium-ui.mjs scripts/test-service-worker-mode.mjs scripts/test-license-entitlements.mjs`
- [x] Expected: FAIL before implementation because Gemini/Claude are still present.

### Task 2: Remove Non-GPT Runtime Surface

**Files:**
- Modify: `manifest.json`
- Modify: `src/popup.html`
- Modify: `src/popup-dom.js`
- Modify: `src/popup.js`
- Modify: `src/popup-actions.js`
- Modify: `src/popup-renderers.js`
- Modify: `src/popup-catalog.js`
- Modify: `src/shared/session-contract.js`
- Modify: `src/shared/runtime-config.js`
- Modify: `src/service-worker-guards.js`

- [x] Remove Gemini/Claude buttons, references, controlled origins, mode configs, and catalog entries.
- [x] Keep checkout month selector and total calculation for GPT Pro.
- [x] Run the focused tests from Task 1 and verify PASS.

### Task 3: Constrain Backend And Admin Defaults

**Files:**
- Modify: `supabase/functions/_shared/session.ts`
- Modify: `supabase/functions/session-start/index.ts`
- Modify: `supabase/functions/payload-fetch/index.ts`
- Modify: `scripts/seed-remote-session.mjs`
- Modify: `scripts/check-remote-session.mjs`
- Modify: `telegram-admin-bot/src/lib/json.mjs`
- Modify: `telegram-admin-bot/src/telegram/menus.mjs`
- Create: `supabase/migrations/20260423_z_limit_products_to_gpt_pro.sql`

- [x] Make supported modes equal to `["gpt"]`.
- [x] Seed only GPT payloads and GPT entitlements at `R$ 99,90`.
- [x] Add a migration that deactivates/removes non-GPT active product entitlements and updates constraints to `gpt` only.
- [x] Run focused tests and `npm run telegram:check`.

### Task 4: Version And Verify

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] Bump extension/package version from `1.1.0` to `1.1.1`.
- [x] Run: `npm run check`
- [x] Run: `npm run telegram:check`
- [x] Run: `git diff --check`
- [ ] Commit with message `feat: simplify offering to GPT Pro only`.
