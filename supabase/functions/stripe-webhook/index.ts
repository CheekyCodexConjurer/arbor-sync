import { failure, json, options } from "../_shared/http.ts";
import { createSupabaseServiceClient, nowIso } from "../_shared/session.ts";
import { readVerifiedStripeEvent } from "../_shared/stripe.ts";

const MONTHLY_PRICE = 99.9;

function buildLicenseKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const body = Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `ARBOR-${body}`;
}

function addMonths(base: Date, months: number) {
  const next = new Date(base.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

function parseCheckoutSession(event: any) {
  return event?.data?.object || {};
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function findOrCreateLicense(supabase: ReturnType<typeof createSupabaseServiceClient>, row: any, currentPeriodEnd: string) {
  const requestedKey = String(row?.requested_license_key || "").trim();
  if (requestedKey) {
    const { data: existing, error: lookupError } = await supabase
      .from("licenses")
      .select("id, license_key, current_period_end")
      .eq("license_key", requestedKey)
      .maybeSingle();

    if (lookupError) {
      throw new Error(`Failed to read requested license: ${lookupError.message}`);
    }

    if (existing) {
      const base = existing.current_period_end && new Date(existing.current_period_end).getTime() > Date.now()
        ? new Date(existing.current_period_end)
        : new Date();
      const renewedUntil = addMonths(base, Number(row.months || 1)).toISOString();
      const { data: updated, error: updateError } = await supabase
        .from("licenses")
        .update({
          status: "active",
          revoked_at: null,
          current_period_end: renewedUntil
        })
        .eq("id", existing.id)
        .select("id, license_key, current_period_end")
        .single();

      if (updateError) {
        throw new Error(`Failed to renew license: ${updateError.message}`);
      }

      return updated;
    }
  }

  const { data: created, error: insertError } = await supabase
    .from("licenses")
    .insert({
      license_key: buildLicenseKey(),
      status: "active",
      plan: "gpt-pro",
      max_devices: 1,
      current_period_end: currentPeriodEnd,
      revoked_at: null
    })
    .select("id, license_key, current_period_end")
    .single();

  if (insertError) {
    throw new Error(`Failed to create license: ${insertError.message}`);
  }

  return created;
}

async function activateCheckout(supabase: ReturnType<typeof createSupabaseServiceClient>, session: any) {
  if (session.payment_status !== "paid") {
    return;
  }

  const checkoutId = String(session.client_reference_id || session.metadata?.checkout_id || "").trim();
  const query = supabase
    .from("stripe_checkout_sessions")
    .select("*")
    .limit(1);
  const { data: rows, error: checkoutLookupError } = checkoutId
    ? await query.eq("id", checkoutId)
    : await query.eq("stripe_session_id", session.id);

  if (checkoutLookupError) {
    throw new Error(`Failed to read checkout: ${checkoutLookupError.message}`);
  }

  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || row.status === "paid") {
    return;
  }

  const currentPeriodEnd = addMonths(new Date(), Number(row.months || 1)).toISOString();
  const license = await findOrCreateLicense(supabase, row, currentPeriodEnd);
  const paidAmount = Number(row.amount_cents || 0) / 100;

  const { error: entitlementError } = await supabase
    .from("license_entitlements")
    .upsert({
      license_id: license.id,
      mode: "gpt",
      status: "active",
      starts_at: nowIso(),
      expires_at: license.current_period_end,
      months: row.months,
      monthly_price: MONTHLY_PRICE,
      paid_amount: paidAmount
    }, { onConflict: "license_id,mode" });

  if (entitlementError) {
    throw new Error(`Failed to activate entitlement: ${entitlementError.message}`);
  }

  const { error: checkoutUpdateError } = await supabase
    .from("stripe_checkout_sessions")
    .update({
      status: "paid",
      license_id: license.id,
      license_key: license.license_key,
      stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      paid_at: nowIso()
    })
    .eq("id", row.id);

  if (checkoutUpdateError) {
    throw new Error(`Failed to mark checkout paid: ${checkoutUpdateError.message}`);
  }
}

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) {
    return preflight;
  }

  if (request.method !== "POST") {
    return failure(405, "method_not_allowed", "Use POST for stripe-webhook.");
  }

  let event;
  try {
    event = await readVerifiedStripeEvent(request);
  } catch (error) {
    return failure(400, "invalid_signature", "Invalid Stripe webhook signature.", errorMessage(error));
  }

  const eventId = String(event?.id || "").trim();
  const eventType = String(event?.type || "").trim();
  if (!eventId || !eventType) {
    return failure(400, "bad_request", "Stripe event id and type are required.");
  }

  const supabase = createSupabaseServiceClient();
  const { error: ledgerError } = await supabase
    .from("stripe_webhook_events")
    .insert({
      stripe_event_id: eventId,
      event_type: eventType,
      payload: event
    });

  if (ledgerError) {
    if (ledgerError.code === "23505") {
      return json({ received: true, duplicate: true });
    }

    return failure(502, "backend_error", "Failed to record webhook event.", ledgerError.message);
  }

  try {
    if (eventType === "checkout.session.completed") {
      await activateCheckout(supabase, parseCheckoutSession(event));
    }
  } catch (error) {
    await supabase
      .from("stripe_webhook_events")
      .delete()
      .eq("stripe_event_id", eventId)
      .is("processed_at", null);
    return failure(502, "backend_error", "Failed to process Stripe webhook.", errorMessage(error));
  }

  await supabase
    .from("stripe_webhook_events")
    .update({ processed_at: nowIso() })
    .eq("stripe_event_id", eventId);

  return json({ received: true });
});
