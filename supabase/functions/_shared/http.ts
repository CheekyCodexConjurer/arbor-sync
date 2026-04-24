import { corsHeaders, corsPreflight } from "./cors.ts";

export function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...Object.fromEntries(new Headers(headers).entries())
    }
  });
}

export function html(body: string, status = 200, headers: HeadersInit = {}) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...Object.fromEntries(new Headers(headers).entries())
    }
  });
}

export function failure(status: number, code: string, message: string, details?: unknown) {
  const errorBody: {
    error: {
      code: string;
      message: string;
      details?: unknown;
    };
  } = {
    error: {
      code,
      message
    }
  };

  if (details !== undefined) {
    errorBody.error.details = details;
  }

  return json(errorBody, status);
}

export function options(request: Request) {
  if (request.method === "OPTIONS") {
    return corsPreflight();
  }

  return null;
}

export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
