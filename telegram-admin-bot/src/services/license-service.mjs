import crypto from "node:crypto";

function buildLicenseKey() {
  return `ARBOR-${crypto.randomBytes(12).toString("hex").toUpperCase()}`;
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + Number(days));
  return date.toISOString();
}

export async function createLicense(db, input) {
  const payload = {
    license_key: buildLicenseKey(),
    status: "active",
    plan: String(input.plan || "default"),
    max_devices: Math.max(1, Number(input.maxDevices || 1)),
    current_period_end: addDays(Math.max(1, Number(input.durationDays || 30))),
    revoked_at: null
  };

  const { data, error } = await db
    .from("licenses")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao criar licenca: ${error.message}`);
  }

  return data;
}

export async function getLicenseById(db, licenseId) {
  const { data, error } = await db
    .from("licenses")
    .select("*")
    .eq("id", licenseId)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao buscar licenca: ${error.message}`);
  }

  return data;
}

export async function findLicensesByQuery(db, query) {
  const text = String(query || "").trim();
  if (!text) {
    return [];
  }

  const { data, error } = await db
    .from("licenses")
    .select("*")
    .ilike("license_key", `%${text}%`)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Falha ao buscar licencas: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

export async function listActiveLicenses(db, limit = 10) {
  const { data, error } = await db
    .from("licenses")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Falha ao listar licencas: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

export async function updateLicensePlan(db, licenseId, plan) {
  const { data, error } = await db
    .from("licenses")
    .update({ plan: String(plan).trim() || "default" })
    .eq("id", licenseId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar plano: ${error.message}`);
  }

  return data;
}

export async function updateLicenseMaxDevices(db, licenseId, maxDevices) {
  const { data, error } = await db
    .from("licenses")
    .update({ max_devices: Math.max(1, Number(maxDevices || 1)) })
    .eq("id", licenseId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar limite de devices: ${error.message}`);
  }

  return data;
}

export async function renewLicenseDays(db, licenseId, days) {
  const { data, error } = await db
    .from("licenses")
    .update({
      status: "active",
      revoked_at: null,
      current_period_end: addDays(days)
    })
    .eq("id", licenseId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao renovar licenca: ${error.message}`);
  }

  return data;
}

export async function revokeLicense(db, licenseId) {
  const { data, error } = await db
    .from("licenses")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString()
    })
    .eq("id", licenseId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao revogar licenca: ${error.message}`);
  }

  return data;
}

export async function reactivateLicense(db, licenseId, days = 30) {
  const { data, error } = await db
    .from("licenses")
    .update({
      status: "active",
      revoked_at: null,
      current_period_end: addDays(days)
    })
    .eq("id", licenseId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao reativar licenca: ${error.message}`);
  }

  return data;
}
