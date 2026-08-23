import { DataStore } from "../database/store.js";
import { hashToken, randomToken } from "./crypto.js";

function validateOptions({ name, scopes, productIds, expiresAt }) {
  if (typeof name !== "string" || name.length === 0) throw new Error("API key name is required.");
  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.some((scope) => typeof scope !== "string" || scope.length === 0)) {
    throw new Error("API key scopes must be non-empty strings.");
  }
  if (!Array.isArray(productIds) || productIds.length === 0 || productIds.some((id) => typeof id !== "string" || id.length === 0)) {
    throw new Error("API key product IDs must be non-empty strings.");
  }
  if (expiresAt !== undefined && (typeof expiresAt !== "string" || Number.isNaN(Date.parse(expiresAt)))) {
    throw new Error("API key expiration must be a valid timestamp.");
  }
}

export class ApiKeyService {
  constructor(database) {
    this.keys = new DataStore(database, "auth_api_keys");
  }

  async create(options) {
    validateOptions(options);
    const id = crypto.randomUUID();
    const secret = `ak_${id}.${randomToken()}`;
    const record = {
      id,
      name: options.name,
      scopes: [...new Set(options.scopes)],
      productIds: [...new Set(options.productIds)],
      secretHash: await hashToken(secret),
      createdAt: new Date().toISOString(),
      expiresAt: options.expiresAt ?? null,
      revokedAt: null,
    };

    await this.keys.save(id, record);
    return {
      id,
      secret,
      name: record.name,
      scopes: record.scopes,
      productIds: record.productIds,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    };
  }

  async validate(secret) {
    const id = typeof secret === "string" && secret.startsWith("ak_") ? secret.slice(3).split(".")[0] : undefined;
    if (!id) return undefined;
    const record = await this.keys.get(id);
    if (!record || record.revokedAt || (record.expiresAt && new Date(record.expiresAt) <= new Date())) return undefined;
    if (record.secretHash !== await hashToken(secret)) return undefined;
    return this.#publicRecord(record);
  }

  async revoke(id) {
    const record = await this.keys.get(id);
    if (!record) return false;
    record.revokedAt = new Date().toISOString();
    await this.keys.save(id, record);
    return true;
  }

  #publicRecord(record) {
    const { secretHash, ...publicRecord } = record;
    return publicRecord;
  }
}