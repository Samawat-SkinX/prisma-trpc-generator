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
export declare function fixGeneratedSchemas(outputDir: string): Promise<void>;
