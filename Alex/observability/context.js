import { handleError } from "../security/errors.js";
import { StructuredLogger } from "./logger.js";
import { UsageMetrics } from "./metrics.js";

const requestIdPattern = /^[A-Za-z0-9._-]{1,128}$/;

export const metrics = new UsageMetrics();
export const logger = new StructuredLogger();

export function requestId(request) {
  const supplied = request.headers.get("x-request-id");
  return supplied && requestIdPattern.test(supplied) ? supplied : crypto.randomUUID();
}

export async function observeRequest(request, handler, { log = logger, usage = metrics } = {}) {
  const id = requestId(request);
  const startedAt = performance.now();
  let response;

  try {
    response = await handler({ request, requestId: id });
  } catch (error) {
    log.error("request.error", { requestId: id, errorType: error?.name ?? "Error" });
    response = handleError(error);
  }

  const durationMs = Math.round(performance.now() - startedAt);
  usage.increment("requests.total");
  usage.increment(`responses.${response.status}`);
  log.info("request.complete", {
    requestId: id,
    method: request.method,
    path: new URL(request.url).pathname,
    status: response.status,
    durationMs,
  });

  const headers = new Headers(response.headers);
  headers.set("X-Request-ID", id);
  return new Response(response.body, { status: response.status, headers });
}