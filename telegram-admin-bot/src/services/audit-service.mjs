export async function logAdminAction(db, entry) {
  const payload = {
    actor_telegram_user_id: String(entry.actorTelegramUserId),
    action: String(entry.action),
    target_type: String(entry.targetType),
    target_id: entry.targetId ? String(entry.targetId) : null,
    metadata: entry.metadata || {}
  };

  const { error } = await db.from("admin_audit_logs").insert(payload);
  if (error) {
    throw new Error(`Falha ao gravar auditoria: ${error.message}`);
  }
}
