export function validateRequest(request, { methods = [], maxBodyBytes = 1024 * 1024 } = {}) {
  const errors = [];
  const method = request?.method;

  if (!(request instanceof Request)) errors.push("Request is required.");
  if (methods.length > 0 && !methods.includes(method)) errors.push("Method is not allowed.");

  const contentLength = request?.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBodyBytes)) {
    errors.push("Request body is too large.");
  }

  return { valid: errors.length === 0, errors };
}