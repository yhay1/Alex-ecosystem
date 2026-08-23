import { safeErrorResponse } from "../../Alex/security/errors.js";
import { ProjectService } from "./projects.js";
import { FileService } from "./files.js";
import { SecretService } from "./secrets.js";
import { createConnectionProviderRegistry } from "../../Alex/providers/index.js";
import { ConnectionService } from "./connections.js";
import { GitHubOAuthService } from "./github.js";
import { GitHubProvider } from "../../Alex/providers/github.js";
import { RuntimeService } from "./runtimes.js";
import { PreviewService } from "./previews.js";
import { agentTools, StudioAgent } from "./agent.js";
import { buildProjectContext } from "./context.js";
import { ChangeService } from "./changes.js";
import { metrics } from "../../Alex/observability/index.js";

const connectionProviders = createConnectionProviderRegistry();
const githubProvider = new GitHubProvider();
connectionProviders.set("source-control:github", githubProvider);
const agentTasks = new Map();

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", ...headers },
});

function sessionToken(request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);

  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").map((part) => part.trim())
    .find((part) => part.startsWith("alex_session="))?.slice("alex_session=".length);
}

async function identifyUser(request, context) {
  const token = sessionToken(request);
  return token && context.accountIdentifier?.identify(token);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function profile(user) {
  return {
    id: user.id,
    accountId: user.accountId,
    metadata: user.metadata,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function projectInput(body) {
  if (typeof body?.name !== "string") return undefined;
  const name = body.name.trim();
  return name.length > 0 && name.length <= 100 ? name : undefined;
}

function githubConnectionId(request, body) {
  return body?.connectionId ?? new URL(request.url).searchParams.get("connectionId");
}

async function githubCredentials(request, body, connections, userId) {
  const id = githubConnectionId(request, body);
  if (!id) return undefined;
  const connection = await connections.get(userId, decodeURIComponent(id));
  if (!connection || connection.kind !== "source-control" || connection.providerId !== "github") return undefined;
  return { connection, credentials: await connections.credentials(userId, connection.id) };
}

function decodeGitHubContent(content) {
  const bytes = Uint8Array.from(atob(content.replaceAll("\n", "")), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function remoteFiles(provider, accessToken, owner, repository, branch) {
  const tree = await provider.listFiles(accessToken, owner, repository, branch);
  const files = [];
  for (const entry of tree.tree ?? []) {
    if (entry.type !== "blob") continue;
    const remote = await provider.readFile(accessToken, owner, repository, entry.path, branch);
    files.push({ path: entry.path, content: decodeGitHubContent(remote.content), sha: remote.sha });
  }
  return files;
}

async function redactRuntimeText(projectId, value, context) {
  if (typeof value !== "string" || !context.projectSecretsKey) return value;
  const secrets = new SecretService(context.database, context.projectSecretsKey);
  let redacted = value;
  for (const { name } of await secrets.list(projectId)) {
    try {
      const secret = await secrets.decrypt(projectId, name);
      if (secret.length > 0) redacted = redacted.replaceAll(secret, "[REDACTED]");
    } catch {
    }
  }
  return redacted;
}

function runtimeId(result) {
  return result?.id ?? result?.sandboxId ?? result?.workspaceId ?? result?.data?.id;
}

function commandResult(result) {
  return {
    commandId: result?.id ?? result?.commandId,
    status: result?.status ?? "completed",
    stdout: result?.stdout ?? result?.output ?? result?.data?.stdout ?? "",
    stderr: result?.stderr ?? result?.error ?? result?.data?.stderr ?? "",
    exitCode: result?.exitCode ?? result?.data?.exitCode ?? null,
  };
}

function previewResult(result) {
  return {
    providerPreviewId: result?.id ?? result?.previewId ?? result?.data?.id,
    address: result?.url ?? result?.address ?? result?.previewUrl,
    status: result?.status ?? "running",
  };
}

async function prepareAgent(user, project, body, context, connections, changes, runtimes, previews) {
  const connection = await connections.get(user.id, body.connectionId);
  const providers = context.aiProviders ?? connectionProviders;
  const provider = connection?.kind === "ai" && providers.get(`${connection.kind}:${connection.providerId}`);
  if (!connection || !provider || typeof provider.generate !== "function" && typeof provider.generateStream !== "function") throw new Error("An AI provider connection is required.");
  const credentials = await connections.credentials(user.id, connection.id);
  const tools = agentTools({
    userId: user.id,
    projectId: project.id,
    files: new FileService(context.database),
    changes,
    runtimes,
    previews,
    connections,
    providers: connectionProviders,
    redact: (projectId, value) => redactRuntimeText(projectId, value, context),
  });
  const agentProvider = provider.generateStream
    ? { generateStream: (input, agentContext) => provider.generateStream(input, { ...agentContext, credentials }) }
    : { generate: (input, agentContext) => provider.generate(input, { ...agentContext, credentials }) };
  const agent = new StudioAgent(agentProvider, tools, { userId: user.id, projectId: project.id });
  return { agent, project };
}

function workspacePage(product) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${product.name} workspace</title>
  <style>
    :root { color-scheme: dark; --ink: #e7edf5; --muted: #8d9aac; --line: #283442; --panel: #111a24; --accent: #7ee0c1; }
    * { box-sizing: border-box; } body { margin: 0; min-height: 100vh; background: #0a1017; color: var(--ink); font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
    header { display: flex; align-items: center; justify-content: space-between; padding: 16px 22px; border-bottom: 1px solid var(--line); } h1 { margin: 0; font: 600 18px/1.2 Georgia, serif; } button, input { border: 1px solid var(--line); background: #16222e; color: var(--ink); padding: 8px 10px; font: inherit; } button { cursor: pointer; } button:hover { border-color: var(--accent); } 
    main { display: grid; grid-template-columns: 230px minmax(300px, 1fr) minmax(230px, 28%); min-height: calc(100vh - 59px); } section, aside { border-right: 1px solid var(--line); padding: 18px; } aside { border-right: 0; border-left: 1px solid var(--line); } h2 { margin: 0 0 14px; font-size: 12px; color: var(--muted); letter-spacing: .08em; text-transform: uppercase; } 
    #projects { display: grid; gap: 6px; } #projects button { text-align: left; } .workspace { display: grid; grid-template-rows: auto 1fr 180px; padding: 0; } .bar { display: flex; justify-content: space-between; padding: 12px 18px; border-bottom: 1px solid var(--line); color: var(--muted); } textarea { width: 100%; height: 100%; resize: none; border: 0; outline: 0; padding: 20px; background: #0d151e; color: #d9e4ef; font: inherit; } .terminal { border-top: 1px solid var(--line); padding: 14px 18px; color: var(--muted); } .terminal strong { color: var(--accent); } .agent { min-height: 130px; padding: 14px; border: 1px dashed var(--line); color: var(--muted); display: grid; gap: 8px; } .agent textarea { min-height: 70px; padding: 8px; border: 1px solid var(--line); } .agent pre { white-space: pre-wrap; margin: 0; } .settings { margin-top: 24px; display: grid; gap: 8px; } .settings input { width: 100%; } .danger { color: #ff9f9f; } .empty { color: var(--muted); font-size: 12px; } @media (max-width: 850px) { main { grid-template-columns: 180px 1fr; } aside { grid-column: 1 / -1; border-left: 0; border-top: 1px solid var(--line); } }
  </style>
</head>
<body>
  <header><h1>Alex Studio</h1><button id="sign-out">Sign out</button></header>
  <main>
    <section><h2>Projects</h2><div id="projects"><span class="empty">Loading projects...</span></div><div class="settings"><input id="new-project" placeholder="Project name"><button id="create">New project</button></div><h2>Files</h2><div id="files"><span class="empty">Select a project</span></div><div class="settings"><input id="new-file" placeholder="src/index.js"><button id="create-file">New file</button><input id="search" placeholder="Search files"></div><div id="results"></div><h2>Pending changes</h2><div id="changes"><span class="empty">Select a project</span></div><h2>Secrets</h2><div id="secrets"><span class="empty">Select a project</span></div><div class="settings"><input id="secret-name" placeholder="Secret name"><input id="secret-value" type="password" placeholder="Secret value"><button id="create-secret">Save secret</button></div></section>
    <section class="workspace"><div class="bar"><span id="project-name">Select a project</span><button id="save-file">Save file</button></div><textarea aria-label="Code editor" spellcheck="false">// Select a project to begin</textarea><div class="terminal"><strong>Terminal</strong><p>Execution is not enabled in this foundation.</p></div></section>
    <aside><h2>AI agent</h2><div class="agent"><textarea id="agent-message" placeholder="Ask about this project"></textarea><button id="ask-agent">Ask agent</button><button id="stop-agent" disabled>Stop</button><pre id="agent-response">Select an AI connection to begin.</pre></div><div class="settings"><h2>Project settings</h2><input id="rename" placeholder="Select a project"><button id="save-name">Rename project</button><button class="danger" id="archive">Archive project</button><button class="danger" id="remove">Delete project</button><h2>File settings</h2><input id="rename-file" placeholder="Select a file"><button id="save-file-name">Rename file</button><button class="danger" id="remove-file">Delete file</button></div></aside>
  </main>
  <script>
    const api = (path, options) => fetch('/studio' + path, { headers: { 'content-type': 'application/json' }, ...options });
    let selected;
    const projects = document.querySelector('#projects');
    const render = (items) => { projects.replaceChildren(...items.map((project) => { const button = document.createElement('button'); button.textContent = (project.archived ? '[archived] ' : '') + project.name; button.onclick = () => select(project); return button; })); };
    let selectedFile;
    const select = async (project) => { selected = project; document.querySelector('#project-name').textContent = project.name; document.querySelector('#rename').value = project.name; await loadFiles(); await loadSecrets(); await loadChanges(); };
    const load = async () => { const response = await api('/projects'); const body = await response.json(); render(body.projects || []); };
    const loadFiles = async () => { if (!selected) return; const response = await api('/projects/' + selected.id + '/files'); const body = await response.json(); const files = document.querySelector('#files'); files.replaceChildren(...(body.files || []).map((file) => { const button = document.createElement('button'); button.textContent = file.type === 'folder' ? '[folder] ' + file.path : file.path; button.onclick = async () => { if (file.type === 'file') { selectedFile = file; document.querySelector('textarea').value = (await (await api('/projects/' + selected.id + '/files/read?path=' + encodeURIComponent(file.path))).json()).content; } }; return button; })); };
    const loadSecrets = async () => { if (!selected) return; const body = await (await api('/projects/' + selected.id + '/secrets')).json(); const secrets = document.querySelector('#secrets'); secrets.replaceChildren(...(body.secrets || []).map((secret) => { const row = document.createElement('div'); row.textContent = secret.name; const button = document.createElement('button'); button.textContent = 'Delete'; button.onclick = async () => { if ((await api('/projects/' + selected.id + '/secrets/' + encodeURIComponent(secret.name), { method: 'DELETE' })).ok) await loadSecrets(); }; row.append(button); return row; })); };
    const loadChanges = async () => { if (!selected) return; const body = await (await api('/projects/' + selected.id + '/changes')).json(); const changes = document.querySelector('#changes'); changes.replaceChildren(...(body.changes || []).filter((change) => change.status === 'pending').map((change) => { const row = document.createElement('div'); row.textContent = change.summary; const diff = document.createElement('pre'); diff.textContent = change.diff; const approve = document.createElement('button'); approve.textContent = 'Approve'; approve.onclick = async () => { await api('/projects/' + selected.id + '/changes/' + change.id + '/approve', { method: 'POST' }); await loadChanges(); }; const reject = document.createElement('button'); reject.textContent = 'Reject'; reject.onclick = async () => { await api('/projects/' + selected.id + '/changes/' + change.id + '/reject', { method: 'POST' }); await loadChanges(); }; row.append(diff, approve, reject); return row; })); };
    document.querySelector('#create').onclick = async () => { const input = document.querySelector('#new-project'); if (!input.value.trim()) return; const response = await api('/projects', { method: 'POST', body: JSON.stringify({ name: input.value }) }); if (response.ok) { input.value = ''; await load(); } };
    document.querySelector('#save-name').onclick = async () => { if (!selected) return; const response = await api('/projects/' + selected.id, { method: 'PATCH', body: JSON.stringify({ name: document.querySelector('#rename').value }) }); if (response.ok) { selected = (await response.json()).project; await load(); select(selected); } };
    document.querySelector('#archive').onclick = async () => { if (selected && (await api('/projects/' + selected.id + '/archive', { method: 'POST' })).ok) { selected = undefined; await load(); } };
    document.querySelector('#remove').onclick = async () => { if (selected && (await api('/projects/' + selected.id, { method: 'DELETE' })).ok) { selected = undefined; await load(); } };
    document.querySelector('#create-file').onclick = async () => { if (!selected) return; const input = document.querySelector('#new-file'); if ((await api('/projects/' + selected.id + '/files', { method: 'POST', body: JSON.stringify({ path: input.value, type: 'file', content: '' }) })).ok) { input.value = ''; await loadFiles(); } };
    document.querySelector('#save-file').onclick = async () => { if (selected && selectedFile) await api('/projects/' + selected.id + '/files', { method: 'PUT', body: JSON.stringify({ path: selectedFile.path, content: document.querySelector('textarea').value }) }); };
    document.querySelector('#save-file-name').onclick = async () => { if (!selected || !selectedFile) return; const response = await api('/projects/' + selected.id + '/files', { method: 'PATCH', body: JSON.stringify({ path: selectedFile.path, newPath: document.querySelector('#rename-file').value }) }); if (response.ok) { selectedFile = (await response.json()).file; await loadFiles(); } };
    document.querySelector('#remove-file').onclick = async () => { if (!selected || !selectedFile) return; const response = await api('/projects/' + selected.id + '/files?path=' + encodeURIComponent(selectedFile.path), { method: 'DELETE' }); if (response.ok) { selectedFile = undefined; document.querySelector('textarea').value = ''; await loadFiles(); } };
    document.querySelector('#create-secret').onclick = async () => { if (!selected) return; const name = document.querySelector('#secret-name'); const value = document.querySelector('#secret-value'); const response = await api('/projects/' + selected.id + '/secrets', { method: 'POST', body: JSON.stringify({ name: name.value, value: value.value }) }); if (response.ok) { name.value = ''; value.value = ''; await loadSecrets(); } };
    let agentTaskId;
    document.querySelector('#ask-agent').onclick = async () => { if (!selected) return; const connections = await (await api('/connections')).json(); const connection = (connections.connections || []).find((item) => item.kind === 'ai' && item.selected) || (connections.connections || []).find((item) => item.kind === 'ai'); if (!connection) { document.querySelector('#agent-response').textContent = 'Connect an AI provider first.'; return; } const output = document.querySelector('#agent-response'); output.textContent = ''; document.querySelector('#stop-agent').disabled = false; const response = await api('/projects/' + selected.id + '/agent/stream', { method: 'POST', body: JSON.stringify({ connectionId: connection.id, message: document.querySelector('#agent-message').value, context: { paths: selectedFile ? [selectedFile.path] : [] } }) }); const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; while (true) { const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true }); const events = buffer.split('\n\n'); buffer = events.pop(); for (const item of events) { if (!item.startsWith('data: ')) continue; const event = JSON.parse(item.slice(6)); if (event.type === 'run.started') agentTaskId = event.taskId; else if (event.type === 'assistant.delta') output.textContent += event.content; else if (event.type === 'tool.started') output.textContent += '\n[' + event.name + ']'; else if (event.type === 'tool.completed') { output.textContent += ' done'; await loadChanges(); } else if (event.type === 'tool.error' || event.type === 'run.error' || event.type === 'run.cancelled') output.textContent += '\n' + event.error; } } document.querySelector('#stop-agent').disabled = true; agentTaskId = undefined; };
    document.querySelector('#stop-agent').onclick = async () => { if (selected && agentTaskId) await api('/projects/' + selected.id + '/agent/cancel', { method: 'POST', body: JSON.stringify({ taskId: agentTaskId }) }); };
    document.querySelector('#search').oninput = async (event) => { if (!selected || !event.target.value) { document.querySelector('#results').replaceChildren(); return; } const body = await (await api('/projects/' + selected.id + '/files/search?q=' + encodeURIComponent(event.target.value))).json(); document.querySelector('#results').textContent = (body.results || []).map((file) => file.path).join('\n'); };
    document.querySelector('#sign-out').onclick = async () => { await api('/auth/sign-out', { method: 'POST' }); location.href = '/studio'; };
    load();
  </script>
</body>
</html>`;
}

export default async function handleAlexStudio(request, product, context) {
  const pathname = new URL(request.url).pathname;
  metrics.increment("studio.requests");

  if (pathname === `${product.route}/status`) {
    return json({ product: product.id, status: "ok", version: product.version });
  }

  if (pathname === `${product.route}/auth/sign-in` && request.method === "POST") {
    if (!context.passwordAuthentication) return safeErrorResponse(503, "Authentication is unavailable.");
    const body = await readJson(request);
    if (typeof body?.userId !== "string" || typeof body?.password !== "string") {
      return safeErrorResponse(400, "userId and password are required.");
    }

    const session = await context.passwordAuthentication.authenticate(body.userId, body.password);
    if (!session) return safeErrorResponse(401, "Invalid credentials.");

    return json({ authenticated: true, userId: body.userId }, 200, {
      "set-cookie": `alex_session=${session.token}; HttpOnly; Secure; SameSite=Lax; Path=${product.route}`,
    });
  }

  if (pathname === `${product.route}/auth/sign-out` && request.method === "POST") {
    const token = sessionToken(request);
    const session = token && await context.sessions?.findByToken(token);
    if (session) await context.sessions.revoke(session.id);

    return json({ authenticated: false }, 200, {
      "set-cookie": `alex_session=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=${product.route}`,
    });
  }

  const user = await identifyUser(request, context);
  if (!user) return safeErrorResponse(401, "Authentication required.");

  if (!context.database) return safeErrorResponse(503, "Studio storage is unavailable.");
  const projects = new ProjectService(context.database);
  const connections = new ConnectionService(context.database, context.providerConnectionsKey);
  const runtimes = new RuntimeService(context.database);
  const previews = new PreviewService(context.database);
  const changes = new ChangeService(context.database, new FileService(context.database));

  const changesMatch = pathname.match(new RegExp(`^${product.route}/projects/([^/]+)/changes(?:/([^/]+)(?:/(approve|reject))?)?$`));
  if (changesMatch) {
    const project = await projects.getForUser(decodeURIComponent(changesMatch[1]), user.id);
    if (!project) return safeErrorResponse(404, "Project not found.");
    const changeId = changesMatch[2];
    if (!changeId && request.method === "GET") return json({ changes: await changes.list(user.id, project.id) });
    if (changeId && !changesMatch[3] && request.method === "GET") {
      const change = await changes.getForUser(user.id, project.id, changeId);
      return change ? json({ change: changes.public(change) }) : safeErrorResponse(404, "Change not found.");
    }
    if (changeId && changesMatch[3] && request.method === "POST") {
      const change = changesMatch[3] === "approve"
        ? await changes.approve(user.id, project.id, changeId)
        : await changes.reject(user.id, project.id, changeId);
      return change ? json({ change }) : safeErrorResponse(404, "Pending change not found.");
    }
  }

  const agentStreamMatch = pathname.match(new RegExp(`^${product.route}/projects/([^/]+)/agent/stream$`));
  const agentCancelMatch = pathname.match(new RegExp(`^${product.route}/projects/([^/]+)/agent/cancel$`));
  const agentMatch = pathname.match(new RegExp(`^${product.route}/projects/([^/]+)/agent$`));
  const rerunApprovalMatch = pathname.match(new RegExp(`^${product.route}/projects/([^/]+)/agent/approve-rerun$`));
  if (rerunApprovalMatch && request.method === "POST") {
    const body = await readJson(request);
    const project = await projects.getForUser(decodeURIComponent(rerunApprovalMatch[1]), user.id);
    if (!project || typeof body?.runtimeId !== "string" || typeof body?.command !== "string" || body.command.length === 0) return safeErrorResponse(400, "Project, runtime, and command are required.");
    const runtime = await runtimes.getForUser(user.id, body.runtimeId);
    if (!runtime || runtime.projectId !== project.id) return safeErrorResponse(404, "Runtime not found.");
    const connection = await connections.get(user.id, runtime.connectionId);
    const provider = connection && connectionProviders.get(`${connection.kind}:${connection.providerId}`);
    if (!connection || !provider) return safeErrorResponse(409, "Compute provider is unavailable.");
    try {
      const result = commandResult(await provider.executeCommand(await connections.credentials(user.id, connection.id), runtime.providerRuntimeId, body.command));
      result.stdout = await redactRuntimeText(project.id, result.stdout, context);
      result.stderr = await redactRuntimeText(project.id, result.stderr, context);
      return json({ approved: true, result });
    } catch {
      return safeErrorResponse(502, "Compute provider request failed.");
    }
  }
  if ((agentMatch || agentStreamMatch) && request.method === "POST") {
    const body = await readJson(request);
    const project = await projects.getForUser(decodeURIComponent((agentMatch ?? agentStreamMatch)[1]), user.id);
    if (!project) return safeErrorResponse(404, "Project not found.");
    if (typeof body?.message !== "string" || body.message.length === 0 || body.message.length > 20_000) {
      return safeErrorResponse(400, "A message between 1 and 20,000 characters is required.");
    }
    try {
      const { agent } = await prepareAgent(user, project, body, context, connections, changes, runtimes, previews);
      const projectContext = await buildProjectContext({
        projectId: project.id,
        files: new FileService(context.database),
        relevantPaths: body.context?.paths ?? [],
        query: body.context?.query,
        recentErrors: body.context?.recentErrors ?? [],
      });
      if (!agentStreamMatch) {
        const events = [];
        const result = await agent.run(body.message, { projectContext, onEvent: (event) => events.push(event) });
        return json({ agent: { ...result, events } });
      }

      const taskId = crypto.randomUUID();
      const controller = new AbortController();
      agentTasks.set(taskId, { userId: user.id, projectId: project.id, controller });
      const encoder = new TextEncoder();
      const send = (event) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
      const stream = new ReadableStream({
        start(streamController) {
          streamController.enqueue(send({ type: "run.started", taskId }));
          (async () => {
            try {
              const result = await agent.run(body.message, { projectContext, signal: controller.signal, onEvent: (event) => streamController.enqueue(send(event)) });
              streamController.enqueue(send({ type: "run.completed", result }));
            } catch (error) {
              streamController.enqueue(send({ type: controller.signal.aborted ? "run.cancelled" : "run.error", error: controller.signal.aborted ? "Agent run cancelled." : "AI provider request failed." }));
            } finally {
              agentTasks.delete(taskId);
              streamController.close();
            }
          })();
        },
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" } });
    } catch {
      return safeErrorResponse(400, "An AI provider connection is required.");
    }
  }

  if (agentCancelMatch && request.method === "POST") {
    const body = await readJson(request);
    const task = agentTasks.get(body?.taskId);
    if (!task || task.userId !== user.id || task.projectId !== decodeURIComponent(agentCancelMatch[1])) return safeErrorResponse(404, "Agent run not found.");
    task.controller.abort();
    metrics.increment("studio.agent.cancelled");
    return json({ cancelled: true });
  }

  if (pathname === `${product.route}/connections/providers` && request.method === "GET") {
    return json({ providers: [...connectionProviders.values()].map((provider) => provider.describe()) });
  }

  if (pathname === `${product.route}/connections` && request.method === "GET") {
    return json({ connections: await connections.list(user.id) });
  }

  if (pathname === `${product.route}/connections/validate` && request.method === "POST") {
    const body = await readJson(request);
    const provider = connectionProviders.get(`${body?.kind}:${body?.providerId}`);
    if (!provider || !body.credentials || typeof body.credentials !== "object") {
      return safeErrorResponse(400, "Provider and credentials are required.");
    }
    return json({ valid: await provider.validate(body.credentials) });
  }

  if (pathname === `${product.route}/connections` && request.method === "POST") {
    const body = await readJson(request);
    const provider = connectionProviders.get(`${body?.kind}:${body?.providerId}`);
    if (!provider || !body.credentials || typeof body.credentials !== "object") {
      return safeErrorResponse(400, "Provider and credentials are required.");
    }
    if (!await provider.validate(body.credentials)) return safeErrorResponse(422, "Provider credentials could not be validated.");
    try {
      const connection = await connections.create(user.id, provider.kind, provider.id, body.credentials);
      metrics.increment(`studio.connections.${provider.id}`);
      return connection ? json({ connection }, 201) : safeErrorResponse(409, "That provider is already connected.");
    } catch {
      return safeErrorResponse(503, "Provider connection storage is unavailable.");
    }
  }

  const connectionMatch = pathname.match(new RegExp(`^${product.route}/connections/([^/]+)$`));
  const connectionActionMatch = pathname.match(new RegExp(`^${product.route}/connections/([^/]+)/(select)$`));
  const connectionId = connectionMatch?.[1] ?? connectionActionMatch?.[1];
  if (connectionId) {
    const connection = await connections.get(user.id, decodeURIComponent(connectionId));
    if (!connection) return safeErrorResponse(404, "Connection not found.");
    const provider = connectionProviders.get(`${connection.kind}:${connection.providerId}`);
    if (!provider) return safeErrorResponse(409, "Provider is no longer available.");
    if (connectionActionMatch && request.method === "POST") {
      return json({ connection: await connections.select(user.id, connection.id) });
    }
    if (connectionMatch && request.method === "PUT") {
      const body = await readJson(request);
      if (!body?.credentials || typeof body.credentials !== "object") return safeErrorResponse(400, "Credentials are required.");
      if (!await provider.validate(body.credentials)) return safeErrorResponse(422, "Provider credentials could not be validated.");
      try {
        return json({ connection: await connections.update(user.id, connection.id, body.credentials) });
      } catch {
        return safeErrorResponse(503, "Provider connection storage is unavailable.");
      }
    }
    if (connectionMatch && request.method === "DELETE") {
      return (await connections.delete(user.id, connection.id))
        ? json({ disconnected: true }) : safeErrorResponse(404, "Connection not found.");
    }
  }

  const runtimeProjectMatch = pathname.match(new RegExp(`^${product.route}/projects/([^/]+)/runtimes$`));
  if (runtimeProjectMatch && request.method === "POST") {
    const body = await readJson(request);
    const project = await projects.getForUser(decodeURIComponent(runtimeProjectMatch[1]), user.id);
    if (!project) return safeErrorResponse(404, "Project not found.");
    const available = await connections.list(user.id);
    const connection = await connections.get(user.id, body?.connectionId)
      ?? available.find((item) => item.kind === "compute" && item.selected && (body?.providerId ? item.providerId === body.providerId : true));
    if (!connection || connection.kind !== "compute") return safeErrorResponse(400, "A selected compute connection is required.");
    const provider = connectionProviders.get(`${connection.kind}:${connection.providerId}`);
    if (!provider || typeof provider.createRuntime !== "function") return safeErrorResponse(409, "Compute provider is unavailable.");
    try {
      const credentials = await connections.credentials(user.id, connection.id);
      const result = await provider.createRuntime(credentials, body?.options ?? {});
      const providerRuntimeId = runtimeId(result);
      if (!providerRuntimeId) return safeErrorResponse(502, "Compute provider returned no runtime ID.");
      return json({ runtime: await runtimes.create(user.id, project.id, connection.id, connection.providerId, providerRuntimeId, result.status ?? "running") }, 201);
    } catch {
      return safeErrorResponse(502, "Compute provider request failed.");
    }
  }

  const previewRuntimeMatch = pathname.match(new RegExp(`^${product.route}/runtimes/([^/]+)/previews$`));
  if (previewRuntimeMatch && request.method === "POST") {
    const body = await readJson(request);
    const runtime = await runtimes.getForUser(user.id, decodeURIComponent(previewRuntimeMatch[1]));
    if (!runtime) return safeErrorResponse(404, "Runtime not found.");
    if (!Number.isInteger(body?.port) || body.port < 1 || body.port > 65535 || typeof body?.command !== "string" || body.command.length === 0) {
      return safeErrorResponse(400, "A valid port and application command are required.");
    }
    const connection = await connections.get(user.id, runtime.connectionId);
    const provider = connection && connectionProviders.get(`${connection.kind}:${connection.providerId}`);
    if (!connection || !provider) return safeErrorResponse(409, "Compute provider is unavailable.");
    try {
      const credentials = await connections.credentials(user.id, connection.id);
      const command = commandResult(await provider.executeCommand(credentials, runtime.providerRuntimeId, body.command, body.options ?? {}));
      command.stdout = await redactRuntimeText(runtime.projectId, command.stdout, context);
      command.stderr = await redactRuntimeText(runtime.projectId, command.stderr, context);
      if (command.exitCode !== null && command.exitCode !== 0) return json({ command, error: "Application command failed." }, 422);
      const providerPreview = previewResult(await provider.startPreview(credentials, runtime.providerRuntimeId, body.port, body.options ?? {}));
      if (!providerPreview.providerPreviewId || !providerPreview.address) return safeErrorResponse(502, "Compute provider returned no temporary preview address.");
      const preview = await previews.create(user.id, runtime.id, providerPreview.providerPreviewId, body.port, providerPreview.address, command.commandId, body.ttlSeconds);
      metrics.increment("studio.previews.started");
      return json({ preview, command }, 201);
    } catch {
      return safeErrorResponse(502, "Compute provider request failed.");
    }
  }

  const previewActionMatch = pathname.match(new RegExp(`^${product.route}/previews/([^/]+)(?:/(status|logs|stop))?$`));
  if (previewActionMatch) {
    const preview = await previews.getForUser(user.id, decodeURIComponent(previewActionMatch[1]));
    if (!preview) return safeErrorResponse(404, "Preview not found.");
    const runtime = await runtimes.getForUser(user.id, preview.runtimeId);
    const connection = runtime && await connections.get(user.id, runtime.connectionId);
    const provider = connection && connectionProviders.get(`${connection.kind}:${connection.providerId}`);
    if (!runtime || !connection || !provider) return safeErrorResponse(409, "Compute provider is unavailable.");
    try {
      const credentials = await connections.credentials(user.id, connection.id);
      const action = previewActionMatch[2];
      if ((!action || action === "status") && request.method === "GET") {
        const result = await provider.previewStatus(credentials, runtime.providerRuntimeId, preview.providerPreviewId);
        return json({ preview: await previews.update(preview, { status: result?.status ?? preview.status, address: result?.url ?? result?.address ?? preview.address }) });
      }
      if (action === "logs" && request.method === "GET") {
        const result = commandResult(await provider.previewLogs(credentials, runtime.providerRuntimeId, preview.providerPreviewId));
        result.stdout = await redactRuntimeText(runtime.projectId, result.stdout, context);
        result.stderr = await redactRuntimeText(runtime.projectId, result.stderr, context);
        return json({ logs: result });
      }
      if (action === "stop" && request.method === "POST") {
        await provider.stopPreview(credentials, runtime.providerRuntimeId, preview.providerPreviewId);
        return json({ preview: await previews.update(preview, { status: "stopped" }) });
      }
      return safeErrorResponse(404, "Preview route not found.");
    } catch {
      return safeErrorResponse(502, "Compute provider request failed.");
    }
  }

  const runtimeCancelMatch = pathname.match(new RegExp(`^${product.route}/runtimes/([^/]+)/commands/([^/]+)/cancel$`));
  const runtimeActionMatch = pathname.match(new RegExp(`^${product.route}/runtimes/([^/]+)(?:/(start|stop|destroy|commands|status))?$`));
  if (runtimeActionMatch || runtimeCancelMatch) {
    const runtime = await runtimes.getForUser(user.id, decodeURIComponent((runtimeActionMatch ?? runtimeCancelMatch)[1]));
    if (!runtime) return safeErrorResponse(404, "Runtime not found.");
    const connection = await connections.get(user.id, runtime.connectionId);
    const provider = connection && connectionProviders.get(`${connection.kind}:${connection.providerId}`);
    if (!connection || !provider) return safeErrorResponse(409, "Compute provider is unavailable.");
    try {
      const credentials = await connections.credentials(user.id, connection.id);
      const action = runtimeActionMatch?.[2];
      if ((!action || action === "status") && request.method === "GET") {
        const result = await provider.runtimeStatus(credentials, runtime.providerRuntimeId);
        const updated = await runtimes.update(runtime, { status: result?.status ?? runtime.status });
        return json({ runtime: updated });
      }
      if (action === "start" && request.method === "POST") {
        const result = await provider.startRuntime(credentials, runtime.providerRuntimeId);
        return json({ runtime: await runtimes.update(runtime, { status: "running" }), provider: result });
      }
      if (action === "stop" && request.method === "POST") {
        const result = await provider.stopRuntime(credentials, runtime.providerRuntimeId);
        return json({ runtime: await runtimes.update(runtime, { status: "stopped" }), provider: result });
      }
      if (action === "destroy" && request.method === "POST") {
        const result = await provider.destroyRuntime(credentials, runtime.providerRuntimeId);
        await runtimes.delete(runtime);
        return json({ destroyed: true, provider: result });
      }
      if (action === "commands" && request.method === "POST") {
        const body = await readJson(request);
        if (typeof body?.command !== "string" || body.command.length === 0) return safeErrorResponse(400, "A command is required.");
        const result = commandResult(await provider.executeCommand(credentials, runtime.providerRuntimeId, body.command, body.options ?? {}));
        metrics.increment("studio.runtime.commands");
        result.stdout = await redactRuntimeText(runtime.projectId, result.stdout, context);
        result.stderr = await redactRuntimeText(runtime.projectId, result.stderr, context);
        return json({ result });
      }
      if (runtimeCancelMatch && request.method === "POST") {
        return json({ cancelled: true, provider: await provider.cancelCommand(credentials, runtime.providerRuntimeId, decodeURIComponent(runtimeCancelMatch[2])) });
      }
      return safeErrorResponse(404, "Runtime route not found.");
    } catch {
      return safeErrorResponse(502, "Compute provider request failed.");
    }
  }

  const githubOAuth = new GitHubOAuthService(context.database, connections, context.github ?? {});
  if (pathname === `${product.route}/github/connect` && request.method === "GET") {
    try {
      return Response.redirect(await githubOAuth.start(user.id), 302);
    } catch {
      return safeErrorResponse(503, "GitHub OAuth is unavailable.");
    }
  }

  if (pathname === `${product.route}/github/callback` && request.method === "GET") {
    const query = new URL(request.url).searchParams;
    if (!query.get("state") || !query.get("code")) return safeErrorResponse(400, "GitHub OAuth response is incomplete.");
    try {
      await githubOAuth.finish(user.id, query.get("state"), query.get("code"));
      return Response.redirect(`${product.route}/workspace?github=connected`, 302);
    } catch {
      return safeErrorResponse(400, "GitHub connection could not be completed.");
    }
  }

  const githubPath = pathname.slice(`${product.route}/github/`.length);
  if (pathname.startsWith(`${product.route}/github/`) && githubPath !== "connect" && githubPath !== "callback") {
    const body = request.method === "POST" ? await readJson(request) : undefined;
    const connected = await githubCredentials(request, body, connections, user.id);
    if (!connected) return safeErrorResponse(404, "GitHub connection not found.");
    const { connection, credentials } = connected;
    const token = credentials?.accessToken;
    try {
      if (githubPath === "repositories" && request.method === "GET") {
        const repositories = await githubProvider.listRepositories(token);
        return json({ repositories: repositories.map(({ id, name, full_name: fullName, private: isPrivate, default_branch: defaultBranch, owner }) => ({ id, name, fullName, private: isPrivate, defaultBranch, owner: owner?.login })) });
      }
      if (githubPath === "branches" && request.method === "GET") {
        const query = new URL(request.url).searchParams;
        if (!query.get("owner") || !query.get("repository")) return safeErrorResponse(400, "Repository owner and name are required.");
        const branches = await githubProvider.listBranches(token, query.get("owner"), query.get("repository"));
        return json({ branches: branches.map(({ name, commit }) => ({ name, sha: commit?.sha })) });
      }

      const projectId = body?.projectId ?? new URL(request.url).searchParams.get("projectId");
      const project = projectId && await projects.getForUser(projectId, user.id);
      if (!project) return safeErrorResponse(404, "Project not found.");
      const owner = body?.owner ?? new URL(request.url).searchParams.get("owner");
      const repository = body?.repository ?? new URL(request.url).searchParams.get("repository");
      const branch = body?.branch ?? new URL(request.url).searchParams.get("branch");
      if (!owner || !repository || !branch) return safeErrorResponse(400, "Repository owner, name, and branch are required.");

      if ((githubPath === "import" || githubPath === "pull") && request.method === "POST") {
        const incoming = await remoteFiles(githubProvider, token, owner, repository, branch);
        const local = new FileService(context.database);
        for (const file of incoming) {
          const existing = await local.get(project.id, file.path);
          if (existing) await local.update(project.id, file.path, file.content);
          else await local.create(project.id, file.path, "file", file.content);
        }
        return json({ imported: incoming.length });
      }

      if (githubPath === "status" || githubPath === "diff") {
        const remote = await remoteFiles(githubProvider, token, owner, repository, branch);
        const local = (await new FileService(context.database).list(project.id)).filter((file) => file.type === "file");
        const paths = new Set([...local.map((file) => file.path), ...remote.map((file) => file.path)]);
        const localByPath = new Map(local.map((file) => [file.path, file]));
        const remoteByPath = new Map(remote.map((file) => [file.path, file]));
        const changes = [...paths].map((filePath) => {
          const localFile = localByPath.get(filePath);
          const remoteFile = remoteByPath.get(filePath);
          return { path: filePath, status: !remoteFile ? "added" : !localFile ? "deleted" : localFile.content === remoteFile.content ? "unchanged" : "modified", ...(githubPath === "diff" && localFile?.content !== remoteFile?.content ? { local: localFile?.content, remote: remoteFile?.content } : {}) };
        }).filter((file) => githubPath === "diff" ? file.status !== "unchanged" : true);
        return json({ changes });
      }

      if ((githubPath === "commit" || githubPath === "push") && request.method === "POST") {
        if (typeof body?.path !== "string" || typeof body?.message !== "string" || body.message.length === 0) return safeErrorResponse(400, "File path and commit message are required.");
        const local = await new FileService(context.database).get(project.id, body.path);
        if (!local || local.type !== "file") return safeErrorResponse(404, "Local file not found.");
        let sha;
        try {
          sha = (await githubProvider.readFile(token, owner, repository, body.path, branch)).sha;
        } catch {
          sha = undefined;
        }
        const result = await githubProvider.writeFile(token, owner, repository, body.path, branch, local.content, body.message, sha);
        return json({ pushed: true, commit: result?.commit?.sha ?? result?.content?.sha });
      }
      return safeErrorResponse(404, "GitHub route not found.");
    } catch {
      return safeErrorResponse(502, "GitHub request failed.");
    }
  }

  if (pathname === `${product.route}/projects` && request.method === "GET") {
    return json({ projects: await projects.listForUser(user.id) });
  }

  if (pathname === `${product.route}/projects` && request.method === "POST") {
    const name = projectInput(await readJson(request));
    if (!name) return safeErrorResponse(400, "Project name must be 1-100 characters.");
    return json({ project: await projects.create(user.id, name) }, 201);
  }

  const filesMatch = pathname.match(new RegExp(`^${product.route}/projects/([^/]+)/files(?:/(read|search))?$`));
  if (filesMatch) {
    const project = await projects.getForUser(decodeURIComponent(filesMatch[1]), user.id);
    if (!project) return safeErrorResponse(404, "Project not found.");
    const files = new FileService(context.database);
    const operation = filesMatch[2];
    const query = new URL(request.url).searchParams;

    if (operation === "read" && request.method === "GET") {
      try {
        const file = await files.get(project.id, query.get("path"));
        return file ? json({ path: file.path, type: file.type, content: file.content })
          : safeErrorResponse(404, "File not found.");
      } catch (error) {
        return safeErrorResponse(400, error.message);
      }
    }

    if (operation === "search" && request.method === "GET") {
      const search = query.get("q");
      if (!search) return safeErrorResponse(400, "Search query is required.");
      return json({ results: await files.search(project.id, search) });
    }

    if (operation === undefined && request.method === "GET") {
      try {
        return json({ files: await files.list(project.id, query.get("path") ?? "") });
      } catch (error) {
        return safeErrorResponse(400, error.message);
      }
    }

    if (operation === undefined && request.method === "POST") {
      const body = await readJson(request);
      if (typeof body?.path !== "string" || (body.type !== undefined && body.type !== "file" && body.type !== "folder") || (body.content !== undefined && typeof body.content !== "string")) {
        return safeErrorResponse(400, "A valid path, type, and content are required.");
      }
      try {
        const file = await files.create(project.id, body.path, body.type, body.content);
        return file ? json({ file }, 201) : safeErrorResponse(409, "A file already exists at that path.");
      } catch (error) {
        return safeErrorResponse(400, error.message);
      }
    }

    if (operation === undefined && request.method === "PUT") {
      const body = await readJson(request);
      if (typeof body?.path !== "string" || typeof body.content !== "string") {
        return safeErrorResponse(400, "A path and string content are required.");
      }
      try {
        const file = await files.update(project.id, body.path, body.content);
        return file ? json({ file }) : safeErrorResponse(404, "File not found.");
      } catch (error) {
        return safeErrorResponse(400, error.message);
      }
    }

    if (operation === undefined && request.method === "PATCH") {
      const body = await readJson(request);
      if (typeof body?.path !== "string" || typeof body.newPath !== "string") {
        return safeErrorResponse(400, "A path and newPath are required.");
      }
      try {
        const file = await files.rename(project.id, body.path, body.newPath);
        return file ? json({ file }) : safeErrorResponse(404, "File not found or destination exists.");
      } catch (error) {
        return safeErrorResponse(400, error.message);
      }
    }

    if (operation === undefined && request.method === "DELETE") {
      try {
        const deleted = await files.delete(project.id, query.get("path"));
        return deleted ? json({ deleted: true }) : safeErrorResponse(404, "File not found.");
      } catch (error) {
        return safeErrorResponse(400, error.message);
      }
    }
  }

  const secretsMatch = pathname.match(new RegExp(`^${product.route}/projects/([^/]+)/secrets(?:/([^/]+))?$`));
  if (secretsMatch) {
    const project = await projects.getForUser(decodeURIComponent(secretsMatch[1]), user.id);
    if (!project) return safeErrorResponse(404, "Project not found.");
    if (!context.projectSecretsKey) return safeErrorResponse(503, "Project secrets are unavailable.");
    const secrets = new SecretService(context.database, context.projectSecretsKey);
    const name = secretsMatch[2] && decodeURIComponent(secretsMatch[2]);

    try {
      if (!name && request.method === "GET") return json({ secrets: await secrets.list(project.id) });
      const body = request.method === "POST" || request.method === "PUT" ? await readJson(request) : undefined;
      const secretName = name ?? body?.name;
      if (request.method === "POST" && !name && typeof secretName === "string" && typeof body?.value === "string") {
        const created = await secrets.create(project.id, secretName, body.value);
        return created ? json({ secret: created }, 201) : safeErrorResponse(409, "A secret with that name already exists.");
      }
      if (request.method === "PUT" && name && typeof body?.value === "string") {
        const updated = await secrets.update(project.id, name, body.value);
        return updated ? json({ secret: updated }) : safeErrorResponse(404, "Secret not found.");
      }
      if (request.method === "DELETE" && name) {
        return (await secrets.delete(project.id, name))
          ? json({ deleted: true }) : safeErrorResponse(404, "Secret not found.");
      }
      return safeErrorResponse(400, "Invalid secret request.");
    } catch {
      return safeErrorResponse(400, "Invalid secret request.");
    }
  }

  const projectMatch = pathname.match(new RegExp(`^${product.route}/projects/([^/]+)$`));
  const archiveMatch = pathname.match(new RegExp(`^${product.route}/projects/([^/]+)/archive$`));
  const projectId = projectMatch?.[1] ?? archiveMatch?.[1];
  if (projectId) {
    const project = await projects.getForUser(decodeURIComponent(projectId), user.id);
    if (!project) return safeErrorResponse(404, "Project not found.");
    if (archiveMatch && request.method === "POST") {
      return json({ project: await projects.archive(project.id, user.id) });
    }
    if (projectMatch && request.method === "GET") return json({ project });
    if (projectMatch && request.method === "PATCH") {
      const name = projectInput(await readJson(request));
      if (!name) return safeErrorResponse(400, "Project name must be 1-100 characters.");
      return json({ project: await projects.rename(project.id, user.id, name) });
    }
    if (projectMatch && request.method === "DELETE") {
      await projects.delete(project.id, user.id);
      return json({ deleted: true });
    }
  }

  if (pathname === `${product.route}/workspace` && request.method === "GET") {
    return new Response(workspacePage(product), { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  if (pathname === `${product.route}/profile` && request.method === "GET") {
    return json({ profile: profile(user) });
  }

  if (pathname === product.route && request.method === "GET") {
    return json({ product: product.id, status: "ready", user: profile(user), dashboard: { workspace: `${product.route}/workspace` } });
  }

  return safeErrorResponse(404, "Studio route not found.");
}