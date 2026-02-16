/**
 * Trigger routes:
 *
 * Internal (authenticated via interservice secret):
 *   POST   /internal/employees/:id/triggers     — create trigger
 *   GET    /internal/employees/:id/triggers     — list triggers
 *   PATCH  /internal/triggers/:triggerId        — update trigger
 *   DELETE /internal/triggers/:triggerId        — delete trigger
 *
 * Public (no auth, token-based):
 *   POST   /webhooks/:token                     — receive external webhook
 */
import type { FastifyInstance } from "fastify";
export declare function triggerRoutes(fastify: FastifyInstance): Promise<void>;
//# sourceMappingURL=triggers.d.ts.map