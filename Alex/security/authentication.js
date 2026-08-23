import { safeErrorResponse } from "./errors.js";

export async function authenticateRequest(request, apiKeys) {
  const authorization = request.headers.get("authorization");
  const apiKey = request.headers.get("x-api-key")
    ?? (authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined);
  const identity = apiKey ? await apiKeys.validate(apiKey) : undefined;

  return identity ? { identity } : safeErrorResponse(401, "Authentication required.");
}