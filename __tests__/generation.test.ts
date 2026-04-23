import { execSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const GENERATED = path.join(ROOT, 'prisma', 'generated', 'routers');

describe('end-to-end generation (prisma generate)', () => {
  beforeAll(() => {
    // Build then generate; ignore the prisma-client wasm error (unrelated)
    try {
      execSync('npx tsc && npx prisma generate', { cwd: ROOT, stdio: 'pipe' });
    } catch (e: any) {
      // prisma-client generator fails due to missing wasm in dev env; our
      // generator still runs and we care only about its output
      if (!existsSync(GENERATED)) throw e;
    }
  }, 60_000);

  it('generates routers/ directory', () => {
    expect(existsSync(GENERATED)).toBe(true);
  });

  it('generates appRouter index', () => {
    expect(existsSync(path.join(GENERATED, 'index.ts'))).toBe(true);
  });

  it('generates a router directory per model', () => {
    const entries = readdirSync(GENERATED);
    expect(entries).toContain('UserRouter');
    expect(entries).toContain('PostRouter');
  });

  it('generates expected User procedure files', () => {
    const userDir = path.join(GENERATED, 'UserRouter');
    const files = readdirSync(userDir);
    const required = [
      'findUniqueUser.procedure.ts',
      'findManyUser.procedure.ts',
      'createOneUser.procedure.ts',
      'updateOneUser.procedure.ts',
      'deleteOneUser.procedure.ts',
      'upsertOneUser.procedure.ts',
      'aggregateUser.procedure.ts',
      'groupByUser.procedure.ts',
      'index.ts',
    ];
    required.forEach((f) => expect(files).toContain(f));
  });

  it('generates schemas/ directory alongside routers', () => {
    const schemasDir = path.join(ROOT, 'prisma', 'generated', 'schemas');
    expect(existsSync(schemasDir)).toBe(true);
  });

  it('generated createOneUser procedure references correct schema', () => {
    const { readFileSync } = require('fs');
    const content = readFileSync(
      path.join(GENERATED, 'UserRouter', 'createOneUser.procedure.ts'),
      'utf8',
    );
    expect(content).toContain('UserCreateOneSchema');
    expect(content).toContain('ctx.prisma.user.create(');
  });

  it('generated updateOneUser procedure references correct schema', () => {
    const { readFileSync } = require('fs');
    const content = readFileSync(
      path.join(GENERATED, 'UserRouter', 'updateOneUser.procedure.ts'),
      'utf8',
    );
    expect(content).toContain('UserUpdateOneSchema');
    expect(content).toContain('ctx.prisma.user.update(');
  });
});
