import { StorageService } from "./service.js";
import { validateObjectKey } from "./keys.js";

export class R2StorageService extends StorageService {
  constructor(bucket) {
    super();
    this.bucket = bucket;
  }

  upload(key, value, options) {
    return this.bucket.put(validateObjectKey(key), value, options);
  }

  download(key, options) {
    return this.bucket.get(validateObjectKey(key), options);
  }

  delete(key) {
    return this.bucket.delete(validateObjectKey(key));
  }

  async exists(key) {
    return (await this.metadata(key)) !== null;
  }

  metadata(key) {
    return this.bucket.head(validateObjectKey(key));
  }
}