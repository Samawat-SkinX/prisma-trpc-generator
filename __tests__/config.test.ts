import { configSchema } from '../src/config';

describe('configSchema', () => {
  it('applies defaults when no options provided', () => {
    const result = configSchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.trpcPath).toBe('../../../../src/trpc');
    expect(result.data.languages).toBe('en');
    expect(result.data.withMiddleware).toBeUndefined();
    expect(result.data.withShield).toBeUndefined();
    expect(result.data.contextPath).toBeUndefined();
  });

  it('accepts multi-language string', () => {
    const result = configSchema.safeParse({ languages: 'en,th' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.languages).toBe('en,th');
  });

  it('accepts contextPath as alias for trpcPath', () => {
    const result = configSchema.safeParse({ contextPath: '../../trpc' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.contextPath).toBe('../../trpc');
  });

  it('accepts withMiddleware and withShield paths', () => {
    const result = configSchema.safeParse({
      withMiddleware: '../../src/middleware',
      withShield: '../../src/shield',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.withMiddleware).toBe('../../src/middleware');
    expect(result.data.withShield).toBe('../../src/shield');
  });
});
