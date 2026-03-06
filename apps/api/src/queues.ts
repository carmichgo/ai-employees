import { Queue } from "bullmq";
import IORedis from "ioredis";

let provisionQueue: Queue | null = null;

export function getProvisionQueue(): Queue {
  if (!provisionQueue) {
    const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
    provisionQueue = new Queue("employee-provisioning", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return provisionQueue;
}
