import { getConfig } from "./config.mjs";
import { startHealthServer } from "./health-server.mjs";
import { runBot } from "./runtime.mjs";

const config = getConfig();
startHealthServer(config);
await runBot(config);
