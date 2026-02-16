/**
 * Internal file management routes — upload, list, download, and delete files
 * in an employee's workspace directory.
 *
 * Files are stored at /opt/ai-employees/openclaw-configs/{employeeId}/workspace/uploads/
 * which is bind-mounted into the container at /home/node/.openclaw/workspace/uploads/
 */
import type { FastifyInstance } from "fastify";
export declare function fileRoutes(fastify: FastifyInstance): Promise<void>;
//# sourceMappingURL=files.d.ts.map