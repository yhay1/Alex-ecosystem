import { DataStore } from "../../Alex/database/store.js";

const collection = "alex_studio_changes";

function diff(before = "", after = "") {
  return [`--- before`, ...before.split("\n").map((line) => `- ${line}`), `+++ after`, ...after.split("\n").map((line) => `+ ${line}`)].join("\n");
}

export class ChangeService {
  constructor(database, files) {
    this.changes = new DataStore(database, collection);
    this.files = files;
  }

  async stage(userId, projectId, action, path, content = "") {
    const existing = await this.files.get(projectId, path);
    const before = existing?.content ?? "";
    const change = {
      id: crypto.randomUUID(), userId, projectId, action, path, before, after: content,
      summary: `${action} ${path}`, status: "pending", diff: diff(before, content), createdAt: new Date().toISOString(),
    };
    await this.changes.save(change.id, change);
    return this.public(change);
  }

  async getForUser(userId, projectId, id) {
    const change = await this.changes.get(id);
    return change?.userId === userId && change.projectId === projectId ? change : undefined;
  }

  async list(userId, projectId) {
    const changes = await this.changes.list();
    return changes.filter((change) => change.userId === userId && change.projectId === projectId).map((change) => this.public(change));
  }

  async approve(userId, projectId, id) {
    const change = await this.getForUser(userId, projectId, id);
    if (!change || change.status !== "pending") return undefined;
    if (change.action === "create") await this.files.create(projectId, change.path, "file", change.after);
    if (change.action === "edit") await this.files.update(projectId, change.path, change.after);
    if (change.action === "delete") await this.files.delete(projectId, change.path);
    const approved = { ...change, status: "approved", reviewedAt: new Date().toISOString() };
    await this.changes.save(id, approved);
    return this.public(approved);
  }

  async reject(userId, projectId, id) {
    const change = await this.getForUser(userId, projectId, id);
    if (!change || change.status !== "pending") return undefined;
    const rejected = { ...change, status: "rejected", reviewedAt: new Date().toISOString() };
    await this.changes.save(id, rejected);
    return this.public(rejected);
  }

  public(change) {
    const { before, after, ...metadata } = change;
    return { ...metadata, diff: change.diff, before, after };
  }
}