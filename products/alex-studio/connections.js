import { DataStore } from "../../Alex/database/store.js";

const collection = "alex_studio_connections";

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function decode(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function key(secret) {
  if (typeof secret !== "string" || secret.length === 0) throw new Error("Provider connection encryption is unavailable.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encrypt(credentials, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, await key(secret), new TextEncoder().encode(JSON.stringify(credentials)),
  );
  return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}

async function decrypt(ciphertext, secret) {
  const [encodedIv, encodedValue] = ciphertext.split(".");
  const value = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(encodedIv) }, await key(secret), decode(encodedValue),
  );
  return JSON.parse(new TextDecoder().decode(value));
}

function publicConnection(connection) {
  const { ciphertext, ...metadata } = connection;
  return metadata;
}

export class ConnectionService {
  constructor(database, encryptionSecret) {
    this.connections = new DataStore(database, collection);
    this.encryptionSecret = encryptionSecret;
  }

  async list(userId) {
    const records = await this.connections.list();
    return records.filter((connection) => connection.userId === userId).map(publicConnection);
  }

  async get(userId, id) {
    const connection = await this.connections.get(id);
    return connection?.userId === userId ? connection : undefined;
  }

  async create(userId, kind, providerId, credentials) {
    const id = `${userId}:${kind}:${providerId}`;
    if (await this.connections.get(id)) return undefined;
    const now = new Date().toISOString();
    const connection = { id, userId, kind, providerId, selected: false, ciphertext: await encrypt(credentials, this.encryptionSecret), createdAt: now, updatedAt: now };
    await this.connections.save(id, connection);
    return publicConnection(connection);
  }

  async update(userId, id, credentials) {
    const connection = await this.get(userId, id);
    if (!connection) return undefined;
    const updated = { ...connection, ciphertext: await encrypt(credentials, this.encryptionSecret), updatedAt: new Date().toISOString() };
    await this.connections.save(id, updated);
    return publicConnection(updated);
  }

  async select(userId, id) {
    const connection = await this.get(userId, id);
    if (!connection) return undefined;
    const records = await this.connections.list();
    for (const item of records.filter((candidate) => candidate.userId === userId && candidate.kind === connection.kind)) {
      await this.connections.save(item.id, { ...item, selected: item.id === id });
    }
    return publicConnection({ ...connection, selected: true });
  }

  async credentials(userId, id) {
    const connection = await this.get(userId, id);
    return connection && decrypt(connection.ciphertext, this.encryptionSecret);
  }

  async delete(userId, id) {
    const connection = await this.get(userId, id);
    return connection ? this.connections.delete(id) : false;
  }
}