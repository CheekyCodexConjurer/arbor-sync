import { createSupabaseAdmin } from "./lib/supabase.mjs";
import { TelegramClient } from "./telegram/client.mjs";
import { SessionStore } from "./telegram/session-store.mjs";
import { createRouter } from "./telegram/router.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runBot(config, runtimeState) {
  const db = createSupabaseAdmin(config);
  const client = new TelegramClient(config);
  const sessionStore = new SessionStore();
  const router = createRouter({
    config,
    client,
    db,
    sessionStore
  });

  let offset = 0;
  try {
    const botProfile = await client.getMe();
    console.log(
      `[telegram-admin-bot] booted for project ${config.projectRef}; admin=${config.adminTelegramUserId}; bot=@${botProfile.username || "unknown"}`
    );
  } catch (error) {
    console.error(`[telegram-admin-bot] startup check failed: ${error.message}`);
    runtimeState?.markPollingError(error, offset);
  }

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
