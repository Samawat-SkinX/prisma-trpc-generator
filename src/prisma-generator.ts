import { EnvValue, GeneratorOptions } from '@prisma/generator-helper';
import { parseEnvValue } from '@prisma/internals';
import { promises as fs } from 'fs';
import path from 'path';
import pluralize from 'pluralize';
import { generate as PrismaZodGenerator } from 'prisma-zod-generator/lib/prisma-generator';
import { configSchema } from './config';
import { fixGeneratedSchemas } from './fix-schemas';
import {
  generateProcedure,
  generateProcedureImports,
  generateProcedureSchemaImports,
  generateRouterImport,
  generatetRPCProcedureImport,
  generatetRPCRouterImport,
} from './helpers';
import { project } from './project';
import removeDir from './utils/removeDir';

// Operations introduced in Prisma 5+ that require additional schema support not yet implemented
const UNSUPPORTED_OPERATIONS = new Set(['createManyAndReturn', 'updateManyAndReturn']);

export async function generate(options: GeneratorOptions) {
  const outputDir = parseEnvValue(options.generator.output as EnvValue);
  const results = configSchema.safeParse(options.generator.config);
  if (!results.success) throw new Error('Invalid options passed');
  const config = results.data;

  // contextPath is an upstream alias for trpcPath
  const resolvedTrpcPath = config.contextPath ?? config.trpcPath;

  await fs.mkdir(outputDir, { recursive: true });
  await removeDir(outputDir, true);

  options.generator.config['isGenerateSelect'] = 'true';
  options.generator.config['isGenerateInclude'] = 'true';
  // prisma-zod-generator requires languages; provide resolved value so it never crashes
  options.generator.config['languages'] = config.languages;

  // prisma-zod-generator bundles Prisma 4 internals which require a `url` in the datasource
  // block, but Prisma 7 forbids `url` in schema.prisma. Inject a dummy url only into the
  // datamodel copy that the zod generator uses — Prisma 7 has already validated the real schema.
  const datamodelForZod = options.datamodel.replace(
    /(datasource\s+\w+\s*\{)([^}]*?)(provider\s*=\s*[^\n]+)/,
    '$1$2$3\n  url      = "mysql://localhost/dummy"',
  );

  // prisma-zod-generator bundles Prisma 4's generator-helper types; cast to satisfy its stale signature
  await PrismaZodGenerator({ ...options, datamodel: datamodelForZod } as any);

  // Apply Prisma 7 compatibility patches to the generated schema files:
  //   • Rename ${Model}Args → ${Model}DefaultArgs (type + file + importers)
  //   • Fix filter in/notIn to array-only; add string unions for DateTime/Int/BigInt/Decimal
  //   • Add <never> generic to ZodType<Prisma.XxxFilter> annotations
  await fixGeneratedSchemas(outputDir);

  const dataSource = options.datasources?.[0];

  // GeneratorOptions includes the DMMF directly since Prisma 5
  const prismaClientDmmf = options.dmmf;

  const appRouter = project.createSourceFile(
    path.resolve(outputDir, 'routers', `index.ts`),
    undefined,
    { overwrite: true },
  );

  // hot fix for windows
  const trpcPath = resolvedTrpcPath.split(path.sep).join('/');

  generatetRPCRouterImport(appRouter, trpcPath);

  const routers: string[] = [];

  prismaClientDmmf.mappings.modelOperations.forEach((modelOperation) => {
    const { model, ...operations } = modelOperation;
    const plural = pluralize(model.toLowerCase());
    const hasCreateMany = Boolean(operations.createMany);
    generateRouterImport(appRouter, plural, model);
    const modelRouter = project.createSourceFile(
      path.resolve(outputDir, 'routers', `${model}Router`, `index.ts`),
      undefined,
      { overwrite: true },
    );

    generatetRPCRouterImport(modelRouter, path.join('..', trpcPath));

    generateProcedureImports(
      modelRouter,
      model,
      hasCreateMany,
      dataSource.provider,
    );

    const procedures: string[] = [];

    for (const [opType, opNameWithModel] of Object.entries(operations)) {
      if (opNameWithModel == null || UNSUPPORTED_OPERATIONS.has(opType)) continue;
      const modelProcedure = project.createSourceFile(
        path.resolve(
          outputDir,
          'routers',
          `${model}Router`,
          `${opNameWithModel}.procedure.ts`,
        ),
        undefined,
        { overwrite: true },
      );
      generatetRPCProcedureImport(modelProcedure, path.join('..', trpcPath));
      generateProcedureSchemaImports(modelProcedure, opType, model);
      generateProcedure(
        modelProcedure,
        opNameWithModel,
        model,
        opType,
        config.withMiddleware,
        config.withShield,
      );
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
  await project.save();
}
