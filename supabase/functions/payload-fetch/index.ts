import { failure, json, options } from "../_shared/http.ts";
import {
  buildSessionTokenHash,
  createSupabaseServiceClient,
  decodePayloadBundle,
  getBearerToken,
  getRequiredEnv,
  isSupportedMode,
  nowIso
} from "../_shared/session.ts";

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) {
    return preflight;
  }

  if (request.method !== "GET" && request.method !== "POST") {
    return failure(405, "method_not_allowed", "Use GET or POST for payload-fetch.");
  }

  const token = getBearerToken(request);
  if (!token) {
    return failure(401, "unauthorized", "authorization token is required.");
  }

  const mode = new URL(request.url).searchParams.get("mode");
  if (!mode || !isSupportedMode(mode)) {
    return failure(400, "bad_request", "mode must be gpt, gemini or claude.");
  }

  const supabase = createSupabaseServiceClient();
  const sessionTokenHash = await buildSessionTokenHash(token, getRequiredEnv("SESSION_TOKEN_PEPPER"));
  const serverTime = nowIso();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, license_id, device_id, mode, status, expires_at")
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle();

  if (sessionError) {
    return failure(502, "backend_error", "Failed to read session.", sessionError.message);
  }

  if (!session) {
    return failure(410, "session_missing", "Session no longer exists.");
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
    .select("status, revoked_at")
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

  if (session.mode !== mode) {
    return failure(409, "mode_mismatch", "Requested mode does not match the session.");
  }

  if (Date.now() >= new Date(session.expires_at).getTime()) {
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

  const { data: payload, error: payloadError } = await supabase
    .from("mode_payloads")
    .select("version, encrypted_payload, payload_hash, active")
    .eq("mode", mode)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (payloadError) {
    return failure(502, "backend_error", "Failed to read payload data.", payloadError.message);
  }

  if (!payload?.encrypted_payload) {
    return failure(404, "payload_missing", "No active payload is configured for this mode.");
  }

  let decodedPayload: {
    cookies?: unknown;
    proxy?: unknown;
    targetUrl?: unknown;
  } | null = null;

  try {
    decodedPayload = await decodePayloadBundle(
      payload.encrypted_payload,
      getRequiredEnv("PAYLOAD_ENCRYPTION_KEY")
    ) as {
      cookies?: unknown;
      proxy?: unknown;
      targetUrl?: unknown;
    } | null;
  } catch (error) {
    return failure(502, "payload_decode_failed", "Failed to decode active payload.", String(error?.message || error));
  }

  const cookies = Array.isArray(decodedPayload?.cookies) ? decodedPayload.cookies : [];
  const proxy = decodedPayload?.proxy ?? null;
  const targetUrl = decodedPayload?.targetUrl ? String(decodedPayload.targetUrl) : null;

  return json({
    mode,
    sessionId: session.id,
    version: payload.version,
    payloadHash: payload.payload_hash,
    cookies,
    proxy,
    targetUrl,
    serverTime
  });
});
