import { validateManifest } from "../manifest/validate.js";

export class ProductRegistry {
  #products = new Map();
  #routes = new Map();
  #handlers = new Map();
  #validationErrors = [];

  static fromManifests(products) {
    const registry = new ProductRegistry();
    for (const { manifest, handler } of products) {
      const result = validateManifest(manifest);

      if (!result.valid) {
        registry.#validationErrors.push({ manifest, errors: result.errors });
        continue;
      }

      registry.register(manifest, handler);
    }

    return registry;
  }

  register(manifest, handler) {
    const result = validateManifest(manifest);

    if (!result.valid) {
      throw new Error(`Invalid product manifest: ${result.errors.join(" ")}`);
    }

    if (!manifest.enabled) {
      return false;
    }

    if (this.#products.has(manifest.id)) {
      throw new Error(`Duplicate product ID: ${manifest.id}`);
    }

    if (this.#routes.has(manifest.route)) {
      throw new Error(`Duplicate product route: ${manifest.route}`);
    }

    this.#products.set(manifest.id, manifest);
    this.#routes.set(manifest.route, manifest);
    if (handler) {
      this.#handlers.set(manifest.id, handler);
    }
    return true;
  }

  getById(id) {
    return this.#products.get(id);
  }

  getByRoute(route) {
    return this.#routes.get(route);
  }

  getHandlerById(id) {
    return this.#handlers.get(id);
  }

  list() {
    return [...this.#products.values()];
  }

  validationErrors() {
    return [...this.#validationErrors];
  }
}