import { html, options } from "../_shared/http.ts";
import { createSupabaseServiceClient } from "../_shared/session.ts";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function page(title: string, body: string) {
  return html(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F0F4F1;font-family:Outfit,system-ui,sans-serif;color:#2A3B31}
    main{width:min(420px,calc(100vw - 32px));padding:28px;border-radius:28px;background:rgba(255,255,255,.86);box-shadow:0 24px 80px rgba(42,59,49,.16)}
    h1{font-size:24px;margin:0 0 10px}
    p{color:#6B8073;line-height:1.5}
    code{display:block;padding:14px;border-radius:16px;background:#fff;border:1px solid rgba(0,0,0,.08);font-size:14px;word-break:break-all}
  </style>
</head>
<body><main>${body}</main></body>
</html>`);
}

Deno.serve(async (request) => {
  const preflight = options(request);
  if (preflight) {
    return preflight;
  }

  const url = new URL(request.url);
  if (url.searchParams.get("cancelled") === "1") {
    return page("Pagamento cancelado", "<h1>Pagamento cancelado</h1><p>Você pode voltar para a extensão e tentar novamente quando quiser.</p>");
  }

  const checkoutId = url.searchParams.get("checkout_id") || "";
  const sessionId = url.searchParams.get("session_id") || "";
  const token = url.searchParams.get("token") || "";
  const supabase = createSupabaseServiceClient();
  const { data: checkout } = await supabase
    .from("stripe_checkout_sessions")
    .select("status, license_key, stripe_session_id, success_token")
    .eq("id", checkoutId)
    .eq("success_token", token)
    .maybeSingle();

  if (!checkout || checkout.stripe_session_id !== sessionId) {
    return page("Checkout não encontrado", "<h1>Checkout não encontrado</h1><p>Volte para a extensão e gere um novo pagamento.</p>");
  }

  if (checkout.status !== "paid" || !checkout.license_key) {
    return page("Pagamento confirmado", "<h1>Pagamento confirmado</h1><p>Estamos ativando sua licença. Atualize esta página em alguns segundos.</p>");
  }

  return page(
    "Licença ativada",
    `<h1>Licença ativada</h1><p>Copie sua chave e cole na extensão Arbor Sync.</p><code>${escapeHtml(checkout.license_key)}</code>`
  );
});
