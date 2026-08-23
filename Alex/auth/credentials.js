import { DataStore } from "../database/store.js";
import { hashPassword, verifyPassword } from "./crypto.js";

export class CredentialService {
  constructor(database) {
    this.credentials = new DataStore(database, "auth_credentials");
  }

  async setPassword(userId, password) {
    if (typeof password !== "string" || password.length < 8) {
      throw new Error("Password must contain at least 8 characters.");
    }

    const credential = { userId, password: await hashPassword(password) };
    await this.credentials.save(userId, credential);
    return { userId };
  }

  async verifyPassword(userId, password) {
    const credential = await this.credentials.get(userId);
    return credential ? verifyPassword(password, credential.password) : false;
  }
}