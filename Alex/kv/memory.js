import { KVService } from "./service.js";

export class InMemoryKVService extends KVService {
  #values = new Map();

  async get(key) {
    return this.#values.get(key);
  }

  async put(key, value) {
    this.#values.set(key, value);
  }

  async delete(key) {
    this.#values.delete(key);
  }

  async list(options = {}) {
    const prefix = options.prefix ?? "";
    const keys = [...this.#values.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((name) => ({ name }));

    return { keys };
  }
}