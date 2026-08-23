export class InMemoryAbuseProtection {
  #requests = new Map();

  constructor({ limit = 60, windowMs = 60_000 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  allow(key, now = Date.now()) {
    const current = this.#requests.get(key);
    if (!current || now - current.startedAt >= this.windowMs) {
      this.#requests.set(key, { startedAt: now, count: 1 });
      return true;
    }

    current.count += 1;
    return current.count <= this.limit;
  }
}