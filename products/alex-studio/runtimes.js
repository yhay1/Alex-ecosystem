import { DataStore } from "../../Alex/database/store.js";

const collection = "alex_studio_runtimes";

export class RuntimeService {
  constructor(database) {
    this.runtimes = new DataStore(database, collection);
  }

  async create(userId, projectId, connectionId, providerId, providerRuntimeId, status = "running") {
    const now = new Date().toISOString();
    const runtime = { id: crypto.randomUUID(), userId, projectId, connectionId, providerId, providerRuntimeId, status, createdAt: now, updatedAt: now };
    await this.runtimes.save(runtime.id, runtime);
    return runtime;
  }

  async getForUser(userId, id) {
    const runtime = await this.runtimes.get(id);
    return runtime?.userId === userId ? runtime : undefined;
  }

  async update(runtime, changes) {
    const updated = { ...runtime, ...changes, updatedAt: new Date().toISOString() };
    await this.runtimes.save(updated.id, updated);
    return updated;
  }

  async delete(runtime) {
    return this.runtimes.delete(runtime.id);
  }
}