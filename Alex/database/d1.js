import { DatabaseService } from "./service.js";

function decode(row) {
  return row ? JSON.parse(row.value) : undefined;
}

export class D1DatabaseService extends DatabaseService {
  constructor(database) {
    super();
    this.database = database;
  }

  async health() {
    const row = await this.database.prepare("SELECT 1 AS ok").first();
    return row?.ok === 1;
  }

  async get(collection, id) {
    const row = await this.database
      .prepare("SELECT value FROM ecosystem_records WHERE collection = ?1 AND id = ?2")
      .bind(collection, id)
      .first();
    return decode(row);
  }

  async put(collection, id, value) {
    const row = await this.database
      .prepare(
        "INSERT INTO ecosystem_records (collection, id, value) VALUES (?1, ?2, ?3) "
        + "ON CONFLICT(collection, id) DO UPDATE SET value = excluded.value, "
        + "updated_at = CURRENT_TIMESTAMP RETURNING value",
      )
      .bind(collection, id, JSON.stringify(value))
      .first();
    return decode(row);
  }

  async delete(collection, id) {
    const result = await this.database
      .prepare("DELETE FROM ecosystem_records WHERE collection = ?1 AND id = ?2")
      .bind(collection, id)
      .run();
    return result.meta.changes > 0;
  }

  async list(collection) {
    const result = await this.database
      .prepare("SELECT value FROM ecosystem_records WHERE collection = ?1")
      .bind(collection)
      .all();
    return result.results.map(decode);
  }
}