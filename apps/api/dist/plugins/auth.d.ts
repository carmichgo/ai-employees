import type { FastifyInstance } from "fastify";
export interface JwtPayload {
    userId: string;
    companyId: string;
    role: string;
}
export declare const authPlugin: (fastify: FastifyInstance) => Promise<void>;
declare module "fastify" {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}
declare module "@fastify/jwt" {
    interface FastifyJWT {
        payload: JwtPayload;
        user: JwtPayload;
    }
}
//# sourceMappingURL=auth.d.ts.map