export class UsageMetrics {
  #counts = new Map();

  increment(name, value = 1) {
    this.#counts.set(name, (this.#counts.get(name) ?? 0) + value);
  }

  get(name) {
    return this.#counts.get(name) ?? 0;
  }

  snapshot() {
    return Object.fromEntries(this.#counts);
  }
}