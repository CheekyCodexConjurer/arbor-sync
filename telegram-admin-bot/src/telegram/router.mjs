import {
  formatAccessDenied,
  formatConfigView,
  formatDashboardSummary,
  formatDeviceList,
  formatHelp,
  formatJobs,
  formatLicenseDetails,
  formatLicenseList,
  formatPayloadSummary,
  formatPayloadVersions
} from "../lib/format.mjs";
import { normalizePayloadUpload, parseJsonDocument } from "../lib/json.mjs";
import { logAdminAction } from "../services/audit-service.mjs";
import { getDashboardSummary } from "../services/dashboard-service.mjs";
import { getDeviceById, listDevicesForLicense, reactivateDevice, revokeDevice } from "../services/device-service.mjs";
import {
  createLicense,
  findLicensesByQuery,
  getLicenseById,
  listActiveLicenses,
  reactivateLicense,
  renewLicenseDays,
  revokeLicense,
  updateLicenseMaxDevices,
  updateLicensePlan
} from "../services/license-service.mjs";
import { listAdminJobs, toggleAdminJob } from "../services/job-service.mjs";
import {
  activatePayloadVersion,
  getActivePayloads,
  getDecodedActivePayloadByMode,
  listPayloadVersions,
  uploadPayloadVersion
} from "../services/payload-service.mjs";
import {
  buildConfigMenu,
  buildDevicesMenu,
  buildLicenseCreateDurationMenu,
  buildLicenseCreateMaxDevicesMenu,
  buildLicenseCreatePlanMenu,
  buildLicenseDetailsMenu,
  buildLicenseListMenu,
  buildLicensesMenu,
  buildMainMenu,
  buildPayloadModeMenu,
  buildPayloadsMenu,
  buildPayloadVersionMenu,
  buildPlanChoiceMenu,
  buildRenewChoiceMenu,
  buildScriptsMenu
} from "./menus.mjs";

function getActor(update) {
  return update?.callback_query?.from || update?.message?.from || null;
}

function getChatId(update) {
  return update?.callback_query?.message?.chat?.id || update?.message?.chat?.id || null;
}

function getMessageId(update) {
  return update?.callback_query?.message?.message_id || null;
}

function isAdmin(config, update) {
  const actor = getActor(update);
  return String(actor?.id || "") === String(config.adminTelegramUserId);
}

async function sendOrEdit(client, update, text, extra = {}) {
  const chatId = getChatId(update);
  const messageId = getMessageId(update);

  if (update.callback_query && messageId) {
    return client.editMessage(chatId, messageId, text, extra);
  }

  return client.sendMessage(chatId, text, extra);
}

function extractCallbackData(update) {
  return String(update?.callback_query?.data || "").trim();
}

function getState(sessionStore, chatId) {
  return sessionStore.get(chatId);
}

function setState(sessionStore, chatId, state) {
  sessionStore.set(chatId, state);
}

function clearState(sessionStore, chatId) {
  sessionStore.clear(chatId);
}

function parsePositiveInteger(text) {
  const value = Number.parseInt(String(text || "").trim(), 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Envie um numero inteiro positivo.");
  }

  return value;
}

function parseTextValue(text) {
  const value = String(text || "").trim();
  if (!value) {
    throw new Error("Envie um valor valido.");
  }

  return value;
}

async function audit(db, update, action, targetType, targetId, metadata = {}) {
  await logAdminAction(db, {
    actorTelegramUserId: getActor(update)?.id,
    action,
    targetType,
    targetId,
    metadata
  });
}

export function createRouter({ config, client, db, sessionStore }) {
  async function showMainMenu(update) {
    clearState(sessionStore, getChatId(update));
    return sendOrEdit(client, update, `${config.botName}\n\nEscolha uma area do painel.`, buildMainMenu());
  }

  async function showDashboard(update) {
    const summary = await getDashboardSummary(db);
    return sendOrEdit(client, update, formatDashboardSummary(summary), buildMainMenu());
  }

  async function showLicensesMenu(update) {
    clearState(sessionStore, getChatId(update));
    return sendOrEdit(client, update, "Menu de licencas", buildLicensesMenu());
  }

  async function showActiveLicenses(update) {
    const licenses = await listActiveLicenses(db, 10);
    return sendOrEdit(client, update, formatLicenseList(licenses), buildLicenseListMenu(licenses));
  }

  async function showLicenseDetails(update, licenseId) {
    const license = await getLicenseById(db, licenseId);
    const devices = license ? await listDevicesForLicense(db, license.id) : [];
    if (!license) {
      return sendOrEdit(client, update, "Licenca nao encontrada.", buildLicensesMenu());
    }

    return sendOrEdit(client, update, formatLicenseDetails(license, devices), buildLicenseDetailsMenu(license));
  }

  async function showLicenseDevices(update, licenseId) {
    const license = await getLicenseById(db, licenseId);
    if (!license) {
      return sendOrEdit(client, update, "Licenca nao encontrada.", buildLicensesMenu());
    }

    const devices = await listDevicesForLicense(db, licenseId);
    return sendOrEdit(client, update, formatDeviceList(license, devices), buildDevicesMenu(licenseId, devices));
  }

  async function showPayloadMenu(update) {
    clearState(sessionStore, getChatId(update));
    const payloads = await getActivePayloads(db);
    return sendOrEdit(client, update, formatPayloadSummary(payloads), buildPayloadsMenu());
  }

  async function showScripts(update) {
    clearState(sessionStore, getChatId(update));
    const jobs = await listAdminJobs(db);
    return sendOrEdit(client, update, formatJobs(jobs), buildScriptsMenu(jobs));
  }

  async function showConfig(update) {
    clearState(sessionStore, getChatId(update));
    return sendOrEdit(client, update, formatConfigView(config), buildConfigMenu());
  }

  async function handleCreateLicensePlan(update, plan) {
    const chatId = getChatId(update);
    setState(sessionStore, chatId, {
      kind: "license-create",
      draft: {
        plan
      }
    });
    return sendOrEdit(client, update, `Plano escolhido: ${plan}\n\nAgora escolha o limite de devices.`, buildLicenseCreateMaxDevicesMenu());
  }

  async function handleCreateLicenseMaxDevices(update, maxDevices) {
    const chatId = getChatId(update);
    const state = getState(sessionStore, chatId) || { kind: "license-create", draft: {} };
    setState(sessionStore, chatId, {
      kind: "license-create",
      draft: {
        ...state.draft,
        maxDevices
      }
    });
    return sendOrEdit(client, update, `Limite escolhido: ${maxDevices}\n\nAgora escolha a duracao.`, buildLicenseCreateDurationMenu());
  }

  async function finalizeLicenseCreation(update, durationDays) {
    const chatId = getChatId(update);
    const state = getState(sessionStore, chatId);
    if (!state?.draft?.plan || !state?.draft?.maxDevices) {
      clearState(sessionStore, chatId);
      return sendOrEdit(client, update, "Fluxo de criacao expirou. Tente novamente.", buildLicensesMenu());
    }

    const license = await createLicense(db, {
      plan: state.draft.plan,
      maxDevices: state.draft.maxDevices,
      durationDays
    });
    await audit(db, update, "license_created", "license", license.id, {
      licenseKey: license.license_key,
      plan: license.plan,
      maxDevices: license.max_devices,
      durationDays
    });
    clearState(sessionStore, chatId);
    return sendOrEdit(client, update, `Licenca criada com sucesso.\n\n${formatLicenseDetails(license, [])}`, buildLicenseDetailsMenu(license));
  }

  async function handleTextState(update) {
    const chatId = getChatId(update);
    const state = getState(sessionStore, chatId);
    const text = update?.message?.text || "";

    if (!state) {
      return client.sendMessage(chatId, formatHelp(), buildMainMenu());
    }

    if (state.kind === "license-search") {
      const licenses = await findLicensesByQuery(db, text);
      clearState(sessionStore, chatId);
      return client.sendMessage(chatId, formatLicenseList(licenses), buildLicenseListMenu(licenses));
    }

    if (state.kind === "device-license-search") {
      const licenses = await findLicensesByQuery(db, text);
      clearState(sessionStore, chatId);
      if (!licenses[0]) {
        return client.sendMessage(chatId, "Nenhuma licenca encontrada.", buildMainMenu());
      }

      return showLicenseDevices(update, licenses[0].id);
    }

    if (state.kind === "license-create-custom-plan") {
      const plan = parseTextValue(text);
      return handleCreateLicensePlan(update, plan);
    }

    if (state.kind === "license-create-custom-max") {
      const maxDevices = parsePositiveInteger(text);
      return handleCreateLicenseMaxDevices(update, maxDevices);
    }

    if (state.kind === "license-create-custom-days") {
      const days = parsePositiveInteger(text);
      return finalizeLicenseCreation(update, days);
    }

    if (state.kind === "license-update-plan") {
      const plan = parseTextValue(text);
      const license = await updateLicensePlan(db, state.licenseId, plan);
      await audit(db, update, "license_plan_updated", "license", license.id, { plan });
      clearState(sessionStore, chatId);
      return client.sendMessage(chatId, `Plano atualizado para ${plan}.`, buildLicenseDetailsMenu(license));
    }

    if (state.kind === "license-update-max") {
      const maxDevices = parsePositiveInteger(text);
      const license = await updateLicenseMaxDevices(db, state.licenseId, maxDevices);
      await audit(db, update, "license_max_devices_updated", "license", license.id, { maxDevices });
      clearState(sessionStore, chatId);
      return client.sendMessage(chatId, `Limite atualizado para ${maxDevices}.`, buildLicenseDetailsMenu(license));
    }

    if (state.kind === "license-renew") {
      const days = parsePositiveInteger(text);
      const license = await renewLicenseDays(db, state.licenseId, days);
      await audit(db, update, "license_renewed", "license", license.id, { days });
      clearState(sessionStore, chatId);
      return client.sendMessage(chatId, `Licenca renovada por ${days} dias.`, buildLicenseDetailsMenu(license));
    }

    return client.sendMessage(chatId, formatHelp(), buildMainMenu());
  }

  async function handleDocumentState(update) {
    const chatId = getChatId(update);
    const state = getState(sessionStore, chatId);
    if (!state || state.kind !== "payload-upload") {
      return client.sendMessage(chatId, "No momento eu nao estou esperando nenhum arquivo JSON.", buildPayloadsMenu());
    }

    const document = update?.message?.document;
    if (!document?.file_id) {
      return client.sendMessage(chatId, "Envie um arquivo .json valido.", buildPayloadsMenu());
    }

    const file = await client.getFile(document.file_id);
    const fileBuffer = await client.downloadFile(file.file_path);
    const rawJson = parseJsonDocument(fileBuffer);
    const currentPayload = await getDecodedActivePayloadByMode(db, state.mode, config.payloadEncryptionSecret);
    const normalizedPayload = normalizePayloadUpload(rawJson, state.mode, currentPayload?.decodedPayload || null);
    const inserted = await uploadPayloadVersion(db, state.mode, normalizedPayload, config.payloadEncryptionSecret);
    await audit(db, update, "payload_uploaded", "payload", inserted.id, {
      mode: state.mode,
      version: inserted.version,
      fileName: document.file_name || null
    });
    clearState(sessionStore, chatId);
    return client.sendMessage(
      chatId,
      `Novo payload ${state.mode.toUpperCase()} enviado.\nVersao ativa: v${inserted.version}\nHash: ${inserted.payload_hash}`,
      buildPayloadsMenu()
    );
  }

  async function handleCallback(update) {
    const data = extractCallbackData(update);
    const chatId = getChatId(update);
    const parts = data.split(":");

    if (data === "nav:home") {
      await client.answerCallbackQuery(update.callback_query.id);
      return showMainMenu(update);
    }

    if (data === "nav:summary") {
      await client.answerCallbackQuery(update.callback_query.id);
      return showDashboard(update);
    }

    if (data === "nav:licenses") {
      await client.answerCallbackQuery(update.callback_query.id);
      return showLicensesMenu(update);
    }

    if (data === "nav:devices") {
      setState(sessionStore, chatId, { kind: "device-license-search" });
      await client.answerCallbackQuery(update.callback_query.id, "Envie a licenca");
      return sendOrEdit(client, update, "Envie a chave ou parte da chave da licenca para ver os devices.", buildMainMenu());
    }

    if (data === "nav:payloads") {
      await client.answerCallbackQuery(update.callback_query.id);
      return showPayloadMenu(update);
    }

    if (data === "nav:scripts") {
      await client.answerCallbackQuery(update.callback_query.id);
      return showScripts(update);
    }

    if (data === "nav:config") {
      await client.answerCallbackQuery(update.callback_query.id);
      return showConfig(update);
    }

    if (data === "license:list") {
      await client.answerCallbackQuery(update.callback_query.id);
      return showActiveLicenses(update);
    }

    if (data === "license:search") {
      setState(sessionStore, chatId, { kind: "license-search" });
      await client.answerCallbackQuery(update.callback_query.id, "Envie a licenca");
      return sendOrEdit(client, update, "Envie a chave completa ou parte dela para buscar a licenca.", buildLicensesMenu());
    }

    if (data === "license:create") {
      setState(sessionStore, chatId, {
        kind: "license-create",
        draft: {}
      });
      await client.answerCallbackQuery(update.callback_query.id);
      return sendOrEdit(client, update, "Criar nova licenca\n\nEscolha o plano.", buildLicenseCreatePlanMenu());
    }

    if (data === "license:create:plan_custom") {
      setState(sessionStore, chatId, { kind: "license-create-custom-plan" });
      await client.answerCallbackQuery(update.callback_query.id);
      return sendOrEdit(client, update, "Envie o nome do plano custom.", buildLicensesMenu());
    }

    if (parts[0] === "license" && parts[1] === "create" && parts[2] === "plan") {
      await client.answerCallbackQuery(update.callback_query.id);
      return handleCreateLicensePlan(update, parts[3]);
    }

    if (data === "license:create:max_custom") {
      setState(sessionStore, chatId, {
        kind: "license-create-custom-max",
        draft: getState(sessionStore, chatId)?.draft || {}
      });
      await client.answerCallbackQuery(update.callback_query.id);
      return sendOrEdit(client, update, "Envie o limite de devices.", buildLicensesMenu());
    }

    if (parts[0] === "license" && parts[1] === "create" && parts[2] === "max") {
      await client.answerCallbackQuery(update.callback_query.id);
      return handleCreateLicenseMaxDevices(update, Number(parts[3]));
    }

    if (data === "license:create:days_custom") {
      setState(sessionStore, chatId, {
        kind: "license-create-custom-days",
        draft: getState(sessionStore, chatId)?.draft || {}
      });
      await client.answerCallbackQuery(update.callback_query.id);
      return sendOrEdit(client, update, "Envie a duracao em dias.", buildLicensesMenu());
    }

    if (parts[0] === "license" && parts[1] === "create" && parts[2] === "days") {
      await client.answerCallbackQuery(update.callback_query.id);
      return finalizeLicenseCreation(update, Number(parts[3]));
    }

    if (parts[0] === "license" && parts[1] === "view") {
      await client.answerCallbackQuery(update.callback_query.id);
      return showLicenseDetails(update, parts[2]);
    }

    if (parts[0] === "license" && parts[1] === "devices") {
      await client.answerCallbackQuery(update.callback_query.id);
      return showLicenseDevices(update, parts[2]);
    }

    if (parts[0] === "license" && parts[1] === "plan" && parts.length === 3) {
      await client.answerCallbackQuery(update.callback_query.id);
      return sendOrEdit(client, update, "Escolha o novo plano.", buildPlanChoiceMenu(parts[2]));
    }

    if (parts[0] === "license" && parts[1] === "plan" && parts[2] === "custom") {
      setState(sessionStore, chatId, { kind: "license-update-plan", licenseId: parts[3] });
      await client.answerCallbackQuery(update.callback_query.id);
      return sendOrEdit(client, update, "Envie o novo plano.", buildLicensesMenu());
    }

    if (parts[0] === "license" && parts[1] === "plan" && parts[2] === "set") {
      const license = await updateLicensePlan(db, parts[3], parts[4]);
      await audit(db, update, "license_plan_updated", "license", license.id, { plan: parts[4] });
      await client.answerCallbackQuery(update.callback_query.id, "Plano atualizado");
      return sendOrEdit(client, update, `Plano atualizado para ${parts[4]}.`, buildLicenseDetailsMenu(license));
    }

    if (parts[0] === "license" && parts[1] === "max") {
      setState(sessionStore, chatId, { kind: "license-update-max", licenseId: parts[2] });
      await client.answerCallbackQuery(update.callback_query.id);
      return sendOrEdit(client, update, "Envie o novo limite de devices.", buildLicensesMenu());
    }

    if (parts[0] === "license" && parts[1] === "renew" && parts.length === 3) {
      await client.answerCallbackQuery(update.callback_query.id);
      return sendOrEdit(client, update, "Escolha a renovacao.", buildRenewChoiceMenu(parts[2]));
    }

    if (parts[0] === "license" && parts[1] === "renew" && parts[2] === "custom") {
      setState(sessionStore, chatId, { kind: "license-renew", licenseId: parts[3] });
      await client.answerCallbackQuery(update.callback_query.id);
      return sendOrEdit(client, update, "Envie a quantidade de dias para renovar.", buildLicensesMenu());
    }

    if (parts[0] === "license" && parts[1] === "renewdays") {
      const license = await renewLicenseDays(db, parts[2], Number(parts[3]));
      await audit(db, update, "license_renewed", "license", license.id, { days: Number(parts[3]) });
      await client.answerCallbackQuery(update.callback_query.id, "Licenca renovada");
      return sendOrEdit(client, update, `Licenca renovada por ${parts[3]} dias.`, buildLicenseDetailsMenu(license));
    }

    if (parts[0] === "license" && parts[1] === "revoke") {
      const license = await revokeLicense(db, parts[2]);
      await audit(db, update, "license_revoked", "license", license.id, {});
      await client.answerCallbackQuery(update.callback_query.id, "Licenca revogada");
      return sendOrEdit(client, update, "Licenca revogada.", buildLicenseDetailsMenu(license));
    }

    if (parts[0] === "license" && parts[1] === "reactivate") {
      const license = await reactivateLicense(db, parts[2], 30);
      await audit(db, update, "license_reactivated", "license", license.id, { days: 30 });
      await client.answerCallbackQuery(update.callback_query.id, "Licenca reativada");
      return sendOrEdit(client, update, "Licenca reativada por 30 dias.", buildLicenseDetailsMenu(license));
    }

    if (parts[0] === "device" && parts[1] === "view") {
      const licenseId = parts[3];
      await client.answerCallbackQuery(update.callback_query.id);
      return showLicenseDevices(update, licenseId);
    }

    if (parts[0] === "device" && parts[1] === "revoke") {
      const device = await revokeDevice(db, parts[2]);
      await audit(db, update, "device_revoked", "device", device.id, { licenseId: parts[3] });
      await client.answerCallbackQuery(update.callback_query.id, "Device revogado");
      return showLicenseDevices(update, parts[3]);
    }

    if (parts[0] === "device" && parts[1] === "reactivate") {
      const device = await reactivateDevice(db, parts[2]);
      await audit(db, update, "device_reactivated", "device", device.id, { licenseId: parts[3] });
      await client.answerCallbackQuery(update.callback_query.id, "Device reativado");
      return showLicenseDevices(update, parts[3]);
    }

    if (data === "payload:summary") {
      await client.answerCallbackQuery(update.callback_query.id);
      return showPayloadMenu(update);
    }

    if (data === "payload:new") {
      setState(sessionStore, chatId, { kind: "payload-select-mode" });
      await client.answerCallbackQuery(update.callback_query.id);
      return sendOrEdit(client, update, "Escolha para qual site voce quer enviar o novo JSON.", buildPayloadModeMenu());
    }

    if (parts[0] === "payload" && parts[1] === "new" && parts[2]) {
      setState(sessionStore, chatId, {
        kind: "payload-upload",
        mode: parts[2]
      });
      await client.answerCallbackQuery(update.callback_query.id, "Envie o JSON");
      return sendOrEdit(
        client,
        update,
        `Modo escolhido: ${parts[2].toUpperCase()}\n\nAgora envie o arquivo JSON. Pode ser um array de cookies ou um objeto com \`cookies\`, \`proxy\` e \`targetUrl\`.`,
        buildPayloadsMenu()
      );
    }

    if (parts[0] === "payload" && parts[1] === "list") {
      const versions = await listPayloadVersions(db, parts[2], 6);
      await client.answerCallbackQuery(update.callback_query.id);
      return sendOrEdit(client, update, formatPayloadVersions(parts[2], versions), buildPayloadVersionMenu(parts[2], versions));
    }

    if (parts[0] === "payload" && parts[1] === "activate") {
      const payload = await activatePayloadVersion(db, parts[2], Number(parts[3]));
      await audit(db, update, "payload_activated", "payload", payload.id, {
        mode: parts[2],
        version: Number(parts[3])
      });
      const versions = await listPayloadVersions(db, parts[2], 6);
      await client.answerCallbackQuery(update.callback_query.id, "Payload ativado");
      return sendOrEdit(client, update, formatPayloadVersions(parts[2], versions), buildPayloadVersionMenu(parts[2], versions));
    }

    if (parts[0] === "job" && parts[1] === "toggle") {
      const job = await toggleAdminJob(db, parts[2], parts[3] === "on");
      await audit(db, update, "job_toggled", "job", job.id, { enabled: job.enabled, jobKey: job.job_key });
      await client.answerCallbackQuery(update.callback_query.id, job.enabled ? "Script ligado" : "Script desligado");
      return showScripts(update);
    }

    await client.answerCallbackQuery(update.callback_query.id);
    return sendOrEdit(client, update, formatHelp(), buildMainMenu());
  }

  async function handleMessage(update) {
    const chatId = getChatId(update);
    const text = String(update?.message?.text || "").trim();
    const document = update?.message?.document || null;

    if (text === "/start" || text === "/menu") {
      return showMainMenu(update);
    }

    if (text === "/cancel") {
      clearState(sessionStore, chatId);
      return client.sendMessage(chatId, "Fluxo cancelado.", buildMainMenu());
    }

    if (document) {
      return handleDocumentState(update);
    }

    if (text) {
      return handleTextState(update);
    }

    return client.sendMessage(chatId, formatHelp(), buildMainMenu());
  }

  async function handleUpdate(update) {
    if (!isAdmin(config, update)) {
      const chatId = getChatId(update);
      if (chatId) {
        await client.sendMessage(chatId, formatAccessDenied());
      }
      return;
    }

    try {
      if (update.callback_query) {
        await handleCallback(update);
        return;
      }

      if (update.message) {
        await handleMessage(update);
      }
    } catch (error) {
      console.error(`[telegram-admin-bot] route error: ${error.message}`);
      const chatId = getChatId(update);
      if (chatId) {
        await client.sendMessage(chatId, `Erro: ${error.message}`, buildMainMenu());
      }
    }
  }

  return {
    handleUpdate
  };
}
