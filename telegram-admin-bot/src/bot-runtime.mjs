import { createSupabaseAdmin } from "./lib/supabase.mjs";
import { SessionStore } from "./telegram/session-store.mjs";
import { TelegramClient } from "./telegram/client.mjs";
import { createRouter } from "./telegram/router.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createBotRuntime(config, runtimeState) {
  const db = createSupabaseAdmin(config);
  const client = new TelegramClient(config);
  const sessionStore = new SessionStore();
  const router = createRouter({
    config,
    client,
    db,
    sessionStore
  });

  try {
    const botProfile = await client.getMe();
    console.log(
      `[telegram-admin-bot] booted for project ${config.projectRef}; mode=${config.telegramMode}; admin=${config.adminTelegramUserId}; bot=@${botProfile.username || "unknown"}`
    );
  } catch (error) {
    console.error(`[telegram-admin-bot] startup check failed: ${error.message}`);
    runtimeState?.markPollingError(error, 0);
  }

  async function startPolling() {
    let offset = 0;
    runtimeState?.setMode("polling");

    while (true) {
      try {
        runtimeState?.markPollingStart(offset);
        console.log(`[telegram-admin-bot] polling Telegram with offset=${offset}`);
        const updates = await client.getUpdates(offset, config.pollingTimeoutSec);
        runtimeState?.markPollingSuccess(offset, updates.length);
        console.log(`[telegram-admin-bot] Telegram returned ${updates.length} update(s)`);
        for (const update of updates) {
          offset = Math.max(offset, Number(update.update_id || 0) + 1);
          console.log(`[telegram-admin-bot] handling update ${update.update_id} with nextOffset=${offset}`);
          await router.handleUpdate(update);
          runtimeState?.markUpdateHandled(update.update_id, offset);
        }
      } catch (error) {
        runtimeState?.markPollingError(error, offset);
        console.error(`[telegram-admin-bot] polling error: ${error.message}`);
        await sleep(config.retryDelayMs);
      }
    }
  }

  async function ensureWebhook() {
    runtimeState?.setMode("webhook");
    await client.setWebhook(config.telegramWebhookUrl, config.telegramWebhookSecret);
    runtimeState?.markWebhookReady();
    console.log(`[telegram-admin-bot] webhook configured at ${config.telegramWebhookUrl}`);
  }

  async function handleWebhookUpdate(update) {
    const updateId = Number(update?.update_id || 0);
    runtimeState?.markWebhookReceived(updateId);
    try {
      await router.handleUpdate(update);
      runtimeState?.markWebhookHandled(updateId);
    } catch (error) {
      runtimeState?.markWebhookError(error, updateId);
      throw error;
    }
  }

  return {
    client,
    startPolling,
    ensureWebhook,
    handleWebhookUpdate
  };
}
