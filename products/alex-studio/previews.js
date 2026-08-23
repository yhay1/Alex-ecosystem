import { DataStore } from "../../Alex/database/store.js";

const collection = "alex_studio_previews";

export class PreviewService {
  constructor(database) {
    this.previews = new DataStore(database, collection);
  }

  async create(userId, runtimeId, providerPreviewId, port, address, commandId, ttlSeconds = 1800) {
    const now = new Date();
    const preview = {
      id: crypto.randomUUID(), userId, runtimeId, providerPreviewId, port, address, commandId,
      status: "running", createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + Math.min(ttlSeconds, 3600) * 1000).toISOString(),
    };
    await this.previews.save(preview.id, preview);
    return preview;
  }

  async getForUser(userId, id) {
    const preview = await this.previews.get(id);
    if (preview?.userId !== userId) return undefined;
    if (preview.status === "running" && new Date(preview.expiresAt) <= new Date()) {
      return this.update(preview, { status: "expired" });
    }
    return preview;
  }

  async update(preview, changes) {
    const updated = { ...preview, ...changes, updatedAt: new Date().toISOString() };
    await this.previews.save(updated.id, updated);
    return updated;
  }
}