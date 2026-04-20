async function countRows(query) {
  const { count, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return Number(count || 0);
}

export async function getDashboardSummary(db) {
  const [
    totalLicenses,
    activeLicenses,
    expiredLicenses,
    revokedLicenses,
    activeDevices,
    activeSessions,
    payloads
  ] = await Promise.all([
    countRows(db.from("licenses").select("id", { count: "exact", head: true })),
    countRows(db.from("licenses").select("id", { count: "exact", head: true }).eq("status", "active")),
    countRows(db.from("licenses").select("id", { count: "exact", head: true }).eq("status", "expired")),
    countRows(db.from("licenses").select("id", { count: "exact", head: true }).eq("status", "revoked")),
    countRows(db.from("devices").select("id", { count: "exact", head: true }).eq("status", "active")),
    countRows(db.from("sessions").select("id", { count: "exact", head: true }).eq("status", "active")),
    db
      .from("mode_payloads")
      .select("mode, version, active")
      .eq("active", true)
      .order("mode")
      .then(({ data, error }) => {
        if (error) {
          throw new Error(error.message);
        }

        return Array.isArray(data) ? data : [];
      })
  ]);

  return {
    totalLicenses,
    activeLicenses,
    expiredLicenses,
    revokedLicenses,
    activeDevices,
    activeSessions,
    payloads
  };
}
