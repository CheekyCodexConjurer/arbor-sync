import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "telegram-admin-bot/.env.example",
  "telegram-admin-bot/src/index.mjs",
  "telegram-admin-bot/src/config.mjs",
  "telegram-admin-bot/src/bot-runtime.mjs",
  "telegram-admin-bot/src/runtime-state.mjs",
  "telegram-admin-bot/src/telegram/client.mjs",
  "telegram-admin-bot/src/telegram/router.mjs",
  "telegram-admin-bot/src/services/license-service.mjs",
  "telegram-admin-bot/src/services/payload-service.mjs",
  "supabase/migrations/20260419_add_admin_bot_tables.sql"
];

function assertFile(relativePath) {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
}

function readEnvExample() {
  const filePath = path.join(rootDir, "telegram-admin-bot/.env.example");
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  for (const relativePath of requiredFiles) {
    assertFile(relativePath);
  }

  const envExample = readEnvExample();
  const requiredKeys = [
    "TELEGRAM_BOT_TOKEN",
    "ADMIN_TELEGRAM_USER_ID",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "PAYLOAD_ENCRYPTION_SECRET",
    "TELEGRAM_WEBHOOK_URL",
    "TELEGRAM_WEBHOOK_SECRET"
  ];

  for (const key of requiredKeys) {
    if (!envExample.includes(`${key}=`)) {
      throw new Error(`Missing env example key: ${key}`);
    }
  }

  console.log("Telegram admin bot check passed.");
}

main();
