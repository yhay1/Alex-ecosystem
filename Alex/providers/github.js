import { SourceControlProvider } from "./interfaces.js";

const apiBase = "https://api.github.com";
const apiHeaders = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

function path(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function encodeContent(value) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(value)));
}

export class GitHubProvider extends SourceControlProvider {
  constructor() {
    super({
      id: "github",
      name: "GitHub",
      capabilities: ["repositories", "branches", "import", "status", "diff", "commit", "pull", "push"],
    });
  }

  async request(accessToken, endpoint, options = {}, fetcher = fetch) {
    const response = await fetcher(`${apiBase}${endpoint}`, {
      ...options,
      headers: { ...apiHeaders, Authorization: `Bearer ${accessToken}`, ...options.headers },
    });
    if (!response.ok) throw new Error("GitHub request failed.");
    return response.status === 204 ? undefined : response.json();
  }

  validate(credentials, fetcher = fetch) {
    return this.request(credentials?.accessToken, "/user", {}, fetcher).then(() => true).catch(() => false);
  }

  listRepositories(accessToken, fetcher = fetch) {
    return this.request(accessToken, "/user/repos?per_page=100&sort=updated", {}, fetcher);
  }

  listBranches(accessToken, owner, repository, fetcher = fetch) {
    return this.request(accessToken, `/repos/${path(owner)}/${path(repository)}/branches?per_page=100`, {}, fetcher);
  }

  listFiles(accessToken, owner, repository, branch, fetcher = fetch) {
    return this.request(accessToken, `/repos/${path(owner)}/${path(repository)}/git/trees/${path(branch)}?recursive=1`, {}, fetcher);
  }

  readFile(accessToken, owner, repository, filePath, branch, fetcher = fetch) {
    return this.request(accessToken, `/repos/${path(owner)}/${path(repository)}/contents/${path(filePath)}?ref=${encodeURIComponent(branch)}`, {}, fetcher);
  }

  writeFile(accessToken, owner, repository, filePath, branch, content, message, sha, fetcher = fetch) {
    return this.request(accessToken, `/repos/${path(owner)}/${path(repository)}/contents/${path(filePath)}`, {
      method: "PUT",
      body: JSON.stringify({ message, content: encodeContent(content), branch, ...(sha ? { sha } : {}) }),
      headers: { "Content-Type": "application/json" },
    }, fetcher);
  }

  deleteFile(accessToken, owner, repository, filePath, branch, message, sha, fetcher = fetch) {
    return this.request(accessToken, `/repos/${path(owner)}/${path(repository)}/contents/${path(filePath)}`, {
      method: "DELETE",
      body: JSON.stringify({ message, branch, sha }),
      headers: { "Content-Type": "application/json" },
    }, fetcher);
  }
}