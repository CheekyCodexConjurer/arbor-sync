import { failure, json, options, readJsonBody } from "../_shared/http.ts";
import {
  addMilliseconds,
  buildSessionTokenHash,
  createSupabaseServiceClient,
  getRequiredEnv,
  getSessionTtlMs,
  nowIso
} from "../_shared/session.ts";

type HeartbeatRequest = {
  sessionToken?: unknown;
  deviceId?: unknown;
  mode?: unknown;
};

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) {
    return preflight;
  }

  if (request.method !== "POST") {
    return failure(405, "method_not_allowed", "Use POST for session-heartbeat.");
  }

  const body = await readJsonBody<HeartbeatRequest>(request);
  if (!body) {
    return failure(400, "bad_request", "Request body must be valid JSON.");
  }

  const sessionToken = String(body.sessionToken ?? "").trim();
  const deviceId = String(body.deviceId ?? "").trim();
  const mode = body.mode === undefined || body.mode === null ? null : String(body.mode).trim();

  if (!sessionToken || !deviceId) {
    return failure(400, "bad_request", "sessionToken and deviceId are required.");
  }

  const supabase = createSupabaseServiceClient();
  const sessionTokenHash = await buildSessionTokenHash(sessionToken, getRequiredEnv("SESSION_TOKEN_PEPPER"));
  const serverTime = nowIso();
  const sessionTtlMs = getSessionTtlMs();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, license_id, device_id, mode, status, expires_at, heartbeat_count")
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle();

  if (sessionError) {
    return failure(502, "backend_error", "Failed to read session.", sessionError.message);
  }

  if (!session) {
    return failure(410, "session_missing", "Session no longer exists.");
  }

  if (mode && session.mode !== mode) {
    return failure(409, "mode_mismatch", "Heartbeat mode does not match the session.");
  }

  if (session.status !== "active") {
    return failure(410, "session_inactive", "Session is not active.");
  }

  const { data: license, error: licenseError } = await supabase
    .from("licenses")
    .select("status, current_period_end, revoked_at")
    .eq("id", session.license_id)
    .maybeSingle();

  if (licenseError) {
    return failure(502, "backend_error", "Failed to read license state.", licenseError.message);
  }

  if (!license || license.status !== "active") {
    const { error: revokeError } = await supabase
      .from("sessions")
      .update({
        status: "revoked",
        revoked_at: serverTime
      })
      .eq("id", session.id);

    if (revokeError) {
      return failure(502, "backend_error", "Failed to revoke invalid session.", revokeError.message);
    }

    return failure(403, "license_inactive", "License is not active.");
  }

  if (license.current_period_end && Date.now() >= new Date(license.current_period_end).getTime()) {
    const { error: revokeError } = await supabase
      .from("sessions")
      .update({
        status: "expired",
        revoked_at: serverTime
      })
      .eq("id", session.id);

    if (revokeError) {
      return failure(502, "backend_error", "Failed to expire session.", revokeError.message);
    }

    return failure(410, "session_expired", "Session has expired.");
  }

  const { data: device, error: deviceLookupError } = await supabase
    .from("devices")
    .select("device_id, status, revoked_at")
    .eq("id", session.device_id)
    .maybeSingle();

  if (deviceLookupError) {
    return failure(502, "backend_error", "Failed to read device state.", deviceLookupError.message);
  }

  if (!device || device.status !== "active") {
    const { error: revokeError } = await supabase
      .from("sessions")
      .update({
        status: "revoked",
        revoked_at: serverTime
      })
      .eq("id", session.id);

    if (revokeError) {
      return failure(502, "backend_error", "Failed to revoke session.", revokeError.message);
    }

    return failure(403, "device_revoked", "This device is revoked.");
  }

  if (String(device.device_id) !== deviceId) {
    return failure(403, "device_mismatch", "Heartbeat device does not match the session.");
  }

  const expiresAt = new Date(session.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
    const { error: expireError } = await supabase
      .from("sessions")
      .update({
        status: "expired",
        revoked_at: serverTime
      })
      .eq("id", session.id);

    if (expireError) {
      return failure(502, "backend_error", "Failed to mark session expired.", expireError.message);
    }

    return failure(410, "session_expired", "Session has expired.");
  }

  const renewedAt = addMilliseconds(new Date(serverTime), sessionTtlMs).toISOString();
  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      expires_at: renewedAt,
      last_heartbeat_at: serverTime,
      heartbeat_count: session.heartbeat_count + 1
    })
    .eq("id", session.id);

  if (updateError) {
    return failure(502, "backend_error", "Failed to renew session.", updateError.message);
  }

  const { error: deviceUpdateError } = await supabase
    .from("devices")
    .update({
      last_seen_at: serverTime
    })
    .eq("id", session.device_id);

  if (deviceUpdateError) {
    return failure(502, "backend_error", "Failed to update device activity.", deviceUpdateError.message);
  }

  return json({
    status: "active",
    expiresAt: renewedAt,
    serverTime,
    heartbeatCount: session.heartbeat_count + 1
  });
});
