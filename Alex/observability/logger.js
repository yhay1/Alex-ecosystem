const allowedFields = new Set(["requestId", "method", "path", "status", "durationMs", "errorType"]);

function clean(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields).filter(([name, value]) => allowedFields.has(name) && ["string", "number"].includes(typeof value)),
  );
}

export class StructuredLogger {
  constructor(output = console) {
    this.output = output;
  }

  info(event, fields) {
    this.output.log(JSON.stringify({ event, ...clean(fields) }));
  }

  error(event, fields) {
    this.output.error(JSON.stringify({ event, ...clean(fields) }));
  }
}