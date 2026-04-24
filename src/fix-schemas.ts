/**
 * Post-processing pass applied after prisma-zod-generator writes its files.
 *
 * prisma-zod-generator bundles Prisma 4 internals and therefore produces
 * schemas that are out-of-sync with Prisma 7 runtime types in two ways:
 *
 *   1. Plain model Args files are named `${Model}Args.schema.ts` and annotated
 *      `Prisma.${Model}Args`, but Prisma 7 renamed this to `${Model}DefaultArgs`.
 *
 *   2. Scalar filter types (DateTimeFilter, IntFilter, …) are generated from the
 *      Prisma 4 DMMF which:
 *        - allows a single scalar in `in`/`notIn` (Prisma 7: array-only)
 *        - omits `string` from unions on `equals`/`lt`/`lte`/`gt`/`gte`/`not`
 *          for DateTime, Int, BigInt, Decimal types
 *        - doesn't include the `<never>` explicit generic needed for
 *          `z.ZodType<Prisma.XxxFilter<never>>`
 */

import { promises as fs } from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a file; return null if it doesn't exist. */
async function tryRead(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf-8');
  } catch {
    return null;
  }
}

/** Write only if the content actually changed (avoids mtime churn). */
async function maybeWrite(p: string, content: string, original: string) {
  if (content !== original) {
    await fs.writeFile(p, content, 'utf-8');
  }
}

/** Recursively collect all *.schema.ts files under a directory. */
async function collectSchemaFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectSchemaFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.schema.ts')) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Fix 1 — Args → DefaultArgs
// ---------------------------------------------------------------------------

/**
 * Returns true for plain Args schemas (select/include only).
 * Operation Args (CreateArgs, FindUniqueArgs, …) are intentionally excluded
 * because Prisma 7 kept those names.
 */
function isPlainArgsFile(basename: string): boolean {
  // Must end in Args.schema.ts
  if (!basename.endsWith('Args.schema.ts')) return false;
  // Must NOT contain an operation verb before "Args"
  const name = basename.replace(/\.schema\.ts$/, '');
  return !/(?:Create|Update|Delete|Upsert|FindFirst|FindMany|FindUnique|Aggregate|GroupBy)Args$/.test(
    name,
  );
}

async function fixArgsSchemas(
  objectsDir: string,
  allFiles: string[],
): Promise<void> {
  // Collect plain Args files
  const argsFiles = allFiles.filter((f) =>
    isPlainArgsFile(path.basename(f)),
  );

  if (argsFiles.length === 0) return;

  // Map from old schema-name to new schema-name for importer patching
  const renames: Array<{ oldBase: string; newBase: string; oldConst: string; newConst: string }> =
    [];

  for (const oldPath of argsFiles) {
    const oldBase = path.basename(oldPath, '.schema.ts'); // e.g. "UserArgs"
    const newBase = oldBase.replace(/Args$/, 'DefaultArgs'); // "UserDefaultArgs"
    const oldConst = `${oldBase}ObjectSchema`;
    const newConst = `${newBase}ObjectSchema`;
    const newPath = path.join(path.dirname(oldPath), `${newBase}.schema.ts`);

    const content = await tryRead(oldPath);
    if (content === null) continue;

    const fixed = content
      // Type annotation: Prisma.UserArgs → Prisma.UserDefaultArgs
      .replace(
        new RegExp(`Prisma\\.${oldBase}(?=[^\\w])`, 'g'),
        `Prisma.${newBase}`,
      )
      // Exported const: UserArgsObjectSchema → UserDefaultArgsObjectSchema
      .replace(new RegExp(oldConst, 'g'), newConst);

    await fs.writeFile(newPath, fixed, 'utf-8');
    await fs.unlink(oldPath);
    renames.push({ oldBase, newBase, oldConst, newConst });
  }

  // Patch every other schema file that still imports the old name
  const remaining = await collectSchemaFiles(path.dirname(objectsDir));
  for (const file of remaining) {
    let content = await tryRead(file);
    if (content === null) continue;
    const original = content;

    for (const { oldBase, newBase, oldConst, newConst } of renames) {
      // Update import path (e.g. './UserArgs.schema' → './UserDefaultArgs.schema')
      content = content
        .replace(
          new RegExp(`(['"])(\\.\\./|\\./)?${oldBase}\\.schema\\1`, 'g'),
          `$1$2${newBase}.schema$1`,
        )
        // Update identifier anywhere in file
        .replace(new RegExp(oldConst, 'g'), newConst);
    }

    await maybeWrite(file, content, original);
  }
}

// ---------------------------------------------------------------------------
// Fix 2 & 3 — Filter field types
// ---------------------------------------------------------------------------

type FilterCategory =
  | 'datetime'
  | 'int_decimal'
  | 'float'
  | 'string'
  | 'bigint'
  | 'none';

function classifyFilter(schemaName: string): FilterCategory {
  if (!/Filter/.test(schemaName)) return 'none';
  // Order matters: BigInt before Int
  if (/DateTime/.test(schemaName)) return 'datetime';
  if (/BigInt/.test(schemaName)) return 'bigint';
  if (/Decimal/.test(schemaName)) return 'int_decimal';
  if (/Float/.test(schemaName)) return 'float';
  if (/Int/.test(schemaName)) return 'int_decimal';
  if (/String/.test(schemaName)) return 'string';
  return 'none';
}

/**
 * Fix `in`/`notIn` for a type that should be array-only with an added
 * string array branch (DateTime, Int, Decimal, BigInt).
 *
 * Before:  z.union([z.date().array(), z.date()]).optional()
 * After:   z.union([z.date().array(), z.string().array()]).optional()
 */
function fixInNotIn_withString(content: string, scalar: string): string {
  return content.replace(
    new RegExp(
      `z\\.union\\(\\[z\\.${scalar}\\(\\)\\.array\\(\\), z\\.${scalar}\\(\\)\\]\\)\\.optional\\(\\)`,
      'g',
    ),
    `z.union([z.${scalar}().array(), z.string().array()]).optional()`,
  );
}

/**
 * Fix `in`/`notIn` for Float and String: array-only, no extra branch.
 *
 * Before:  z.union([z.number().array(), z.number()]).optional()
 * After:   z.number().array().optional()
 */
function fixInNotIn_arrayOnly(content: string, scalar: string): string {
  return content.replace(
    new RegExp(
      `z\\.union\\(\\[z\\.${scalar}\\(\\)\\.array\\(\\), z\\.${scalar}\\(\\)\\]\\)\\.optional\\(\\)`,
      'g',
    ),
    `z.${scalar}().array().optional()`,
  );
}

/**
 * Fix scalar comparison fields (equals, lt, lte, gt, gte) by adding
 * z.string() to the union.
 *
 * Before:  equals: z.date().optional()
 * After:   equals: z.union([z.date(), z.string()]).optional()
 */
function fixScalarOps(content: string, scalar: string): string {
  return content.replace(
    new RegExp(`z\\.${scalar}\\(\\)\\.optional\\(\\)`, 'g'),
    `z.union([z.${scalar}(), z.string()]).optional()`,
  );
}

/**
 * Fix the `not` field union by inserting z.string() after the scalar branch.
 *
 * Handles both single-line and multi-line union formats emitted by ts-morph.
 *
 * The `not` field is always chained from `z`, so the union appears as
 * `.union([...])` (without a leading `z.`) in the generated file. Example:
 *
 *   not: z
 *     .union([z.date(), z.lazy(() => NestedDateTimeFilterObjectSchema)])
 *     .optional(),
 *
 * Multi-line format (WithAggregatesFilter):
 *   not: z
 *     .union([
 *       z.date(),
 *       z.lazy(() => NestedDateTimeWithAggregatesFilterObjectSchema),
 *     ])
 */
function fixNotField(content: string, scalar: string): string {
  // Single-line format: .union([z.scalar(), z.lazy(() =>
  // Note: no `z.` prefix before `.union` — it is a chained method call.
  content = content.replace(
    new RegExp(
      `\\.union\\(\\[z\\.${scalar}\\(\\), z\\.lazy\\(\\(\\) =>`,
      'g',
    ),
    `.union([z.${scalar}(), z.string(), z.lazy(() =>`,
  );

  // Multi-line format: insert z.string() as a new line between z.scalar() and z.lazy()
  // Capture groups: $1 = "\n<indent>z.scalar()," $2 = indent, $3 = lazy-indent, $4 = "z.lazy("
  content = content.replace(
    new RegExp(
      `(\n([ \\t]+)z\\.${scalar}\\(\\),)\n([ \\t]+)(z\\.lazy\\()`,
      'g',
    ),
    `$1\n$2z.string(),\n$3$4`,
  );

  return content;
}

/**
 * Fix the ZodType annotation to include the explicit <never> generic, which
 * is required now that all scalar filter types carry `<$PrismaModel = never>`.
 *
 * Before:  z.ZodType<Prisma.DateTimeFilter>
 * After:   z.ZodType<Prisma.DateTimeFilter<never>>
 */
function fixZodTypeGeneric(content: string): string {
  // Match any filter type that already ends with > but not one that already
  // has its own generic (i.e. no existing < before the closing >)
  return content.replace(
    /z\.ZodType<Prisma\.(\w+Filter\w*)>/g,
    (_, name) =>
      name.includes('<') ? `z.ZodType<Prisma.${name}>` : `z.ZodType<Prisma.${name}<never>>`,
  );
}

async function fixFilterSchema(filePath: string): Promise<void> {
  const schemaName = path.basename(filePath, '.schema.ts');
  const category = classifyFilter(schemaName);
  if (category === 'none') return;

  let content = await tryRead(filePath);
  if (content === null) return;
  const original = content;

  switch (category) {
    case 'datetime': {
      content = fixInNotIn_withString(content, 'date');
      content = fixScalarOps(content, 'date');
      content = fixNotField(content, 'date');
      break;
    }
    case 'int_decimal': {
      content = fixInNotIn_withString(content, 'number');
      content = fixScalarOps(content, 'number');
      content = fixNotField(content, 'number');
      break;
    }
    case 'float': {
      content = fixInNotIn_arrayOnly(content, 'number');
      // scalar ops (equals, lt …) are fine as-is for Float
      break;
    }
    case 'string': {
      content = fixInNotIn_arrayOnly(content, 'string');
      // scalar ops are fine as-is for String
      break;
    }
    case 'bigint': {
      content = fixInNotIn_withString(content, 'bigint');
      content = fixScalarOps(content, 'bigint');
      content = fixNotField(content, 'bigint');
      break;
    }
  }

  content = fixZodTypeGeneric(content);

  await maybeWrite(filePath, content, original);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function fixGeneratedSchemas(outputDir: string): Promise<void> {
  const objectsDir = path.join(outputDir, 'schemas', 'objects');

  const allObjectFiles = await collectSchemaFiles(objectsDir);

  // Fix 1: rename plain Args → DefaultArgs (also patches importers)
  await fixArgsSchemas(objectsDir, allObjectFiles);

  // Fix 2 & 3: filter field shapes + <never> generic
  // Re-collect after potential renames
  const refreshedFiles = await collectSchemaFiles(objectsDir);
  await Promise.all(refreshedFiles.map((f) => fixFilterSchema(f)));
}
