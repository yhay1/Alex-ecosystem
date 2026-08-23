export class DatabaseService {
  async health() {
    throw new Error("DatabaseService.health must be implemented.");
  }

  async get() {
    throw new Error("DatabaseService.get must be implemented.");
  }

  async put() {
    throw new Error("DatabaseService.put must be implemented.");
  }

  async delete() {
    throw new Error("DatabaseService.delete must be implemented.");
  }

  async list() {
    throw new Error("DatabaseService.list must be implemented.");
  }
}