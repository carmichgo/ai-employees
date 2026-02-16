import { z } from "zod";
export declare const registerSchema: z.ZodObject<{
    companyName: z.ZodString;
    companySlug: z.ZodString;
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    name: string;
    companyName: string;
    companySlug: string;
    password: string;
}, {
    email: string;
    name: string;
    companyName: string;
    companySlug: string;
    password: string;
}>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
//# sourceMappingURL=auth.d.ts.map