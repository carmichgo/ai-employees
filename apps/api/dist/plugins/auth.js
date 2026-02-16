import fp from "fastify-plugin";
export const authPlugin = fp(async function (fastify) {
    fastify.decorate("authenticate", async function (request, reply) {
        try {
            await request.jwtVerify();
        }
        catch {
            reply.status(401).send({ error: "Unauthorized" });
        }
    });
});
//# sourceMappingURL=auth.js.map