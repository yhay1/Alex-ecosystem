const maxFiles = 8;
const maxFileCharacters = 12_000;
const maxErrors = 5;

export async function buildProjectContext({ projectId, files, relevantPaths = [], query, recentErrors = [] }) {
  const structure = (await files.list(projectId)).map(({ path, type }) => ({ path, type }));
  const paths = new Set(relevantPaths.slice(0, maxFiles));
  if (typeof query === "string" && query.length > 0) {
    for (const file of (await files.search(projectId, query)).slice(0, maxFiles)) paths.add(file.path);
  }
  const relevantFiles = [];
  for (const path of [...paths].slice(0, maxFiles)) {
    const file = await files.get(projectId, path);
    if (file?.type === "file") relevantFiles.push({ path, content: file.content.slice(0, maxFileCharacters) });
  }
  return {
    structure,
    relevantFiles,
    recentErrors: recentErrors.filter((error) => typeof error === "string").slice(-maxErrors),
  };
}