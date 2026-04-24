import { failure, json, options, readJsonBody } from "../_shared/http.ts";
import { createStripeCheckoutSession } from "../_shared/stripe.ts";
import { createSupabaseServiceClient } from "../_shared/session.ts";

type StripeCheckoutRequest = {
  mode?: unknown;
  months?: unknown;
  licenseKey?: unknown;
  deviceId?: unknown;
  clientVersion?: unknown;
};

const MONTHLY_PRICE_CENTS = 9990;
const CYCLE_DISCOUNTS: Record<number, number> = {
  1: 0,
  2: 0.05,
  3: 0.1
};

function normalizeMonths(value: unknown) {
  const months = Number(value);
  return months >= 1 && months <= 3 ? Math.trunc(months) : 1;
}

function calculateStripeAmountCents(months: number) {
  const subtotal = MONTHLY_PRICE_CENTS * months;
  const discount = CYCLE_DISCOUNTS[months] || 0;
  return Math.round(subtotal * (1 - discount));
}

function siblingFunctionUrl(request: Request, functionName: string) {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/\/[^/]+$/, `/${functionName}`);
  url.search = "";
  return url.toString();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) {
    return preflight;
  }

  if (request.method !== "POST") {
    return failure(405, "method_not_allowed", "Use POST for stripe-checkout.");
  }

  const body = await readJsonBody<StripeCheckoutRequest>(request);
  if (!body) {
    return failure(400, "bad_request", "Request body must be valid JSON.");
  }

  const mode = String(body.mode ?? "gpt").trim();
  if (mode !== "gpt") {
    return failure(409, "invalid_mode", "mode must be gpt.");
  }

  const months = normalizeMonths(body.months);
  const amountCents = calculateStripeAmountCents(months);
  const checkoutId = crypto.randomUUID();
  const successToken = crypto.randomUUID();
  const successBaseUrl = Deno.env.get("STRIPE_SUCCESS_URL")?.trim() || siblingFunctionUrl(request, "stripe-success");
  const cancelBaseUrl = Deno.env.get("STRIPE_CANCEL_URL")?.trim() || siblingFunctionUrl(request, "stripe-success");
  const successUrl = `${successBaseUrl}?checkout_id=${checkoutId}&token=${successToken}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${cancelBaseUrl}?checkout_id=${checkoutId}&token=${successToken}&cancelled=1`;
  const licenseKey = String(body.licenseKey ?? "").trim();
  const deviceId = String(body.deviceId ?? "").trim();
  const clientVersion = String(body.clientVersion ?? "").trim();

  const supabase = createSupabaseServiceClient();
  const { error: insertError } = await supabase
    .from("stripe_checkout_sessions")
    .insert({
      id: checkoutId,
      requested_license_key: licenseKey || null,
      mode,
      months,
      amount_cents: amountCents,
      currency: "brl",
      status: "created",
      success_token: successToken,
      device_id: deviceId || null,
      client_version: clientVersion || null
    });

  if (insertError) {
    return failure(502, "backend_error", "Failed to prepare checkout.", insertError.message);
  }

  let stripeSession;
  try {
    stripeSession = await createStripeCheckoutSession({
      checkoutId,
      amountCents,
      currency: "brl",
      productName: `Arbor Sync GPT Pro - ${months} ${months === 1 ? "mes" : "meses"}`,
      months,
      successUrl,
      cancelUrl,
      licenseKey,
      deviceId,
      clientVersion
    });
  } catch (error) {
    return failure(502, "stripe_error", "Failed to create Stripe checkout.", errorMessage(error));
  }

  const { error: updateError } = await supabase
    .from("stripe_checkout_sessions")
    .update({
      status: "open",
      stripe_session_id: stripeSession.id,
      stripe_customer_id: typeof stripeSession.customer === "string" ? stripeSession.customer : null,
      checkout_url: stripeSession.url
    })
    .eq("id", checkoutId);

  if (updateError) {
    return failure(502, "backend_error", "Failed to store checkout session.", updateError.message);
  }

  return json({
    checkoutId,
    checkoutUrl: stripeSession.url,
    amountCents,
    currency: "brl",
    months
  });
});
