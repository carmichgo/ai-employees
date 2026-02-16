import { Queue } from "bullmq";
import IORedis from "ioredis";
let provisionQueue = null;
export function getProvisionQueue() {
    if (!provisionQueue) {
        const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
            maxRetriesPerRequest: null,
        });
        provisionQueue = new Queue("employee-provisioning", { connection });
    }
    return provisionQueue;
}
//# sourceMappingURL=queues.js.map