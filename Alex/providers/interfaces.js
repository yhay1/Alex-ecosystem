export const ProviderKinds = Object.freeze({
  AI: "ai",
  COMPUTE: "compute",
  SOURCE_CONTROL: "source-control",
});

const supportedKinds = new Set(Object.values(ProviderKinds));

export class ProviderAdapter {
  constructor({ id, name = id, kind, capabilities = [] } = {}) {
    if (typeof id !== "string" || id.length === 0) throw new Error("Provider id must be a non-empty string.");
    if (!supportedKinds.has(kind)) throw new Error("Provider kind is not supported.");
    if (!Array.isArray(capabilities) || capabilities.some((capability) => typeof capability !== "string")) {
      throw new Error("Provider capabilities must be strings.");
    }
    this.id = id;
    this.name = name;
    this.kind = kind;
    this.capabilities = [...capabilities];
  }

  describe() {
    return { id: this.id, name: this.name, kind: this.kind, capabilities: [...this.capabilities] };
  }
}

export class AIProvider extends ProviderAdapter {
  constructor(config = {}) {
    super({ ...config, kind: ProviderKinds.AI });
  }

  generate() {
    throw new Error("AIProvider.generate must be implemented by an adapter.");
  }
}

export class ComputeProvider extends ProviderAdapter {
  constructor(config = {}) {
    super({ ...config, kind: ProviderKinds.COMPUTE });
  }

  createRuntime() {
    throw new Error("ComputeProvider.createRuntime must be implemented by an adapter.");
  }

  startRuntime() {
    throw new Error("ComputeProvider.startRuntime must be implemented by an adapter.");
  }

  stopRuntime() {
    throw new Error("ComputeProvider.stopRuntime must be implemented by an adapter.");
  }

  destroyRuntime() {
    throw new Error("ComputeProvider.destroyRuntime must be implemented by an adapter.");
  }

  runtimeStatus() {
    throw new Error("ComputeProvider.runtimeStatus must be implemented by an adapter.");
  }

  executeCommand() {
    throw new Error("ComputeProvider.executeCommand must be implemented by an adapter.");
  }

  cancelCommand() {
    throw new Error("ComputeProvider.cancelCommand must be implemented by an adapter.");
  }

  startPreview() {
    throw new Error("ComputeProvider.startPreview must be implemented by an adapter.");
  }

  previewStatus() {
    throw new Error("ComputeProvider.previewStatus must be implemented by an adapter.");
  }

  stopPreview() {
    throw new Error("ComputeProvider.stopPreview must be implemented by an adapter.");
  }

  previewLogs() {
    throw new Error("ComputeProvider.previewLogs must be implemented by an adapter.");
  }
}

export class SourceControlProvider extends ProviderAdapter {
  constructor(config = {}) {
    super({ ...config, kind: ProviderKinds.SOURCE_CONTROL });
  }

  listFiles() {
    throw new Error("SourceControlProvider.listFiles must be implemented by an adapter.");
  }

  readFile() {
    throw new Error("SourceControlProvider.readFile must be implemented by an adapter.");
  }

  writeFile() {
    throw new Error("SourceControlProvider.writeFile must be implemented by an adapter.");
  }
}