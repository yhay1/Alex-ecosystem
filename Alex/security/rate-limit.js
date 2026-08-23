import { safeErrorResponse } from "./errors.js";

export function rateLimitKey(request, fallback = "anonymous") {
  return request.headers.get("CF-Connecting-IP")
    ?? request.headers.get("X-Forwarded-For")?.split(",")[0].trim()
    ?? fallback;
}

export function protectEndpoint(request, limiter, key = rateLimitKey(request)) {
  return limiter.allow(key) ? true : safeErrorResponse(429, "Too many requests.");
}