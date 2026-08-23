export function createRouter(registry: unknown, context?: unknown): {
  fetch(request: Request): Promise<Response>;
};