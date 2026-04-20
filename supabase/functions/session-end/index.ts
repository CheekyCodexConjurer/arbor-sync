import { failure, json, options, readJsonBody } from "../_shared/http.ts";
import {
  buildSessionTokenHash,
  createSupabaseServiceClient,
  getRequiredEnv,
  nowIso
} from "../_shared/session.ts";

type EndSessionRequest = {
  sessionToken?: unknown;
  deviceId?: unknown;
};

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) {
    return preflight;
  }

  if (request.method !== "POST") {
    return failure(405, "method_not_allowed", "Use POST for session-end.");
  }

  const body = await readJsonBody<EndSessionRequest>(request);
  if (!body) {
    return failure(400, "bad_request", "Request body must be valid JSON.");
  }

  const sessionToken = String(body.sessionToken ?? "").trim();
  const deviceId = body.deviceId === undefined || body.deviceId === null ? null : String(body.deviceId).trim();

  if (!sessionToken) {
    return failure(400, "bad_request", "sessionToken is required.");
  }

  const supabase = createSupabaseServiceClient();
  const sessionTokenHash = await buildSessionTokenHash(sessionToken, getRequiredEnv("SESSION_TOKEN_PEPPER"));
  const serverTime = nowIso();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, device_id, status")
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle();

  if (sessionError) {
    return failure(502, "backend_error", "Failed to read session.", sessionError.message);
  }

  if (session) {
    if (deviceId) {
      const { data: device, error: deviceError } = await supabase
        .from("devices")
        .select("device_id")
        .eq("id", session.device_id)
        .maybeSingle();

      if (deviceError) {
        return failure(502, "backend_error", "Failed to read device.", deviceError.message);
      }

      if (!device || String(device.device_id) !== deviceId) {
        return failure(403, "device_mismatch", "Stop request device does not match the session.");
      }
    }

    const { error: updateError } = await supabase
      .from("sessions")
      .update({
        status: "revoked",
        revoked_at: serverTime
      })
      .eq("id", session.id);

    if (updateError) {
      return failure(502, "backend_error", "Failed to revoke session.", updateError.message);
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
  }

  return json({
    ended: true,
    endedAt: serverTime,
    status: session ? "revoked" : "missing"
  });
});
