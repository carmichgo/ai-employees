import { Queue } from "bullmq";
import IORedis from "ioredis";

let provisionQueue: Queue | null = null;

export function getProvisionQueue(): Queue {
  if (!provisionQueue) {
    const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
    connection.on("error", (err) => {
      console.error("[queues] Redis connection error:", err.message);
    });
    provisionQueue = new Queue("employee-provisioning", { connection });
  }
  return provisionQueue;
}
