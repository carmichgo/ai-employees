/**
 * Email routes — internal email sending endpoint for Blitzer containers.
 *
 * Containers call POST /internal/email/send to send emails via Resend API.
 * The RESEND_API_KEY stays on the droplet, not in every container.
 */
import type { FastifyInstance } from "fastify";
export declare function emailRoutes(fastify: FastifyInstance): Promise<void>;
//# sourceMappingURL=email.d.ts.map