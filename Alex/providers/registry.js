import { ProviderKinds } from "./interfaces.js";

export class ProviderRegistry {
  #providers = new Map();

  register(provider) {
    if (!provider || typeof provider !== "object") throw new Error("Provider must be an object.");
    if (!Object.values(ProviderKinds).includes(provider.kind)) throw new Error("Provider kind is not supported.");
    if (typeof provider.id !== "string" || provider.id.length === 0) throw new Error("Provider id must be a non-empty string.");
    if (this.#providers.get(provider.kind)?.has(provider.id)) {
      throw new Error(`Duplicate provider: ${provider.kind}/${provider.id}`);
    }

    if (!this.#providers.has(provider.kind)) this.#providers.set(provider.kind, new Map());
    this.#providers.get(provider.kind).set(provider.id, provider);
    return provider;
  }

  unregister(kind, id) {
    const providers = this.#providers.get(kind);
    if (!providers) return false;
    const removed = providers.delete(id);
    if (providers.size === 0) this.#providers.delete(kind);
    return removed;
  }

  get(kind, id) {
    return this.#providers.get(kind)?.get(id);
  }

  resolve(kind, id) {
    if (id) return this.get(kind, id);
    const providers = [...(this.#providers.get(kind)?.values() ?? [])];
    if (providers.length !== 1) return undefined;
    return providers[0];
  }

  has(kind, id) {
    return Boolean(this.get(kind, id));
  }

  list(kind) {
    if (kind) return [...(this.#providers.get(kind)?.values() ?? [])];
    return [...this.#providers.values()].flatMap((providers) => [...providers.values()]);
  }
}