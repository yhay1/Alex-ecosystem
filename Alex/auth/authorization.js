export class AuthorizationService {
  hasScope(apiKey, scope) {
    return Boolean(apiKey?.scopes?.includes(scope));
  }

  canAccessProduct(apiKey, productId) {
    return Boolean(apiKey?.productIds?.includes(productId));
  }

  isAllowed(apiKey, { scope, productId }) {
    return this.hasScope(apiKey, scope) && this.canAccessProduct(apiKey, productId);
  }
}