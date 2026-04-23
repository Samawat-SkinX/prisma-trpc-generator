import { z } from 'zod';
export declare const configSchema: z.ZodObject<{
    trpcPath: z.ZodDefault<z.ZodString>;
    contextPath: z.ZodOptional<z.ZodString>;
    languages: z.ZodDefault<z.ZodString>;
    withMiddleware: z.ZodOptional<z.ZodString>;
    withShield: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    trpcPath?: string;
    contextPath?: string;
    languages?: string;
    withMiddleware?: string;
    withShield?: string;
}, {
    trpcPath?: string;
    contextPath?: string;
    languages?: string;
    withMiddleware?: string;
    withShield?: string;
}>;
export type Config = z.infer<typeof configSchema>;
