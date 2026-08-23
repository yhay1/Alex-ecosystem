import { createJob, validateJob } from "./job.js";

export class QueueProducer {
  constructor(queue) {
    this.queue = queue;
  }

  async create(jobInput, options) {
    const job = jobInput?.createdAt ? jobInput : createJob(jobInput);
    const result = validateJob(job);

    if (!result.valid) {
      throw new Error(`Invalid job: ${result.errors.join(" ")}`);
    }

    await this.queue.send(job, options);
    return job;
  }
}