export async function listDevicesForLicense(db, licenseId) {
  const { data, error } = await db
    .from("devices")
    .select("*")
    .eq("license_id", licenseId)
    .order("last_seen_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao listar devices: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

export async function getDeviceById(db, deviceId) {
  const { data, error } = await db
    .from("devices")
    .select("*")
    .eq("id", deviceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao buscar device: ${error.message}`);
  }

  return data;
}

export async function revokeDevice(db, deviceId) {
  const { data, error } = await db
    .from("devices")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString()
    })
    .eq("id", deviceId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao revogar device: ${error.message}`);
  }

  return data;
}

export async function reactivateDevice(db, deviceId) {
  const { data, error } = await db
    .from("devices")
    .update({
      status: "active",
      revoked_at: null
    })
    .eq("id", deviceId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao reativar device: ${error.message}`);
  }

  return data;
}
