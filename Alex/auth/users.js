import { DataStore } from "../database/store.js";

export class UserService {
  constructor(database) {
    this.users = new DataStore(database, "auth_users");
  }

  async create({ id = crypto.randomUUID(), accountId = id, metadata = {} } = {}) {
    const now = new Date().toISOString();
    const user = { id, accountId, metadata, createdAt: now, updatedAt: now };
    await this.users.save(id, user);
    return user;
  }

  getById(id) {
    return this.users.get(id);
  }
}