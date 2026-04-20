import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdmin(config) {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        "x-client-info": "arbor-sync-telegram-admin-bot"
      }
    }
  });
}
