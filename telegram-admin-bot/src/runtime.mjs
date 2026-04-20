import { createSupabaseAdmin } from "./lib/supabase.mjs";
import { TelegramClient } from "./telegram/client.mjs";
import { SessionStore } from "./telegram/session-store.mjs";
import { createRouter } from "./telegram/router.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runBot(config) {
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

  while (true) {
    try {
      const updates = await client.getUpdates(offset, config.pollingTimeoutSec);
      for (const update of updates) {
        offset = Math.max(offset, Number(update.update_id || 0) + 1);
        await router.handleUpdate(update);
      }
    } catch (error) {
      console.error(`[telegram-admin-bot] polling error: ${error.message}`);
      await sleep(config.retryDelayMs);
    }
  }
}
