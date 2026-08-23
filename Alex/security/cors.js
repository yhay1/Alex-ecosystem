export function corsHeaders(origin, allowedOrigins = []) {
  const allowed = allowedOrigins.includes("*") || allowedOrigins.includes(origin);
  return allowed ? {
    "Access-Control-Allow-Origin": allowedOrigins.includes("*") ? "*" : origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,X-API-Key",
    "Vary": "Origin",
  } : {};
}

export function withCors(response, request, allowedOrigins = []) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders(request.headers.get("origin"), allowedOrigins))) {
    headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
}