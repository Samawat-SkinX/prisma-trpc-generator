import { z } from 'zod';

export const configSchema = z.object({
  trpcPath: z.string().default('../../../../src/trpc'),
  // alias kept for parity with upstream
  contextPath: z.string().optional(),
  languages: z.string().default('en'),
  withMiddleware: z.string().optional(),
  withShield: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;
