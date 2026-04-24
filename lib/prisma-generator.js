"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generate = generate;
const internals_1 = require("@prisma/internals");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const pluralize_1 = __importDefault(require("pluralize"));
const prisma_generator_1 = require("prisma-zod-generator/lib/prisma-generator");
const config_1 = require("./config");
const fix_schemas_1 = require("./fix-schemas");
const helpers_1 = require("./helpers");
const project_1 = require("./project");
const removeDir_1 = __importDefault(require("./utils/removeDir"));
// Operations introduced in Prisma 5+ that require additional schema support not yet implemented
const UNSUPPORTED_OPERATIONS = new Set(['createManyAndReturn', 'updateManyAndReturn']);
async function generate(options) {
    var _a, _b;
    const outputDir = (0, internals_1.parseEnvValue)(options.generator.output);
    const results = config_1.configSchema.safeParse(options.generator.config);
    if (!results.success)
        throw new Error('Invalid options passed');
    const config = results.data;
    // contextPath is an upstream alias for trpcPath
    const resolvedTrpcPath = (_a = config.contextPath) !== null && _a !== void 0 ? _a : config.trpcPath;
    await fs_1.promises.mkdir(outputDir, { recursive: true });
    await (0, removeDir_1.default)(outputDir, true);
    options.generator.config['isGenerateSelect'] = 'true';
    options.generator.config['isGenerateInclude'] = 'true';
    // prisma-zod-generator requires languages; provide resolved value so it never crashes
    options.generator.config['languages'] = config.languages;
    // prisma-zod-generator bundles Prisma 4 internals which require a `url` in the datasource
    // block, but Prisma 7 forbids `url` in schema.prisma. Inject a dummy url only into the
    // datamodel copy that the zod generator uses — Prisma 7 has already validated the real schema.
    const datamodelForZod = options.datamodel.replace(/(datasource\s+\w+\s*\{)([^}]*?)(provider\s*=\s*[^\n]+)/, '$1$2$3\n  url      = "mysql://localhost/dummy"');
    // prisma-zod-generator bundles Prisma 4's generator-helper types; cast to satisfy its stale signature
    await (0, prisma_generator_1.generate)({ ...options, datamodel: datamodelForZod });
    // Apply Prisma 7 compatibility patches to the generated schema files:
    //   • Rename ${Model}Args → ${Model}DefaultArgs (type + file + importers)
    //   • Fix filter in/notIn to array-only; add string unions for DateTime/Int/BigInt/Decimal
    //   • Add <never> generic to ZodType<Prisma.XxxFilter> annotations
    await (0, fix_schemas_1.fixGeneratedSchemas)(outputDir);
    const dataSource = (_b = options.datasources) === null || _b === void 0 ? void 0 : _b[0];
    // GeneratorOptions includes the DMMF directly since Prisma 5
    const prismaClientDmmf = options.dmmf;
    const appRouter = project_1.project.createSourceFile(path_1.default.resolve(outputDir, 'routers', `index.ts`), undefined, { overwrite: true });
    // hot fix for windows
    const trpcPath = resolvedTrpcPath.split(path_1.default.sep).join('/');
    (0, helpers_1.generatetRPCRouterImport)(appRouter, trpcPath);
    const routers = [];
    prismaClientDmmf.mappings.modelOperations.forEach((modelOperation) => {
        const { model, ...operations } = modelOperation;
        const plural = (0, pluralize_1.default)(model.toLowerCase());
        const hasCreateMany = Boolean(operations.createMany);
        (0, helpers_1.generateRouterImport)(appRouter, plural, model);
        const modelRouter = project_1.project.createSourceFile(path_1.default.resolve(outputDir, 'routers', `${model}Router`, `index.ts`), undefined, { overwrite: true });
        (0, helpers_1.generatetRPCRouterImport)(modelRouter, path_1.default.join('..', trpcPath));
        (0, helpers_1.generateProcedureImports)(modelRouter, model, hasCreateMany, dataSource.provider);
        const procedures = [];
        for (const [opType, opNameWithModel] of Object.entries(operations)) {
            if (opNameWithModel == null || UNSUPPORTED_OPERATIONS.has(opType))
                continue;
            const modelProcedure = project_1.project.createSourceFile(path_1.default.resolve(outputDir, 'routers', `${model}Router`, `${opNameWithModel}.procedure.ts`), undefined, { overwrite: true });
            (0, helpers_1.generatetRPCProcedureImport)(modelProcedure, path_1.default.join('..', trpcPath));
            (0, helpers_1.generateProcedureSchemaImports)(modelProcedure, opType, model);
            (0, helpers_1.generateProcedure)(modelProcedure, opNameWithModel, model, opType, config.withMiddleware, config.withShield);
            procedures.push(`${opNameWithModel}: ${opNameWithModel}Procedure`);
        }
        modelRouter.addStatements(/* ts */ `
    export const ${plural}Router =  router({${procedures.join(',\n')}})`);
        modelRouter.formatText({ indentSize: 2 });
        routers.push(`${model.toLowerCase()}: ${plural}Router`);
    });
    appRouter.addStatements(/* ts */ `
  export const appRouter = router({${routers.join(',\n')}})`);
    appRouter.formatText({ indentSize: 2 });
    await project_1.project.save();
}
//# sourceMappingURL=prisma-generator.js.map