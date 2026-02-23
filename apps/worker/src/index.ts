import { Worker } from "bullmq";
import IORedis from "ioredis";
import {
  provisionEmployee,
  stopEmployee,
  startEmployee,
  teardownEmployee,
  cleanupOrphanedContainers,
  type ProvisionJobData,
} from "./workers/provision-employee.js";
import { pollAllEmployeeHealth } from "./workers/health-poll.js";
import { checkPendingTasks } from "./workers/task-check.js";
import { checkScheduleTriggers } from "./workers/schedule-triggers.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Main provisioning worker
const provisionWorker = new Worker(
  "employee-provisioning",
  async (job) => {
    console.log(`[worker] Processing job ${job.name} (${job.id})`);

    switch (job.name) {
      case "provision-employee":
        await provisionEmployee(job.data as ProvisionJobData);
        break;
      case "stop-employee":
        await stopEmployee(job.data.employeeId);
        break;
      case "start-employee":
        await startEmployee(job.data.employeeId);
        break;
      case "teardown-employee":
        await teardownEmployee(job.data.employeeId);
        break;
      default:
        console.warn(`[worker] Unknown job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 5,
    // Provisioning jobs pull Docker images & create containers — can take several
    // minutes.  The default lockDuration (30 s) causes BullMQ to mark them as
    // stalled and re-queue, leading to duplicate container creation (409 conflict).
    lockDuration: 600_000,       // 10 min — prevent false stalls
    stalledInterval: 120_000,    // check every 2 min instead of 30 s
  },
);

provisionWorker.on("completed", (job) => {
  console.log(`[worker] Job ${job.name} (${job.id}) completed`);
});

provisionWorker.on("failed", (job, err) => {
  console.error(`[worker] Job ${job?.name} (${job?.id}) failed:`, err.message);
});

// Health polling - runs every 60 seconds
const healthInterval = setInterval(async () => {
  try {
    await pollAllEmployeeHealth();
  } catch (error) {
    console.error("[health] Health polling error:", error);
  }
}, 60_000);

// Task checking — runs every 5 minutes, nudges employees about pending tasks
const taskCheckInterval = setInterval(async () => {
  try {
    await checkPendingTasks();
  } catch (error) {
    console.error("[task-check] Task checking error:", error);
  }
}, 5 * 60_000);

// Schedule trigger checker — runs every 60 seconds, fires cron-based triggers
const scheduleInterval = setInterval(async () => {
  try {
    await checkScheduleTriggers();
  } catch (error) {
    console.error("[schedule] Schedule trigger error:", error);
  }
}, 60_000);

// Graceful shutdown
async function shutdown() {
  console.log("[worker] Shutting down...");
  clearInterval(healthInterval);
  clearInterval(taskCheckInterval);
  clearInterval(scheduleInterval);
  await provisionWorker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("AI Employees Worker started — listening for provisioning jobs");

// Clean up orphaned containers 30s after startup — delay to avoid killing
// containers that are still being provisioned by in-flight jobs.
setTimeout(() => {
  cleanupOrphanedContainers().catch((err) =>
    console.error("[cleanup] Startup cleanup failed:", err.message),
  );
}, 30_000);
