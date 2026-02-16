/**
 * Internal provisioning routes — called by the Vercel frontend via inter-service auth.
 * These routes trigger actual Blitzer container lifecycle operations.
 */
import type { FastifyInstance } from "fastify";
export declare function provisionRoutes(fastify: FastifyInstance): Promise<void>;
/** Convert model config string to Anthropic model ID */
//# sourceMappingURL=provision.d.ts.map