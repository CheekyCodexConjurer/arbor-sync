function button(text, callbackData) {
  return {
    text,
    callback_data: callbackData
  };
}

function inlineKeyboard(rows) {
  return {
    reply_markup: {
      inline_keyboard: rows
    },
    parse_mode: "Markdown"
  };
}

export function buildMainMenu() {
  return inlineKeyboard([
    [button("📊 Resumo Geral", "nav:summary"), button("🔑 Licenças", "nav:licenses")],
    [button("📱 Devices", "nav:devices"), button("📦 Payloads JSON", "nav:payloads")],
    [button("⚙️ Scripts", "nav:scripts"), button("🔧 Configurações", "nav:config")]
  ]);
}

export function buildLicensesMenu() {
  return inlineKeyboard([
    [button("📋 Listar ativas", "license:list"), button("🔍 Buscar", "license:search")],
    [button("✨ Criar nova licença", "license:create")],
    [button("🔙 Voltar", "nav:home")]
  ]);
}

export function buildLicenseListMenu(licenses) {
  const rows = licenses.slice(0, 8).map((license) => [
    button(`🔑 ${license.license_key.slice(0, 24)}...`, `license:view:${license.id}`)
  ]);
  rows.push([button("🔙 Voltar", "nav:licenses")]);
  return inlineKeyboard(rows);
}

export function buildLicenseCreatePlanMenu() {
  return inlineKeyboard([
    [button("🌱 Default", "license:create:plan:default"), button("⭐ Plus", "license:create:plan:plus")],
    [button("🚀 Pro", "license:create:plan:pro"), button("✍️ Custom", "license:create:plan_custom")],
    [button("❌ Cancelar", "nav:licenses")]
  ]);
}

export function buildLicenseCreateMaxDevicesMenu() {
  return inlineKeyboard([
    [button("📱 1 Device", "license:create:max:1"), button("📱 2 Devices", "license:create:max:2")],
    [button("📱 3 Devices", "license:create:max:3"), button("✍️ Custom", "license:create:max_custom")],
    [button("❌ Cancelar", "nav:licenses")]
  ]);
}

export function buildLicenseCreateDurationMenu() {
  return inlineKeyboard([
    [button("📅 30 dias", "license:create:days:30"), button("📅 90 dias", "license:create:days:90")],
    [button("📅 365 dias", "license:create:days:365"), button("✍️ Custom", "license:create:days_custom")],
    [button("❌ Cancelar", "nav:licenses")]
  ]);
}

export function buildLicenseDetailsMenu(license) {
  const statusButton = license.status === "revoked"
    ? button("🟢 Reativar Licença", `license:reactivate:${license.id}`)
    : button("🔴 Revogar Licença", `license:revoke:${license.id}`);

  return inlineKeyboard([
    [button("🔄 Trocar plano", `license:plan:${license.id}`), button("📱 Alterar limite", `license:max:${license.id}`)],
    [button("⏳ Renovar dias", `license:renew:${license.id}`), button("👥 Ver devices", `license:devices:${license.id}`)],
    [statusButton],
    [button("🔙 Voltar", "nav:licenses")]
  ]);
}

export function buildPlanChoiceMenu(licenseId) {
  return inlineKeyboard([
    [button("🌱 Default", `license:plan:set:${licenseId}:default`), button("⭐ Plus", `license:plan:set:${licenseId}:plus`)],
    [button("🚀 Pro", `license:plan:set:${licenseId}:pro`), button("✍️ Custom", `license:plan:custom:${licenseId}`)],
    [button("🔙 Voltar", `license:view:${licenseId}`)]
  ]);
}

export function buildRenewChoiceMenu(licenseId) {
  return inlineKeyboard([
    [button("📅 30 dias", `license:renewdays:${licenseId}:30`), button("📅 90 dias", `license:renewdays:${licenseId}:90`)],
    [button("📅 365 dias", `license:renewdays:${licenseId}:365`), button("✍️ Custom", `license:renew:custom:${licenseId}`)],
    [button("🔙 Voltar", `license:view:${licenseId}`)]
  ]);
}

export function buildDevicesMenu(licenseId, devices) {
  const rows = devices.slice(0, 6).map((device) => {
    const action = device.status === "revoked"
      ? button("🟢 Ativar", `device:reactivate:${device.id}:${licenseId}`)
      : button("🔴 Revogar", `device:revoke:${device.id}:${licenseId}`);

    return [button(`📱 ${device.device_id.slice(0, 18)}`, `device:view:${device.id}:${licenseId}`), action];
  });

  rows.push([button("🔙 Voltar", `license:view:${licenseId}`)]);
  return inlineKeyboard(rows);
}

export function buildPayloadsMenu() {
  return inlineKeyboard([
    [button("📊 Resumo Payloads", "payload:summary"), button("➕ Novo JSON", "payload:new")],
    [button("📜 Histórico GPT", "payload:list:gpt")],
    [button("🔙 Voltar", "nav:home")]
  ]);
}

export function buildPayloadModeMenu() {
  return inlineKeyboard([
    [button("🌐 GPT", "payload:new:gpt")],
    [button("❌ Cancelar", "nav:payloads")]
  ]);
}

export function buildPayloadVersionMenu(mode, versions) {
  const rows = versions.slice(0, 6).map((row) => {
    if (row.active) {
      return [button(`✅ v${row.version} (Ativa)`, `payload:list:${mode}`)];
    }

    return [button(`🔄 Ativar v${row.version}`, `payload:activate:${mode}:${row.version}`)];
  });

  rows.push([button("🔙 Voltar", "nav:payloads")]);
  return inlineKeyboard(rows);
}

export function buildScriptsMenu(jobs) {
  const rows = jobs.map((job) => [
    button(job.enabled ? `⏹️ Desligar ${job.label}` : `▶️ Ligar ${job.label}`, `job:toggle:${job.job_key}:${job.enabled ? "off" : "on"}`)
  ]);
  rows.push([button("🔙 Voltar", "nav:home")]);
  return inlineKeyboard(rows);
}

export function buildConfigMenu() {
  return inlineKeyboard([
    [button("🔙 Voltar", "nav:home")]
  ]);
}
