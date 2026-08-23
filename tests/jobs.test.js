import test from "node:test";
import assert from "node:assert/strict";

import { createJob, validateJob } from "../Alex/jobs/job.js";
import { QueueProducer } from "../Alex/jobs/producer.js";
import { JobConsumer, JobHandlerRegistry } from "../Alex/jobs/consumer.js";

test("creates and validates a generic job envelope", () => {
  const job = createJob({ type: "example", productId: "product", payload: { value: 1 } });

  assert.equal(validateJob(job).valid, true);
  assert.equal(job.retry.attempt, 0);
  assert.equal(job.retry.maxAttempts, 3);
  assert.match(job.createdAt, /^2026-/);
});

test("producer validates and sends jobs through the queue binding", async () => {
  const sent = [];
  const producer = new QueueProducer({ send: async (job, options) => sent.push({ job, options }) });
  const job = await producer.create(
    { type: "sync", productId: "product", payload: { id: 1 } },
    { delaySeconds: 5 },
  );

  assert.equal(sent[0].job.id, job.id);
  assert.deepEqual(sent[0].options, { delaySeconds: 5 });
});

test("consumer dispatches registered handlers and retries unknown jobs", async () => {
  const events = [];
  const handlers = new JobHandlerRegistry();
  handlers.register("known", async (job) => events.push(job.id));
  const consumer = new JobConsumer(handlers);
  const messages = [
    { body: { id: "one", type: "known" }, ack: () => events.push("ack"), retry: () => events.push("retry") },
    { body: { id: "two", type: "missing" }, ack: () => events.push("ack"), retry: () => events.push("retry") },
  ];

  await consumer.consume({ messages });

  assert.deepEqual(events, ["one", "ack", "retry"]);
});

test("invalid jobs are rejected before queue submission", async () => {
  const producer = new QueueProducer({ send: () => { throw new Error("should not send"); } });

  await assert.rejects(
    () => producer.create({ type: "missing-product", payload: {} }),
    /Invalid job/,
  );
});