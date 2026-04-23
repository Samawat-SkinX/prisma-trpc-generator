import {
  getInputTypeByOpName,
  getProcedureTypeByOpName,
} from '../src/helpers';

describe('getInputTypeByOpName', () => {
  const model = 'User';

  const cases: [string, string][] = [
    ['findUnique', 'UserFindUniqueSchema'],
    ['findUniqueOrThrow', 'UserFindUniqueSchema'],
    ['findFirst', 'UserFindFirstSchema'],
    ['findFirstOrThrow', 'UserFindFirstSchema'],
    ['findMany', 'UserFindManySchema'],
    ['createOne', 'UserCreateOneSchema'],
    ['createMany', 'UserCreateManySchema'],
    ['deleteOne', 'UserDeleteOneSchema'],
    ['updateOne', 'UserUpdateOneSchema'],
    ['deleteMany', 'UserDeleteManySchema'],
    ['updateMany', 'UserUpdateManySchema'],
    ['upsertOne', 'UserUpsertSchema'],
    ['aggregate', 'UserAggregateSchema'],
    ['groupBy', 'UserGroupBySchema'],
    ['findRaw', 'UserFindRawObjectSchema'],
    ['aggregateRaw', 'UserAggregateRawObjectSchema'],
  ];

  test.each(cases)('%s → %s', (opName, expected) => {
    expect(getInputTypeByOpName(opName, model)).toBe(expected);
  });
});

describe('getProcedureTypeByOpName', () => {
  const queries = [
    'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow',
    'findMany', 'findRaw', 'aggregate', 'aggregateRaw', 'groupBy',
  ];
  const mutations = [
    'createOne', 'createMany', 'deleteOne', 'updateOne',
    'deleteMany', 'updateMany', 'upsertOne',
  ];

  test.each(queries)('%s → query', (op) => {
    expect(getProcedureTypeByOpName(op)).toBe('query');
  });

  test.each(mutations)('%s → mutation', (op) => {
    expect(getProcedureTypeByOpName(op)).toBe('mutation');
  });
});
