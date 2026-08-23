export class QueueConsumer {
  async consume() {
    throw new Error("QueueConsumer.consume must be implemented.");
  }
}

export class JobHandlerRegistry {
  #handlers = new Map();

  register(type, handler) {
    if (this.#handlers.has(type)) {
      throw new Error(`Duplicate job handler: ${type}`);
    }

    this.#handlers.set(type, handler);
  }

  get(type) {
    return this.#handlers.get(type);
  }
}

export class JobConsumer extends QueueConsumer {
  constructor(handlers) {
    super();
    this.handlers = handlers;
  }

  async consume(batch) {
    for (const message of batch.messages) {
      const handler = this.handlers.get(message.body.type);

      if (!handler) {
        message.retry();
        continue;
      }

      await handler(message.body);
      message.ack();
    }
  }
}