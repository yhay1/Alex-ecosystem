import { DataStore } from "../database/store.js";
import { hashToken } from "./crypto.js";

export class SessionService {
  constructor(database) {
    this.sessions = new DataStore(database, "auth_sessions");
  }

  async create(userId, { expiresAt } = {}) {
    const token = crypto.randomUUID();
    const session = {
      id: crypto.randomUUID(),
      userId,
      tokenHash: await hashToken(token),
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt ?? null,
    };
    await this.sessions.save(session.id, session);
    return { token, expiresAt: session.expiresAt };
  }

  async findByToken(token) {
    const tokenHash = await hashToken(token);
    const sessions = await this.sessions.list();
    return sessions.find((session) => {
      if (session.tokenHash !== tokenHash) return false;
      return !session.expiresAt || new Date(session.expiresAt) > new Date();
    });
  }

  revoke(id) {
    return this.sessions.delete(id);
  }
}