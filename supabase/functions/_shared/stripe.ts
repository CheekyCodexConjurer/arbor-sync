import { getRequiredEnv } from "./session.ts";

const STRIPE_API_VERSION = "2025-02-24.acacia";

type StripeCheckoutSessionInput = {
  checkoutId: string;
  amountCents: number;
  currency: string;
  productName: string;
  months: number;
  successUrl: string;
  cancelUrl: string;
  licenseKey?: string;
  deviceId?: string;
  clientVersion?: string;
};

function textToBytes(value: string) {
  return new TextEncoder().encode(value);
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}

function parseStripeSignature(header: string) {
  const parts = new Map<string, string[]>();
  for (const item of header.split(",")) {
    const [key, ...rest] = item.split("=");
    const name = String(key || "").trim();
    const value = rest.join("=").trim();
    if (!name || !value) {
      continue;
    }

    const existing = parts.get(name) || [];
    existing.push(value);
    parts.set(name, existing);
  }

  return parts;
}

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", textToBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, textToBytes(payload));
  return bytesToHex(signature);
}

export async function verifyStripeSignature(rawBody: string, signatureHeader: string, secret: string) {
  const parts = parseStripeSignature(signatureHeader);
  const timestamp = Number(parts.get("t")?.[0] || 0);
  const signatures = parts.get("v1") || [];
  const toleranceSec = Number(Deno.env.get("STRIPE_WEBHOOK_TOLERANCE_SEC") || 300);
  const nowSec = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(timestamp) || timestamp <= 0 || Math.abs(nowSec - timestamp) > toleranceSec) {
    return false;
  }

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return signatures.some((signature) => timingSafeEqual(signature, expected));
}

export async function readVerifiedStripeEvent(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("Stripe-Signature") || request.headers.get("stripe-signature") || "";
  const secret = getRequiredEnv("STRIPE_WEBHOOK_SECRET");
  const verified = await verifyStripeSignature(rawBody, signature, secret);

  if (!verified) {
    throw new Error("Invalid Stripe webhook signature.");
  }

  return JSON.parse(rawBody);
}

export async function createStripeCheckoutSession(input: StripeCheckoutSessionInput) {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.append("payment_method_types[]", "card");
  form.set("customer_creation", "always");
  form.set("line_items[0][price_data][currency]", input.currency);
  form.set("line_items[0][price_data][unit_amount]", String(input.amountCents));
  form.set("line_items[0][price_data][product_data][name]", input.productName);
  form.set("line_items[0][quantity]", "1");
  form.set("success_url", input.successUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("client_reference_id", input.checkoutId);
  form.set("metadata[checkout_id]", input.checkoutId);
  form.set("metadata[mode]", "gpt");
  form.set("metadata[months]", String(input.months));
  form.set("metadata[license_key]", input.licenseKey || "");
  form.set("metadata[device_id]", input.deviceId || "");
  form.set("metadata[client_version]", input.clientVersion || "");
  form.set("payment_intent_data[metadata][checkout_id]", input.checkoutId);
  form.set("payment_intent_data[metadata][mode]", "gpt");
  form.set("payment_intent_data[metadata][months]", String(input.months));

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${getRequiredEnv("STRIPE_SECRET_KEY")}`,
      "content-type": "application/x-www-form-urlencoded",
      "stripe-version": STRIPE_API_VERSION
    },
    body: form
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Stripe checkout failed with status ${response.status}`);
  }

  return payload;
}
