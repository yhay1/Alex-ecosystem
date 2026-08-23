import { DataStore } from "../../Alex/database/store.js";

const collection = "alex_studio_secrets";

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function decode(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export function validateSecretName(name) {
  if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_.-]{0,99}$/.test(name)) {
    throw new Error("Secret name must contain only letters, numbers, _, ., or -.");
  }
  return name;
}

async function encryptionKey(secret) {
  if (typeof secret !== "string" || secret.length === 0) throw new Error("Project secret encryption is unavailable.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encrypt(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    new TextEncoder().encode(value),
  );
  return `${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;
}

export class SecretService {
  constructor(database, encryptionSecret) {
    this.secrets = new DataStore(database, collection);
    this.encryptionSecret = encryptionSecret;
  }

  async list(projectId) {
    const records = await this.secrets.list();
    return records
      .filter((secret) => secret.projectId === projectId)
      .map(({ name, createdAt, updatedAt }) => ({ name, createdAt, updatedAt }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async create(projectId, name, value) {
    validateSecretName(name);
    const id = `${projectId}:${name}`;
    if (await this.secrets.get(id)) return undefined;
    const now = new Date().toISOString();
    const secret = { id, projectId, name, ciphertext: await encrypt(value, this.encryptionSecret), createdAt: now, updatedAt: now };
    await this.secrets.save(id, secret);
    return { name, createdAt: now, updatedAt: now };
  }

  async update(projectId, name, value) {
    validateSecretName(name);
    const id = `${projectId}:${name}`;
    const existing = await this.secrets.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ciphertext: await encrypt(value, this.encryptionSecret), updatedAt: new Date().toISOString() };
    await this.secrets.save(id, updated);
    return { name, createdAt: updated.createdAt, updatedAt: updated.updatedAt };
  }

  async delete(projectId, name) {
    validateSecretName(name);
    return this.secrets.delete(`${projectId}:${name}`);
  }

  async decrypt(projectId, name) {
    validateSecretName(name);
    const secret = await this.secrets.get(`${projectId}:${name}`);
    if (!secret) return undefined;
    const [encodedIv, encodedCiphertext] = secret.ciphertext.split(".");
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(encodedIv) },
      await encryptionKey(this.encryptionSecret),
      decode(encodedCiphertext),
    );
    return new TextDecoder().decode(plaintext);
  }
}