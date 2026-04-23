"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configSchema = void 0;
const zod_1 = require("zod");
exports.configSchema = zod_1.z.object({
    trpcPath: zod_1.z.string().default('../../../../src/trpc'),
    // alias kept for parity with upstream
    contextPath: zod_1.z.string().optional(),
    languages: zod_1.z.string().default('en'),
    withMiddleware: zod_1.z.string().optional(),
    withShield: zod_1.z.string().optional(),
});
//# sourceMappingURL=config.js.map