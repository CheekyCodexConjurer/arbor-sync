import { failure, json, options, readJsonBody } from "../_shared/http.ts";
import {
  createSupabaseServiceClient,
  getEnabledModes,
  nowIso
} from "../_shared/session.ts";

type LicenseStatusRequest = {
  licenseKey?: unknown;
  deviceId?: unknown;
  clientVersion?: unknown;
};

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) {
    return preflight;
  }

  if (request.method !== "POST") {
    return failure(405, "method_not_allowed", "Use POST for license-status.");
  }

  const body = await readJsonBody<LicenseStatusRequest>(request);
  if (!body) {
    return failure(400, "bad_request", "Request body must be valid JSON.");
  }

  const licenseKey = String(body.licenseKey ?? "").trim();
  const deviceId = String(body.deviceId ?? "").trim();
  const clientVersion = String(body.clientVersion ?? "").trim();

  if (!licenseKey) {
    return failure(400, "bad_request", "licenseKey is required.");
  }

  const supabase = createSupabaseServiceClient();
  const serverTime = nowIso();

  const { data: license, error: licenseError } = await supabase
    .from("licenses")
    .select("id, license_key, status, plan, max_devices, current_period_end, revoked_at")
    .eq("license_key", licenseKey)
    .maybeSingle();

  if (licenseError) {
    return failure(502, "backend_error", "Failed to read license data.", licenseError.message);
  }

  if (!license) {
    return failure(403, "license_not_found", "License is not registered.");
  }

  if (license.status !== "active") {
    return failure(403, "license_inactive", "License is not active.");
  }

  if (license.current_period_end && Date.now() >= new Date(license.current_period_end).getTime()) {
    return failure(403, "license_expired", "License subscription period has expired.");
  }

  const { data: entitlements, error: entitlementError } = await supabase
    .from("license_entitlements")
    .select("mode, status, expires_at")
    .eq("license_id", license.id);

  if (entitlementError) {
    return failure(502, "backend_error", "Failed to read product entitlements.", entitlementError.message);
  }

  return json({
    license: {
      status: license.status,
      plan: license.plan,
      currentPeriodEnd: license.current_period_end,
      maxDevices: license.max_devices
    },
    enabledModes: getEnabledModes(entitlements ?? []),
    deviceId,
    clientVersion,
    serverTime
  });
});
