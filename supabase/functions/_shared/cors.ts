export const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-max-age": "86400",
  vary: "origin"
};

export function withCorsHeaders(headers: HeadersInit = {}) {
  return {
    ...corsHeaders,
    ...Object.fromEntries(new Headers(headers).entries())
  };
}

export function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
}
