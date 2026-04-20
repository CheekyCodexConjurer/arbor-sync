import { decodePayloadBundle, encryptPayloadBundle, sha256Hex } from "../lib/payload-crypto.mjs";

export async function getActivePayloads(db) {
  const { data, error } = await db
    .from("mode_payloads")
    .select("id, mode, version, payload_hash, active, created_at, updated_at")
    .eq("active", true)
    .order("mode")
    .order("version", { ascending: false });

  if (error) {
    throw new Error(`Falha ao buscar payloads ativos: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

export async function getDecodedActivePayloadByMode(db, mode, secret) {
  const { data, error } = await db
    .from("mode_payloads")
    .select("id, mode, version, encrypted_payload, payload_hash, active, created_at, updated_at")
    .eq("mode", mode)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao buscar payload ativo: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    ...data,
    decodedPayload: data.encrypted_payload
      ? await decodePayloadBundle(data.encrypted_payload, secret)
      : null
  };
}

export async function listPayloadVersions(db, mode, limit = 5) {
  const { data, error } = await db
    .from("mode_payloads")
    .select("id, mode, version, payload_hash, active, created_at, updated_at")
    .eq("mode", mode)
    .order("version", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Falha ao listar versoes: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

async function getNextVersion(db, mode) {
  const { data, error } = await db
    .from("mode_payloads")
    .select("version")
    .eq("mode", mode)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao calcular proxima versao: ${error.message}`);
  }

  return Number(data?.version || 0) + 1;
}

export async function uploadPayloadVersion(db, mode, payload, secret) {
  const version = await getNextVersion(db, mode);
  const encryptedPayload = await encryptPayloadBundle(payload, secret);
  const payloadHash = sha256Hex(JSON.stringify(payload));

  const { error: deactivateError } = await db
    .from("mode_payloads")
    .update({ active: false })
    .eq("mode", mode)
    .eq("active", true);

  if (deactivateError) {
    throw new Error(`Falha ao desativar payload anterior: ${deactivateError.message}`);
  }

  const { data, error } = await db
    .from("mode_payloads")
    .insert({
      mode,
      version,
      encrypted_payload: encryptedPayload,
      payload_hash: payloadHash,
      active: true
    })
    .select("id, mode, version, payload_hash, active, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(`Falha ao criar nova versao do payload: ${error.message}`);
  }

  return data;
}

export async function activatePayloadVersion(db, mode, version) {
  const { error: deactivateError } = await db
    .from("mode_payloads")
    .update({ active: false })
    .eq("mode", mode)
    .eq("active", true);

  if (deactivateError) {
    throw new Error(`Falha ao desativar payload atual: ${deactivateError.message}`);
  }

  const { data, error } = await db
    .from("mode_payloads")
    .update({ active: true })
    .eq("mode", mode)
    .eq("version", Number(version))
    .select("id, mode, version, payload_hash, active, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(`Falha ao ativar versao do payload: ${error.message}`);
  }

  return data;
}
