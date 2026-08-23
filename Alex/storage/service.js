export class StorageService {
  async upload() {
    throw new Error("StorageService.upload must be implemented.");
  }

  async download() {
    throw new Error("StorageService.download must be implemented.");
  }

  async delete() {
    throw new Error("StorageService.delete must be implemented.");
  }

  async exists() {
    throw new Error("StorageService.exists must be implemented.");
  }

  async metadata() {
    throw new Error("StorageService.metadata must be implemented.");
  }
}