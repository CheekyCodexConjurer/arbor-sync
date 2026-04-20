import http from "node:http";

export function startHealthServer(config) {
  const port = Number.parseInt(String(process.env.PORT || "3000"), 10) || 3000;
  const startedAt = new Date().toISOString();

  const server = http.createServer((request, response) => {
    const url = String(request.url || "/");

    if (url === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        ok: true,
        service: "arbor-sync-telegram-admin-bot",
        botName: config.botName,
        projectRef: config.projectRef,
        startedAt
      }));
      return;
    }

    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("Arbor Sync Telegram Admin Bot");
  });

  server.listen(port, "0.0.0.0");
  return server;
}
