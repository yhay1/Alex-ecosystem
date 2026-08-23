const toolDefinitions = Object.freeze([
  { name: "read_file", description: "Read one file in the current project.", input: { path: "string" } },
  { name: "search_files", description: "Search file names and contents in the current project.", input: { query: "string" } },
  { name: "create_file", description: "Create a file or folder in the current project.", input: { path: "string", type: "file|folder", content: "string" } },
  { name: "edit_file", description: "Replace the contents of one project file.", input: { path: "string", content: "string" } },
  { name: "delete_file", description: "Delete a file or folder in the current project.", input: { path: "string" } },
  { name: "run_command", description: "Run a command in an existing project runtime.", input: { runtimeId: "string", command: "string" } },
  { name: "rerun_project", description: "Propose rerunning a project after a fix; requires user approval.", input: { runtimeId: "string", command: "string" } },
  { name: "inspect_logs", description: "Inspect logs for an existing project preview.", input: { previewId: "string" } },
  { name: "project_structure", description: "List the current project files and folders.", input: {} },
]);

function commandResult(result) {
  return {
    commandId: result?.id ?? result?.commandId,
    status: result?.status ?? "completed",
    stdout: result?.stdout ?? result?.output ?? result?.data?.stdout ?? "",
    stderr: result?.stderr ?? result?.error ?? result?.data?.stderr ?? "",
    exitCode: result?.exitCode ?? result?.data?.exitCode ?? null,
  };
}

export function agentTools({ userId, projectId, files, changes, runtimes, previews, connections, providers, redact }) {
  const ownedRuntime = async (runtimeId) => {
    const runtime = await runtimes.getForUser(userId, runtimeId);
    if (!runtime || runtime.projectId !== projectId) throw new Error("Runtime is not available to this project.");
    const connection = await connections.get(userId, runtime.connectionId);
    const provider = connection && providers.get(`${connection.kind}:${connection.providerId}`);
    if (!connection || !provider) throw new Error("Runtime provider is unavailable.");
    return { runtime, provider, credentials: await connections.credentials(userId, connection.id) };
  };

  return {
    read_file: async ({ path }) => {
      const file = await files.get(projectId, path);
      if (!file || file.type !== "file") throw new Error("File not found.");
      return { path: file.path, content: file.content };
    },
    search_files: async ({ query }) => (await files.search(projectId, query)).map(({ path, type }) => ({ path, type })),
    create_file: async ({ path, type = "file", content = "" }) => {
      if (type !== "file") throw new Error("Agent changes require a file review.");
      return changes.stage(userId, projectId, "create", path, content);
    },
    edit_file: async ({ path, content }) => {
      if (!await files.get(projectId, path)) throw new Error("File not found.");
      return changes.stage(userId, projectId, "edit", path, content);
    },
    delete_file: async ({ path }) => {
      if (!await files.get(projectId, path)) throw new Error("File not found.");
      return changes.stage(userId, projectId, "delete", path);
    },
    run_command: async ({ runtimeId, command }) => {
      if (typeof command !== "string" || command.length === 0) throw new Error("Command is required.");
      const { runtime, provider, credentials } = await ownedRuntime(runtimeId);
      const result = commandResult(await provider.executeCommand(credentials, runtime.providerRuntimeId, command));
      result.stdout = await redact(projectId, result.stdout);
      result.stderr = await redact(projectId, result.stderr);
      return result;
    },
    rerun_project: async ({ runtimeId, command }) => {
      await ownedRuntime(runtimeId);
      if (typeof command !== "string" || command.length === 0) throw new Error("Command is required.");
      return { approvalRequired: true, runtimeId, command };
    },
    inspect_logs: async ({ previewId }) => {
      const preview = await previews.getForUser(userId, previewId);
      if (!preview || preview.projectId && preview.projectId !== projectId) throw new Error("Preview is not available to this project.");
      const runtime = await runtimes.getForUser(userId, preview.runtimeId);
      if (!runtime || runtime.projectId !== projectId) throw new Error("Preview is not available to this project.");
      const connection = await connections.get(userId, runtime.connectionId);
      const provider = connection && providers.get(`${connection.kind}:${connection.providerId}`);
      if (!connection || !provider) throw new Error("Preview provider is unavailable.");
      const result = commandResult(await provider.previewLogs(await connections.credentials(userId, connection.id), runtime.providerRuntimeId, preview.providerPreviewId));
      return { ...result, stdout: await redact(projectId, result.stdout), stderr: await redact(projectId, result.stderr) };
    },
    project_structure: async () => (await files.list(projectId)).map(({ path, type }) => ({ path, type })),
  };
}

export class StudioAgent {
  constructor(provider, tools, { userId, projectId, maxTurns = 5 } = {}) {
    this.provider = provider;
    this.tools = tools;
    this.userId = userId;
    this.projectId = projectId;
    this.maxTurns = maxTurns;
  }

  async run(message, { signal, onEvent, projectContext } = {}) {
    const emit = (event) => onEvent?.({ ...event, at: new Date().toISOString() });
    const messages = projectContext
      ? [{ role: "system", content: `Targeted project context:\n${JSON.stringify(projectContext)}` }, { role: "user", content: message }]
      : [{ role: "user", content: message }];
    const toolResults = [];
    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      if (signal?.aborted) throw new Error("Agent run cancelled.");
      let response;
      if (typeof this.provider.generateStream === "function") {
        const chunks = [];
        for await (const chunk of this.provider.generateStream({ messages, tools: toolDefinitions }, { userId: this.userId, projectId: this.projectId, signal })) {
          chunks.push(chunk);
          emit({ type: "assistant.delta", content: typeof chunk === "string" ? chunk : chunk.content ?? "" });
        }
        response = {
          message: chunks.map((chunk) => typeof chunk === "string" ? chunk : chunk.content ?? "").join(""),
          toolCalls: chunks.flatMap((chunk) => typeof chunk === "object" ? chunk.toolCalls ?? [] : []),
        };
      } else {
        response = await this.provider.generate({ messages, tools: toolDefinitions }, { userId: this.userId, projectId: this.projectId, signal });
      }
      if (!Array.isArray(response?.toolCalls) || response.toolCalls.length === 0) {
        return { message: response?.message ?? response?.content ?? "", toolResults };
      }
      messages.push({ role: "assistant", toolCalls: response.toolCalls });
      for (const call of response.toolCalls) {
        if (signal?.aborted) throw new Error("Agent run cancelled.");
        emit({ type: "tool.started", id: call.id, name: call.name, input: call.name === "run_command" ? { runtimeId: call.input?.runtimeId } : call.input });
        const tool = this.tools[call.name];
        let result;
        if (!tool) result = { error: "Tool is not available." };
        else {
          try {
            result = await tool(call.input ?? {});
          } catch (error) {
            result = { error: error.message };
          }
        }
        toolResults.push({ id: call.id, name: call.name, result });
        emit({ type: result.error ? "tool.error" : "tool.completed", id: call.id, name: call.name, result: call.name === "read_file" ? { path: result.path } : result });
        messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(result) });
      }
    }
    return { message: "The agent reached its tool-call limit.", toolResults };
  }
}

export { toolDefinitions };