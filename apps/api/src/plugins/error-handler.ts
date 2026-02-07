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

    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        error: error.message,
      });
    }

    fastify.log.error(error);
    return reply.status(500).send({
      error: "Internal Server Error",
    });
  });
}
