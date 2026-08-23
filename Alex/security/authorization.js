import { safeErrorResponse } from "./errors.js";

export function authorizeRequest(identity, authorization, requirements) {
  if (!authorization.isAllowed(identity, requirements)) {
    return safeErrorResponse(403, "Permission denied.");
  }

  return true;
}