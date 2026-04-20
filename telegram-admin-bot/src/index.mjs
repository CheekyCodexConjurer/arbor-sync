import { getConfig } from "./config.mjs";
import { startHealthServer } from "./health-server.mjs";
import { createRuntimeState } from "./runtime-state.mjs";
import { runBot } from "./runtime.mjs";

const config = getConfig();
const runtimeState = createRuntimeState();
startHealthServer(config, runtimeState);
await runBot(config, runtimeState);
