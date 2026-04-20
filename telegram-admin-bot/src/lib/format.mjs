function formatDate(value) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatDashboardSummary(summary) {
  const payloadLines = summary.payloads
    .map((payload) => `🔹 ${payload.mode.toUpperCase()}: v${payload.version}${payload.active ? " ✅" : ""}`)
    .join("\n");

  return [
    "🌲 *Painel Arbor Sync*",
    "────────────────",
    `🔑 *Licenças totais:* ${summary.totalLicenses}`,
    `🟢 *Ativas:* ${summary.activeLicenses}`,
    `⏳ *Expiradas:* ${summary.expiredLicenses}`,
    `🔴 *Revogadas:* ${summary.revokedLicenses}`,
    "",
    `📱 *Devices ativos:* ${summary.activeDevices}`,
    `🔌 *Sessões online:* ${summary.activeSessions}`,
    "────────────────",
    "📦 *Payloads JSON ativos:*",
    payloadLines || "Nenhum payload ativo."
  ].join("\n");
}

export function formatLicenseList(licenses) {
  if (!licenses.length) {
    return "❌ *Nenhuma licença encontrada.*";
  }

  return [
    "📋 *Resultados de Licenças*",
    "────────────────",
    ...licenses.map((license) => (
      `🔑 \`${license.license_key}\`\n` +
      `📦 Plano: *${license.plan}* | 📱 Limite: *${license.max_devices}*\n` +
      `🚦 Status: ${license.status === 'active' ? '🟢 Ativa' : (license.status === 'revoked' ? '🔴 Revogada' : '⏳ Expirada')}\n` +
      `📅 Vence em: ${formatDate(license.current_period_end)}`
    ))
  ].join("\n\n");
}

export function formatLicenseDetails(license, devices = []) {
  return [
    "🔍 *Detalhes da Licença*",
    "────────────────",
    `🔑 Chave: \`${license.license_key}\``,
    `🚦 Status: ${license.status === 'active' ? '🟢 Ativa' : (license.status === 'revoked' ? '🔴 Revogada' : '⏳ Expirada')}`,
    `📦 Plano: *${license.plan}*`,
    `📱 Limite de Devices: *${license.max_devices}*`,
    `👥 Devices Conectados: *${devices.length}*`,
    `📅 Vence em: *${formatDate(license.current_period_end)}*`,
    `🕰️ Criada em: ${formatDate(license.created_at)}`
  ].join("\n");
}

export function formatDeviceList(license, devices) {
  if (!devices.length) {
    return `⚠️ Nenhum device conectado na licença:\n\`${license.license_key}\``;
  }

  return [
    `📱 *Devices da Licença*\n\`${license.license_key}\``,
    "────────────────",
    ...devices.map((device) => (
      `🆔 \`${device.device_id}\`\n` +
      `🚦 Status: ${device.status === 'active' ? '🟢 Ativo' : '🔴 Revogado'}\n` +
      `📡 Último ping: ${formatDate(device.last_seen_at)}`
    ))
  ].join("\n\n");
}

export function formatPayloadSummary(payloads) {
  if (!payloads.length) {
    return "⚠️ *Nenhum payload ativo no sistema.*";
  }

  return [
    "📦 *Payloads Ativos no Momento*",
    "────────────────",
    ...payloads.map((payload) => (
      `🌐 *${payload.mode.toUpperCase()}* (v${payload.version})\n` +
      `🔒 Hash: \`${payload.payload_hash.slice(0, 16)}...\`\n` +
      `⏱️ Atualizado: ${formatDate(payload.updated_at)}`
    ))
  ].join("\n\n");
}

export function formatPayloadVersions(mode, versions) {
  if (!versions.length) {
    return `⚠️ Nenhuma versão de payload encontrada para *${mode.toUpperCase()}*.`;
  }

  return [
    `📜 *Histórico de Payloads: ${mode.toUpperCase()}*`,
    "────────────────",
    ...versions.map((row) => (
      `🏷️ *v${row.version}* ${row.active ? "✅ (Ativa)" : ""}\n` +
      `🔒 Hash: \`${row.payload_hash.slice(0, 16)}...\`\n` +
      `⏱️ Criado em: ${formatDate(row.created_at)}`
    ))
  ].join("\n\n");
}

export function formatJobs(jobs) {
  if (!jobs.length) {
    return "⚠️ *Nenhum script/job cadastrado.*";
  }

  return [
    "⚙️ *Scripts e Rotinas Administrativas*",
    "────────────────",
    ...jobs.map((job) => (
      `🔧 *${job.label}*\n` +
      `🚦 Status: ${job.enabled ? '🟢 Ligado' : '🔴 Desligado'}\n` +
      `⏱️ Estado atual: ${job.status}\n` +
      `📅 Agenda: ${job.schedule_text || "Automático"}`
    ))
  ].join("\n\n");
}

export function formatConfigView(config) {
  return [
    "🔧 *Configurações do Sistema*",
    "────────────────",
    `🤖 *Bot:* ${config.botName}`,
    `🗄️ *Supabase Project:* ${config.projectRef}`,
    `👤 *Admin ID:* \`${config.adminTelegramUserId}\``,
    `⏱️ *Polling Timeout:* ${config.pollingTimeoutSec}s`,
    `📡 *Método:* Long Polling`
  ].join("\n");
}

export function formatAccessDenied() {
  return "⛔ *Acesso negado.*\nVocê não tem permissão para usar este bot administrativo.";
}

export function formatHelp() {
  return [
    "🌲 *Arbor Sync Admin Bot*",
    "Bem-vindo ao painel de controle.",
    "Utilize os botões interativos abaixo para navegar de forma rápida e segura.",
    "",
    "🛠️ *Comandos Manuais:*",
    "• /start - *Abrir o menu principal*",
    "• /cancel - *Cancelar a operação atual*"
  ].join("\n");
}
