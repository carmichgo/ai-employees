import fp from "fastify-plugin";
import { ZodError } from "zod";
export const errorHandlerPlugin = fp(async function (fastify) {
    fastify.setErrorHandler((error, _request, reply) => {
        if (error instanceof ZodError) {
            return reply.status(400).send({
                error: "Validation Error",
                details: error.flatten().fieldErrors,
            });
        }
        const fastifyError = error;
        if (fastifyError.statusCode) {
            return reply.status(fastifyError.statusCode).send({
                error: fastifyError.message,
            });
        }
        fastify.log.error(error);
        return reply.status(500).send({
            error: "Internal Server Error",
        });
    });
});
//# sourceMappingURL=error-handler.js.map