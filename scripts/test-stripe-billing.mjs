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

const migration = readIfExists('supabase/migrations/20260423_zzz_create_stripe_billing.sql');
const stripeShared = readIfExists('supabase/functions/_shared/stripe.ts');
const stripeCheckout = readIfExists('supabase/functions/stripe-checkout/index.ts');
const stripeWebhook = readIfExists('supabase/functions/stripe-webhook/index.ts');
const stripeSuccess = readIfExists('supabase/functions/stripe-success/index.ts');
const supabaseConfig = read('supabase/config.toml');
const deployScript = read('scripts/deploy-supabase-functions.mjs');
const sessionClient = read('src/session-client.js');
const serviceWorkerRouter = read('src/service-worker-router.js');
const popupHtml = read('src/popup.html');
const popupDom = read('src/popup-dom.js');
const popupActions = read('src/popup-actions.js');
const verifyScript = read('scripts/verify-extension.mjs');

test('database stores Stripe checkout sessions and idempotent webhook events', () => {
  assert.match(migration, /create table if not exists public\.stripe_checkout_sessions/, 'expected checkout session table');
  assert.match(migration, /requested_license_key text/, 'expected renewals to keep the requested license key');
  assert.match(migration, /success_token text not null/, 'expected success page token binding');
  assert.match(migration, /stripe_session_id text unique/, 'expected unique Stripe session id');
  assert.match(migration, /months integer not null check \(months in \(1, 2, 3\)\)/, 'expected only 1-3 month plans');
  assert.match(migration, /create table if not exists public\.stripe_webhook_events/, 'expected webhook event ledger');
  assert.match(migration, /stripe_event_id text primary key/, 'expected Stripe event idempotency');
  assert.match(migration, /alter table public\.stripe_checkout_sessions enable row level security;/, 'expected checkout RLS');
  assert.match(migration, /alter table public\.stripe_webhook_events enable row level security;/, 'expected webhook RLS');
});

test('Stripe Edge Functions use hosted card checkout and verified webhooks', () => {
  assert.match(stripeShared, /STRIPE_SECRET_KEY/, 'expected Stripe secret to stay server-side');
  assert.match(stripeShared, /STRIPE_WEBHOOK_SECRET/, 'expected webhook secret verification');
  assert.match(stripeShared, /Stripe-Signature/i, 'expected Stripe-Signature header handling');
  assert.match(stripeShared, /crypto\.subtle\.importKey\("raw"[\s\S]*HMAC[\s\S]*SHA-256/, 'expected manual HMAC verification in Deno');
  assert.match(stripeShared, /https:\/\/api\.stripe\.com\/v1\/checkout\/sessions/, 'expected Checkout Sessions API');
  assert.match(stripeShared, /payment_method_types\[\][\s\S]*card/, 'expected card-only checkout');
  assert.match(stripeShared, /form\.set\("mode", "payment"\)/, 'expected fixed-cycle one-time payment mode');
  assert.match(stripeCheckout, /calculateStripeAmountCents\(months\)/, 'expected backend-owned amount calculation');
  assert.match(stripeCheckout, /session_id=\{CHECKOUT_SESSION_ID\}/, 'expected success URL to include the Stripe session id');
  assert.match(stripeWebhook, /checkout\.session\.completed/, 'expected completed checkout handling');
  assert.match(stripeWebhook, /payment_status[\s\S]*paid/, 'expected activation only after paid checkout');
  assert.match(stripeWebhook, /\.from\("licenses"\)[\s\S]*(?:\.insert|\.update)/, 'expected webhook to activate or renew licenses');
  assert.match(stripeWebhook, /\.from\("license_entitlements"\)[\s\S]*\.upsert/, 'expected webhook to activate GPT Pro entitlement');
  assert.match(stripeSuccess, /Licença ativada/, 'expected hosted success page to reveal the license after webhook processing');
});

test('extension opens Stripe checkout from the premium purchase flow', () => {
  assert.match(supabaseConfig, /\[functions\.stripe-checkout\][\s\S]*verify_jwt = false/, 'expected public checkout function config');
  assert.match(supabaseConfig, /\[functions\.stripe-webhook\][\s\S]*verify_jwt = false/, 'expected public webhook function config');
  assert.match(supabaseConfig, /\[functions\.stripe-success\][\s\S]*verify_jwt = false/, 'expected public success page function config');
  assert.match(deployScript, /"stripe-checkout"/, 'expected deploy script to include stripe-checkout');
  assert.match(deployScript, /"stripe-webhook"/, 'expected deploy script to include stripe-webhook');
  assert.match(deployScript, /"stripe-success"/, 'expected deploy script to include stripe-success');
  assert.match(sessionClient, /function createStripeCheckout\(/, 'expected session client to call Stripe checkout function');
  assert.match(serviceWorkerRouter, /action === "createStripeCheckout"/, 'expected service worker route for checkout');
  assert.match(popupHtml, /id="buyLicenseBtn"/, 'expected no-license users to reach checkout');
  assert.match(popupDom, /buyLicenseBtn: byId\("buyLicenseBtn"\)/, 'expected popup DOM binding for purchase CTA');
  assert.match(popupActions, /action: "createStripeCheckout"/, 'expected popup checkout action to call backend');
  assert.match(popupActions, /chrome\.tabs\.create\(\{ url: response\.checkoutUrl \}\)/, 'expected popup to open hosted Stripe checkout');
  assert.match(verifyScript, /test-stripe-billing\.mjs/, 'expected full check to run Stripe billing contract');
});
