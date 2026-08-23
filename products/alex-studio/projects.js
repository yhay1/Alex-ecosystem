import { DataStore } from "../../Alex/database/store.js";

const collection = "alex_studio_projects";

export class ProjectService {
  constructor(database) {
    this.projects = new DataStore(database, collection);
  }

  async listForUser(ownerId) {
    const projects = await this.projects.list();
    return projects.filter((project) => project.ownerId === ownerId);
  }

  getForUser(id, ownerId) {
    return this.projects.get(id).then((project) => (
      project?.ownerId === ownerId ? project : undefined
    ));
  }

  async create(ownerId, name) {
    const now = new Date().toISOString();
    const project = {
      id: crypto.randomUUID(),
      ownerId,
      name,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.projects.save(project.id, project);
    return project;
  }

  async rename(id, ownerId, name) {
    const project = await this.getForUser(id, ownerId);
    if (!project) return undefined;

    const updated = { ...project, name, updatedAt: new Date().toISOString() };
    await this.projects.save(id, updated);
    return updated;
  }

  async archive(id, ownerId) {
    const project = await this.getForUser(id, ownerId);
    if (!project) return undefined;

    const updated = { ...project, archived: true, updatedAt: new Date().toISOString() };
    await this.projects.save(id, updated);
    return updated;
  }

  async delete(id, ownerId) {
    const project = await this.getForUser(id, ownerId);
    if (!project) return false;
    return this.projects.delete(id);
  }
}