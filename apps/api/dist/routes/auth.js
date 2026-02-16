import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, companies, users } from "@ai-employees/db";
import { registerSchema, loginSchema } from "@ai-employees/shared";
export async function authRoutes(fastify) {
    // Register a new company + owner
    fastify.post("/api/auth/register", async (request, reply) => {
        const input = registerSchema.parse(request.body);
        // Check if company slug is taken
        const existing = await db.query.companies.findFirst({
            where: eq(companies.slug, input.companySlug),
        });
        if (existing) {
            return reply.status(409).send({ error: "Company slug already taken" });
        }
        // Check if email is taken
        const existingUser = await db.query.users.findFirst({
            where: eq(users.email, input.email),
        });
        if (existingUser) {
            return reply.status(409).send({ error: "Email already registered" });
        }
        // Create company
        const [company] = await db
            .insert(companies)
            .values({
            name: input.companyName,
            slug: input.companySlug,
        })
            .returning();
        // Create owner user
        const passwordHash = await bcrypt.hash(input.password, 12);
        const [user] = await db
            .insert(users)
            .values({
            companyId: company.id,
            email: input.email,
            name: input.name,
            passwordHash,
            role: "owner",
        })
            .returning();
        // Generate JWT
        const token = fastify.jwt.sign({
            userId: user.id,
            companyId: company.id,
            role: user.role,
        });
        return reply.status(201).send({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
            company: {
                id: company.id,
                name: company.name,
                slug: company.slug,
                plan: company.plan,
            },
        });
    });
    // Login
    fastify.post("/api/auth/login", async (request, reply) => {
        const input = loginSchema.parse(request.body);
        const user = await db.query.users.findFirst({
            where: eq(users.email, input.email),
        });
        if (!user) {
            return reply.status(401).send({ error: "Invalid credentials" });
        }
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
            return reply.status(401).send({ error: "Invalid credentials" });
        }
        const company = await db.query.companies.findFirst({
            where: eq(companies.id, user.companyId),
        });
        const token = fastify.jwt.sign({
            userId: user.id,
            companyId: user.companyId,
            role: user.role,
        });
        return reply.send({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
            company: company
                ? {
                    id: company.id,
                    name: company.name,
                    slug: company.slug,
                    plan: company.plan,
                }
                : null,
        });
    });
    // Get current user
    fastify.get("/api/auth/me", { onRequest: [fastify.authenticate] }, async (request, reply) => {
        const { userId, companyId } = request.user;
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });
        if (!user) {
            return reply.status(404).send({ error: "User not found" });
        }
        const company = await db.query.companies.findFirst({
            where: eq(companies.id, companyId),
        });
        return reply.send({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
            company: company
                ? {
                    id: company.id,
                    name: company.name,
                    slug: company.slug,
                    plan: company.plan,
                }
                : null,
        });
    });
}
//# sourceMappingURL=auth.js.map