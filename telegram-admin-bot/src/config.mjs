import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const botRootDir = path.resolve(currentDir, "..");

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const values = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    values[key] = value.replace(/^"(.*)"$/, "$1");
  }

  return values;
}

function applyEnvFile(filePath) {
  const values = readEnvFile(filePath);
  for (const [key, value] of Object.entries(values)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getRequiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function extractProjectRef(supabaseUrl) {
  const match = String(supabaseUrl).match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/i);
  return match ? match[1] : "unknown";
}

export function getConfig() {
  applyEnvFile(path.join(botRootDir, ".env"));

  const telegramBotToken = getRequiredEnv("TELEGRAM_BOT_TOKEN");
  const adminTelegramUserId = String(process.env.ADMIN_TELEGRAM_USER_ID || "8756917796").trim();
  const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/+$/, "");
  const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const payloadEncryptionSecret = getRequiredEnv("PAYLOAD_ENCRYPTION_SECRET");
  const botName = String(process.env.BOT_NAME || "Arbor Sync Admin").trim() || "Arbor Sync Admin";
  const pollingTimeoutSec = parseInteger(process.env.POLLING_TIMEOUT_SEC, 30);
  const retryDelayMs = parseInteger(process.env.RETRY_DELAY_MS, 3000);

  return Object.freeze({
    botRootDir,
    telegramBotToken,
    adminTelegramUserId,
    supabaseUrl,
    supabaseServiceRoleKey,
    payloadEncryptionSecret,
    botName,
    pollingTimeoutSec,
    retryDelayMs,
    projectRef: extractProjectRef(supabaseUrl)
  });
}
