import http from "node:http";

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

export function startHealthServer(config, runtimeState, handlers = {}) {
  const port = Number.parseInt(String(process.env.PORT || "3000"), 10) || 3000;

  const server = http.createServer(async (request, response) => {
    const url = String(request.url || "/");

    if (url === "/health") {
      const snapshot = runtimeState?.snapshot?.() || {
        startedAt: new Date().toISOString(),
        mode: config.telegramMode,
        polling: null,
        webhook: null
      };
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        ok: true,
        service: "arbor-sync-telegram-admin-bot",
        botName: config.botName,
        projectRef: config.projectRef,
        startedAt: snapshot.startedAt,
        mode: snapshot.mode,
        polling: snapshot.polling,
        webhook: snapshot.webhook
      }));
      return;
    }

    if (url === "/telegram/webhook" && request.method === "POST") {
      try {
        if (config.telegramWebhookSecret) {
          const headerSecret = String(request.headers["x-telegram-bot-api-secret-token"] || "");
          if (headerSecret !== config.telegramWebhookSecret) {
            response.writeHead(401, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ ok: false, error: "invalid webhook secret" }));
            return;
          }
        }

        const rawBody = await readRequestBody(request);
        const update = rawBody ? JSON.parse(rawBody) : null;
        await handlers.handleWebhookUpdate?.(update);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));
      } catch (error) {
        runtimeState?.markWebhookError?.(error, 0);
        console.error(`[telegram-admin-bot] webhook error: ${error.message}`);
        response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: false, error: error.message }));
      }
      return;
    }

    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("Arbor Sync Telegram Admin Bot");
  });

  server.listen(port, "0.0.0.0");
  return server;
}
