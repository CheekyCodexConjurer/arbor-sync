import { failure, json, options, readJsonBody } from "../_shared/http.ts";
import {
  addMilliseconds,
  buildSessionTokenHash,
  createSupabaseServiceClient,
  describeModeAccess,
  getHeartbeatIntervalSec,
  getRequiredEnv,
  getSessionTtlMs,
  isSupportedMode,
  nowIso
} from "../_shared/session.ts";

type StartSessionRequest = {
  licenseKey?: unknown;
  deviceId?: unknown;
  mode?: unknown;
  clientVersion?: unknown;
};

type DeviceRow = {
  id: string;
  device_id: string;
  status: string;
};

async function auditDeviceTransfer(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  input: {
    licenseId: string;
    previousDevice?: DeviceRow | null;
    nextDeviceId: string;
    monthKey: string;
    status: "approved" | "blocked";
    reason: string;
  }
) {
  return await supabase.from("device_transfer_events").insert({
    license_id: input.licenseId,
    previous_device_id: input.previousDevice?.id ?? null,
    previous_device_fingerprint: input.previousDevice?.device_id ?? null,
    next_device_id: input.nextDeviceId,
    month_key: input.monthKey,
    status: input.status,
    reason: input.reason
  });
}

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) {
    return preflight;
  }

  if (request.method !== "POST") {
    return failure(405, "method_not_allowed", "Use POST for session-start.");
  }

  const body = await readJsonBody<StartSessionRequest>(request);
  if (!body) {
    return failure(400, "bad_request", "Request body must be valid JSON.");
  }

  const licenseKey = String(body.licenseKey ?? "").trim();
  const deviceId = String(body.deviceId ?? "").trim();
  const mode = String(body.mode ?? "").trim();
  const clientVersion = String(body.clientVersion ?? "").trim();

  if (!licenseKey || !deviceId || !mode || !clientVersion) {
    return failure(400, "bad_request", "licenseKey, deviceId, mode and clientVersion are required.");
  }

  if (!isSupportedMode(mode)) {
    return failure(409, "invalid_mode", "mode must be gpt.");
  }

  const supabase = createSupabaseServiceClient();
  const sessionTtlMs = getSessionTtlMs();
  const heartbeatEverySec = getHeartbeatIntervalSec();
  const sessionToken = crypto.randomUUID();
  const sessionTokenHash = await buildSessionTokenHash(sessionToken, getRequiredEnv("SESSION_TOKEN_PEPPER"));
  const serverTime = nowIso();
  const monthKey = serverTime.slice(0, 7);

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

  const modeAccess = describeModeAccess(entitlements ?? [], mode);
  if (!modeAccess.allowed) {
    return failure(403, modeAccess.code, modeAccess.message, {
      enabledModes: modeAccess.enabledModes
    });
  }

  const { data: existingDevice, error: deviceLookupError } = await supabase
    .from("devices")
    .select("id, device_id, status")
    .eq("license_id", license.id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (deviceLookupError) {
    return failure(502, "backend_error", "Failed to read device data.", deviceLookupError.message);
  }

  let deviceDbId = existingDevice?.id ?? null;

  if (!deviceDbId || existingDevice?.status === "revoked") {
    const { count: activeDeviceCount, error: deviceCountError } = await supabase
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("license_id", license.id)
      .eq("status", "active");

    if (deviceCountError) {
      return failure(502, "backend_error", "Failed to count devices.", deviceCountError.message);
    }

    if ((activeDeviceCount ?? 0) >= license.max_devices) {
      const { data: usedTransfer, error: transferLookupError } = await supabase
        .from("device_transfer_events")
        .select("id")
        .eq("license_id", license.id)
        .eq("month_key", monthKey)
        .eq("status", "approved")
        .limit(1)
        .maybeSingle();

      if (transferLookupError) {
        return failure(502, "backend_error", "Failed to read device transfer policy.", transferLookupError.message);
      }

      const { data: previousDevice, error: previousDeviceError } = await supabase
        .from("devices")
        .select("id, device_id, status")
        .eq("license_id", license.id)
        .eq("status", "active")
        .order("last_seen_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (previousDeviceError) {
        return failure(502, "backend_error", "Failed to read active device.", previousDeviceError.message);
      }

      if (usedTransfer) {
        await auditDeviceTransfer(supabase, {
          licenseId: license.id,
          previousDevice,
          nextDeviceId: deviceId,
          monthKey,
          status: "blocked",
          reason: "monthly_limit_reached"
        });
        return failure(409, "device_transfer_limit_reached", "Device transfer monthly limit reached.");
      }

      const { error: transferAuditError } = await auditDeviceTransfer(supabase, {
        licenseId: license.id,
        previousDevice,
        nextDeviceId: deviceId,
        monthKey,
        status: "approved",
        reason: "self_service_monthly_transfer"
      });

      if (transferAuditError) {
        return failure(409, "device_transfer_limit_reached", "Device transfer monthly limit reached.", transferAuditError.message);
      }

      if (previousDevice) {
        const { error: previousDeviceRevokeError } = await supabase
          .from("devices")
          .update({
            status: "revoked",
            revoked_at: serverTime
          })
          .eq("id", previousDevice.id);

        if (previousDeviceRevokeError) {
          return failure(502, "backend_error", "Failed to revoke previous device.", previousDeviceRevokeError.message);
        }

        const { error: previousSessionRevokeError } = await supabase
          .from("sessions")
          .update({
            status: "revoked",
            revoked_at: serverTime
          })
          .eq("device_id", previousDevice.id)
          .eq("status", "active");

        if (previousSessionRevokeError) {
          return failure(502, "backend_error", "Failed to revoke previous sessions.", previousSessionRevokeError.message);
        }
      }
    }

    if (deviceDbId) {
      const { error: deviceReactivateError } = await supabase
        .from("devices")
        .update({
          status: "active",
          last_seen_at: serverTime,
          revoked_at: null
        })
        .eq("id", deviceDbId);

      if (deviceReactivateError) {
        return failure(502, "backend_error", "Failed to reactivate device.", deviceReactivateError.message);
      }
    } else {
      const { data: createdDevice, error: deviceInsertError } = await supabase
        .from("devices")
        .insert({
          license_id: license.id,
          device_id: deviceId,
          status: "active",
          last_seen_at: serverTime
        })
        .select("id")
        .single();

      if (deviceInsertError) {
        return failure(502, "backend_error", "Failed to register device.", deviceInsertError.message);
      }

      deviceDbId = createdDevice.id;
    }
  } else {
    const { error: deviceUpdateError } = await supabase
      .from("devices")
      .update({
        status: "active",
        last_seen_at: serverTime,
        revoked_at: null
      })
      .eq("id", deviceDbId);

    if (deviceUpdateError) {
      return failure(502, "backend_error", "Failed to update device state.", deviceUpdateError.message);
    }
  }

  if (!deviceDbId) {
    return failure(502, "backend_error", "Failed to resolve device.");
  }

  const { error: revokeError } = await supabase
    .from("sessions")
    .update({
      status: "revoked",
      revoked_at: serverTime
    })
    .eq("device_id", deviceDbId)
    .eq("mode", mode)
    .eq("status", "active");

  if (revokeError) {
    return failure(502, "backend_error", "Failed to clear previous sessions.", revokeError.message);
  }

  const expiresAt = addMilliseconds(new Date(serverTime), sessionTtlMs).toISOString();
  const { data: sessionRow, error: sessionInsertError } = await supabase
    .from("sessions")
    .insert({
      license_id: license.id,
      device_id: deviceDbId,
      mode,
      session_token_hash: sessionTokenHash,
      expires_at: expiresAt,
      last_heartbeat_at: serverTime,
      heartbeat_count: 0,
      status: "active"
    })
    .select("id")
    .single();

  if (sessionInsertError) {
    return failure(502, "backend_error", "Failed to create session.", sessionInsertError.message);
  }

  const { data: activePayload, error: payloadError } = await supabase
    .from("mode_payloads")
    .select("version")
    .eq("mode", mode)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (payloadError) {
    return failure(502, "backend_error", "Failed to resolve active payload.", payloadError.message);
  }

  return json({
    sessionId: sessionRow.id,
    sessionToken,
    expiresAt,
    heartbeatEverySec,
    payloadVersion: activePayload?.version ?? 0,
    mode,
    enabledModes: modeAccess.enabledModes,
    deviceId,
    clientVersion,
    serverTime,
    cookies: [],
    proxy: null
  });
});
