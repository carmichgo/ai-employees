import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "Validation Error",
        details: error.flatten().fieldErrors,
      });
    }

    const fastifyError = error as { statusCode?: number; message: string };
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
}
