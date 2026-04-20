import { getConfig } from "./config.mjs";
import { createBotRuntime } from "./bot-runtime.mjs";
import { startHealthServer } from "./health-server.mjs";
import { createRuntimeState } from "./runtime-state.mjs";

const config = getConfig();
const runtimeState = createRuntimeState(config.telegramMode);
const botRuntime = await createBotRuntime(config, runtimeState);
startHealthServer(config, runtimeState, {
  handleWebhookUpdate: botRuntime.handleWebhookUpdate
});

if (config.telegramMode === "webhook") {
  await botRuntime.ensureWebhook();
} else {
  await botRuntime.startPolling();
}
