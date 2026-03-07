import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

// Prevent unhandled promise rejections from crashing the process
// (e.g. Slack SDK auth errors that escape try/catch blocks)
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
});

const config = loadConfig();
const server = await buildServer(config);

try {
  await server.listen({ port: config.API_PORT, host: "0.0.0.0" });
  console.log(`AI Employees API running on http://localhost:${config.API_PORT}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
