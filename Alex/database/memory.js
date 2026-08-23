import { DatabaseService } from "./service.js";

export class InMemoryDatabaseService extends DatabaseService {
  #collections = new Map();

  async health() {
    return true;
  }

  async get(collection, id) {
    return this.#collections.get(collection)?.get(id);
  }

  async put(collection, id, value) {
    if (!this.#collections.has(collection)) {
      this.#collections.set(collection, new Map());
    }

    this.#collections.get(collection).set(id, value);
    return value;
  }

  async delete(collection, id) {
    return this.#collections.get(collection)?.delete(id) ?? false;
  }

  async list(collection) {
    return [...(this.#collections.get(collection)?.values() ?? [])];
  }
}