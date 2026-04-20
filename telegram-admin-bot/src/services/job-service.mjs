export async function listAdminJobs(db) {
  const { data, error } = await db
    .from("admin_jobs")
    .select("*")
    .order("label");

  if (error) {
    throw new Error(`Falha ao listar scripts: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

export async function toggleAdminJob(db, jobKey, enabled) {
  const { data, error } = await db
    .from("admin_jobs")
    .update({
      enabled: Boolean(enabled)
    })
    .eq("job_key", jobKey)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar script: ${error.message}`);
  }

  return data;
}
