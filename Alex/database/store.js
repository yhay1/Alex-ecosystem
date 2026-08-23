export class DataStore {
  constructor(database, collection) {
    this.database = database;
    this.collection = collection;
  }

  get(id) {
    return this.database.get(this.collection, id);
  }

  save(id, value) {
    return this.database.put(this.collection, id, value);
  }

  delete(id) {
    return this.database.delete(this.collection, id);
  }

  list() {
    return this.database.list(this.collection);
  }
}