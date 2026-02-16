const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_API = "https://api.resend.com";
export async function emailRoutes(fastify) {
    // Middleware: verify inter-service secret
    fastify.addHook("onRequest", async (request, reply) => {
        const secret = request.headers["x-interservice-secret"];
        if (secret !== process.env.INTERSERVICE_SECRET) {
            return reply.status(403).send({ error: "Forbidden" });
        }
    });
    // POST /internal/email/send — send an email via Resend
    fastify.post("/internal/email/send", async (request, reply) => {
        if (!RESEND_API_KEY) {
            return reply.status(500).send({ error: "Email not configured — RESEND_API_KEY not set" });
        }
        const body = request.body;
        if (!body.from || !body.to || !body.subject) {
            return reply.status(400).send({ error: "Missing required fields: from, to, subject" });
        }
        if (!body.text && !body.html) {
            return reply.status(400).send({ error: "Must provide text or html body" });
        }
        try {
            const res = await fetch(`${RESEND_API}/emails`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${RESEND_API_KEY}`,
                },
                body: JSON.stringify({
                    from: body.from,
                    to: Array.isArray(body.to) ? body.to : [body.to],
                    subject: body.subject,
                    text: body.text,
                    html: body.html,
                    reply_to: body.replyTo,
                    cc: body.cc ? (Array.isArray(body.cc) ? body.cc : [body.cc]) : undefined,
                    bcc: body.bcc ? (Array.isArray(body.bcc) ? body.bcc : [body.bcc]) : undefined,
                }),
            });
            if (!res.ok) {
                const err = await res.text();
                fastify.log.error(`Resend API error: ${err}`);
                return reply.status(res.status).send({ error: `Email send failed: ${err}` });
            }
            const data = await res.json();
            return { success: true, emailId: data.id };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return reply.status(502).send({ error: `Email send error: ${message}` });
        }
    });
    // GET /internal/email/status — check email config
    fastify.get("/internal/email/status", async () => {
        return {
            configured: !!RESEND_API_KEY,
            provider: "resend",
        };
    });
}
//# sourceMappingURL=email.js.map