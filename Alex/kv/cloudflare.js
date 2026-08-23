import { KVService } from "./service.js";

export class CloudflareKVService extends KVService {
  constructor(namespace) {
    super();
    this.namespace = namespace;
  }

  get(key) {
    return this.namespace.get(key, "json");
  }

  put(key, value, options) {
    return this.namespace.put(key, JSON.stringify(value), options);
  }

  delete(key) {
    return this.namespace.delete(key);
  }

  list(options) {
    return this.namespace.list(options);
  }
}