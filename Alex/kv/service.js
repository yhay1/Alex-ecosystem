export class KVService {
  async get() {
    throw new Error("KVService.get must be implemented.");
  }

  async put() {
    throw new Error("KVService.put must be implemented.");
  }

  async delete() {
    throw new Error("KVService.delete must be implemented.");
  }

  async list() {
    throw new Error("KVService.list must be implemented.");
  }
}