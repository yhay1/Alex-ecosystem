import { DataStore } from "../../Alex/database/store.js";

const collection = "alex_studio_files";

export function validateFilePath(path) {
  if (
    typeof path !== "string"
    || path.length === 0
    || path.length > 500
    || path.startsWith("/")
    || path.includes("\\")
    || path.includes("//")
    || path.split("/").some((part) => part === ".." || part === "." || part.length === 0)
    || /[\u0000-\u001f\u007f]/.test(path)
  ) {
    throw new Error("File path must be a safe relative path.");
  }
  return path;
}

function key(projectId, path) {
  return `${projectId}:${path}`;
}

export class FileService {
  constructor(database) {
    this.files = new DataStore(database, collection);
  }

  async list(projectId, directory = "") {
    if (directory) validateFilePath(directory);
    const prefix = directory ? `${directory}/` : "";
    const records = await this.files.list();
    return records
      .filter((file) => file.projectId === projectId && file.path.startsWith(prefix))
      .filter((file) => !directory || !file.path.slice(prefix.length).includes("/"))
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  get(projectId, path) {
    validateFilePath(path);
    return this.files.get(key(projectId, path));
  }

  async create(projectId, path, type = "file", content = "") {
    validateFilePath(path);
    if (type !== "file" && type !== "folder") throw new Error("File type must be file or folder.");
    const id = key(projectId, path);
    if (await this.files.get(id)) return undefined;
    const file = { id, projectId, path, type, content: type === "file" ? content : "" };
    await this.files.save(id, file);
    return file;
  }

  async update(projectId, path, content) {
    const file = await this.get(projectId, path);
    if (!file || file.type !== "file") return undefined;
    const updated = { ...file, content };
    await this.files.save(file.id, updated);
    return updated;
  }

  async rename(projectId, path, newPath) {
    validateFilePath(path);
    validateFilePath(newPath);
    const file = await this.get(projectId, path);
    if (!file || await this.files.get(key(projectId, newPath))) return undefined;
    const records = await this.files.list();
    const moving = records.filter((item) => (
      item.projectId === projectId && (item.path === path || item.path.startsWith(`${path}/`))
    ));
    const destinations = moving.map((item) => key(projectId, item.path === path
      ? newPath
      : `${newPath}${item.path.slice(path.length)}`));
    if (destinations.some((destination) => records.some((item) => item.id === destination))) return undefined;
    for (const item of moving) {
      const movedPath = item.path === path ? newPath : `${newPath}${item.path.slice(path.length)}`;
      await this.files.save(key(projectId, movedPath), { ...item, id: key(projectId, movedPath), path: movedPath });
    }
    for (const item of moving) await this.files.delete(item.id);
    return this.get(projectId, newPath);
  }

  async delete(projectId, path) {
    validateFilePath(path);
    const file = await this.get(projectId, path);
    if (!file) return false;
    if (file.type === "folder") {
      const descendants = await this.files.list();
      for (const child of descendants.filter((item) => item.projectId === projectId && item.path.startsWith(`${path}/`))) {
        await this.files.delete(child.id);
      }
    }
    return this.files.delete(file.id);
  }

  async search(projectId, query) {
    const normalized = query.toLowerCase();
    const records = await this.files.list();
    return records.filter((file) => (
      file.projectId === projectId
      && (file.path.toLowerCase().includes(normalized)
        || (file.type === "file" && file.content.toLowerCase().includes(normalized)))
    ));
  }
}