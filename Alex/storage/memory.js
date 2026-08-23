import { StorageService } from "./service.js";
import { validateObjectKey } from "./keys.js";

export class InMemoryStorageService extends StorageService {
  #objects = new Map();

  async upload(key, value, options = {}) {
    const safeKey = validateObjectKey(key);
    const object = {
      key: safeKey,
      size: typeof value === "string" ? value.length : value.byteLength,
      uploaded: new Date().toISOString(),
      httpMetadata: options.httpMetadata,
      customMetadata: options.customMetadata,
      body: value,
    };
    this.#objects.set(safeKey, object);
    return this.#publicMetadata(object);
  }

  async download(key) {
    const object = this.#objects.get(validateObjectKey(key));
    return object && { ...this.#publicMetadata(object), body: object.body };
  }

  async delete(key) {
    this.#objects.delete(validateObjectKey(key));
  }

  async exists(key) {
    return this.#objects.has(validateObjectKey(key));
  }

  async metadata(key) {
    const object = this.#objects.get(validateObjectKey(key));
    return object ? this.#publicMetadata(object) : null;
  }

  #publicMetadata(object) {
    const { body, ...metadata } = object;
    return metadata;
  }
}