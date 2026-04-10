/**
 * 迁移服务测试
 * 验证旧表向 v2 迁移时的幂等性与冲突跳过行为
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createMigrationService,
  MODEL_NAME,
  MODEL_NAME_V2,
  BLACKLIST_MODEL_NAME,
  BLACKLIST_MODEL_NAME_V2,
  USER_ALIAS_MODEL_NAME,
  USER_ALIAS_MODEL_NAME_V2,
  MIGRATION_MODEL_NAME,
} = require("../../../lib/index.js");

function cloneRow(row) {
  return { ...row };
}

function matchesQuery(row, query) {
  return Object.entries(query).every(([key, value]) => row[key] === value);
}

function getPrimaryKeys(model) {
  switch (model) {
    case MODEL_NAME:
      return ["userId"];
    case MODEL_NAME_V2:
      return ["scopeId", "userId"];
    case BLACKLIST_MODEL_NAME:
      return ["userId", "mode"];
    case BLACKLIST_MODEL_NAME_V2:
      return ["scopeId", "userId", "mode"];
    case USER_ALIAS_MODEL_NAME:
      return ["platform", "userId"];
    case USER_ALIAS_MODEL_NAME_V2:
      return ["scopeId", "userId"];
    case MIGRATION_MODEL_NAME:
      return ["scopeId", "version"];
    default:
      throw new Error(`unknown model: ${model}`);
  }
}

function createDatabase(initialTables = {}) {
  const tables = Object.fromEntries(
    Object.entries(initialTables).map(([model, rows]) => [
      model,
      rows.map(cloneRow),
    ]),
  );
  const calls = {
    get: [],
    upsert: [],
  };

  return {
    tables,
    calls,
    async get(model, query = {}) {
      calls.get.push({ model, query: cloneRow(query) });
      const rows = tables[model] || [];
      return rows.filter((row) => matchesQuery(row, query)).map(cloneRow);
    },
    async upsert(model, rows) {
      calls.upsert.push({
        model,
        rows: rows.map(cloneRow),
      });
      const current = tables[model] || [];
      const primaryKeys = getPrimaryKeys(model);
      for (const row of rows) {
        const next = cloneRow(row);
        const index = current.findIndex((item) =>
          primaryKeys.every((key) => item[key] === next[key]),
        );
        if (index >= 0) current[index] = next;
        else current.push(next);
      }
      tables[model] = current;
    },
  };
}

function createHarness({ scopeId = "default", tables = {} } = {}) {
  const database = createDatabase(tables);
  const logs = [];
  const migration = createMigrationService({
    ctx: { database },
    scopeId,
    log(level, message, detail) {
      logs.push({ level, message, detail });
    },
  });

  return {
    database,
    logs,
    migration,
    scopeId,
  };
}

test("createMigrationService 在 v2 已有 affinity 记录时只补缺失项", async () => {
  const existingScopeId = "default";
  const { migration, database, scopeId, logs } = createHarness({
    scopeId: existingScopeId,
    tables: {
      [MODEL_NAME]: [
        {
          userId: "1001",
          nickname: "旧用户A",
          affinity: 20,
          relation: "陌生",
          specialRelation: null,
          shortTermAffinity: 1,
          longTermAffinity: 20,
          chatCount: 2,
          actionStats: null,
          lastInteractionAt: null,
          coefficientState: null,
        },
        {
          userId: "1002",
          nickname: "旧用户B",
          affinity: 35,
          relation: "朋友",
          specialRelation: null,
          shortTermAffinity: 3,
          longTermAffinity: 35,
          chatCount: 4,
          actionStats: null,
          lastInteractionAt: null,
          coefficientState: null,
        },
      ],
      [MODEL_NAME_V2]: [
        {
          scopeId: existingScopeId,
          userId: "1001",
          nickname: "新用户A",
          affinity: 66,
          relation: "亲密",
          specialRelation: null,
          shortTermAffinity: 8,
          longTermAffinity: 66,
          chatCount: 7,
          actionStats: null,
          lastInteractionAt: null,
          coefficientState: null,
        },
      ],
    },
  });

  await migration.run();

  assert.deepEqual(database.tables[MODEL_NAME_V2], [
    {
      scopeId,
      userId: "1001",
      nickname: "新用户A",
      affinity: 66,
      relation: "亲密",
      specialRelation: null,
      shortTermAffinity: 8,
      longTermAffinity: 66,
      chatCount: 7,
      actionStats: null,
      lastInteractionAt: null,
      coefficientState: null,
    },
    {
      scopeId,
      userId: "1002",
      nickname: "旧用户B",
      affinity: 35,
      relation: "朋友",
      specialRelation: null,
      shortTermAffinity: 3,
      longTermAffinity: 35,
      chatCount: 4,
      actionStats: null,
      lastInteractionAt: null,
      coefficientState: null,
    },
  ]);
  assert.equal(database.tables[MIGRATION_MODEL_NAME].at(-1).status, "success");
  assert.equal(logs.at(-1).message, "迁移完成");
});

test("createMigrationService 在 v2 已有 blacklist 记录时按主键跳过已存在项", async () => {
  const existingScopeId = "default";
  const { migration, database, scopeId } = createHarness({
    scopeId: existingScopeId,
    tables: {
      [BLACKLIST_MODEL_NAME]: [
        {
          platform: "onebot",
          userId: "1001",
          mode: "temporary",
          blockedAt: new Date("2024-01-01T00:00:00.000Z"),
          expiresAt: null,
          nickname: "旧黑名单A",
          note: "legacy",
          durationHours: 24,
          penalty: 5,
        },
        {
          platform: "onebot",
          userId: "1002",
          mode: "permanent",
          blockedAt: new Date("2024-01-02T00:00:00.000Z"),
          expiresAt: null,
          nickname: "旧黑名单B",
          note: "legacy",
          durationHours: null,
          penalty: null,
        },
      ],
      [BLACKLIST_MODEL_NAME_V2]: [
        {
          scopeId: existingScopeId,
          platform: "onebot",
          userId: "1001",
          mode: "temporary",
          blockedAt: new Date("2024-02-01T00:00:00.000Z"),
          expiresAt: null,
          nickname: "新黑名单A",
          note: "runtime",
          durationHours: 12,
          penalty: 3,
        },
      ],
    },
  });

  await migration.run();

  assert.deepEqual(database.tables[BLACKLIST_MODEL_NAME_V2], [
    {
      scopeId,
      platform: "onebot",
      userId: "1001",
      mode: "temporary",
      blockedAt: new Date("2024-02-01T00:00:00.000Z"),
      expiresAt: null,
      nickname: "新黑名单A",
      note: "runtime",
      durationHours: 12,
      penalty: 3,
    },
    {
      scopeId,
      platform: "onebot",
      userId: "1002",
      mode: "permanent",
      blockedAt: new Date("2024-01-02T00:00:00.000Z"),
      expiresAt: null,
      nickname: "旧黑名单B",
      note: "legacy",
      durationHours: null,
      penalty: null,
    },
  ]);
});

test("createMigrationService 在 v2 已有 userAlias 记录时按 scopeId 与 userId 跳过已存在项", async () => {
  const existingScopeId = "default";
  const { migration, database, scopeId } = createHarness({
    scopeId: existingScopeId,
    tables: {
      [USER_ALIAS_MODEL_NAME]: [
        {
          platform: "onebot",
          userId: "1001",
          alias: "旧昵称A",
          updatedAt: new Date("2024-01-01T00:00:00.000Z"),
        },
        {
          platform: "onebot",
          userId: "1002",
          alias: "旧昵称B",
          updatedAt: new Date("2024-01-02T00:00:00.000Z"),
        },
      ],
      [USER_ALIAS_MODEL_NAME_V2]: [
        {
          scopeId: existingScopeId,
          platform: "onebot",
          userId: "1001",
          alias: "新昵称A",
          updatedAt: new Date("2024-02-01T00:00:00.000Z"),
        },
      ],
    },
  });

  await migration.run();

  assert.deepEqual(database.tables[USER_ALIAS_MODEL_NAME_V2], [
    {
      scopeId,
      platform: "onebot",
      userId: "1001",
      alias: "新昵称A",
      updatedAt: new Date("2024-02-01T00:00:00.000Z"),
    },
    {
      scopeId,
      platform: "onebot",
      userId: "1002",
      alias: "旧昵称B",
      updatedAt: new Date("2024-01-02T00:00:00.000Z"),
    },
  ]);
});

test("createMigrationService 在旧表有数据且 v2 为空时正常迁移全部记录", async () => {
  const { migration, database, scopeId, logs } = createHarness({
    tables: {
      [MODEL_NAME]: [
        {
          userId: "2001",
          nickname: "旧用户",
          affinity: 40,
          relation: "朋友",
          specialRelation: null,
          shortTermAffinity: 2,
          longTermAffinity: 40,
          chatCount: 5,
          actionStats: null,
          lastInteractionAt: null,
          coefficientState: null,
        },
      ],
      [BLACKLIST_MODEL_NAME]: [
        {
          platform: "onebot",
          userId: "2002",
          mode: "temporary",
          blockedAt: new Date("2024-01-03T00:00:00.000Z"),
          expiresAt: null,
          nickname: "旧黑名单",
          note: "legacy",
          durationHours: 6,
          penalty: 2,
        },
      ],
      [USER_ALIAS_MODEL_NAME]: [
        {
          platform: "onebot",
          userId: "2003",
          alias: "旧昵称",
          updatedAt: new Date("2024-01-04T00:00:00.000Z"),
        },
      ],
    },
  });

  await migration.run();

  assert.equal(database.tables[MODEL_NAME_V2][0].scopeId, scopeId);
  assert.equal(database.tables[BLACKLIST_MODEL_NAME_V2][0].scopeId, scopeId);
  assert.equal(database.tables[USER_ALIAS_MODEL_NAME_V2][0].scopeId, scopeId);
  assert.equal(database.tables[MIGRATION_MODEL_NAME].at(-1).status, "success");
  assert.deepEqual(logs.at(-1).detail, {
    scopeId,
    affinityCount: 1,
    blacklistCount: 1,
    aliasCount: 1,
  });
});

test("createMigrationService 在 failed 重试且 v2 已有部分数据时仍能成功补齐", async () => {
  const existingScopeId = "default";
  const { migration, database, scopeId } = createHarness({
    scopeId: existingScopeId,
    tables: {
      [MIGRATION_MODEL_NAME]: [
        {
          scopeId: existingScopeId,
          version: "v2",
          migratedAt: new Date("2024-01-01T00:00:00.000Z"),
          status: "failed",
        },
      ],
      [MODEL_NAME]: [
        {
          userId: "3001",
          nickname: "旧用户A",
          affinity: 18,
          relation: "陌生",
          specialRelation: null,
          shortTermAffinity: 1,
          longTermAffinity: 18,
          chatCount: 1,
          actionStats: null,
          lastInteractionAt: null,
          coefficientState: null,
        },
        {
          userId: "3002",
          nickname: "旧用户B",
          affinity: 28,
          relation: "朋友",
          specialRelation: null,
          shortTermAffinity: 2,
          longTermAffinity: 28,
          chatCount: 2,
          actionStats: null,
          lastInteractionAt: null,
          coefficientState: null,
        },
      ],
      [MODEL_NAME_V2]: [
        {
          scopeId: existingScopeId,
          userId: "3001",
          nickname: "新用户A",
          affinity: 80,
          relation: "亲密",
          specialRelation: null,
          shortTermAffinity: 9,
          longTermAffinity: 80,
          chatCount: 8,
          actionStats: null,
          lastInteractionAt: null,
          coefficientState: null,
        },
      ],
    },
  });

  await migration.run();

  assert.deepEqual(database.tables[MODEL_NAME_V2], [
    {
      scopeId,
      userId: "3001",
      nickname: "新用户A",
      affinity: 80,
      relation: "亲密",
      specialRelation: null,
      shortTermAffinity: 9,
      longTermAffinity: 80,
      chatCount: 8,
      actionStats: null,
      lastInteractionAt: null,
      coefficientState: null,
    },
    {
      scopeId,
      userId: "3002",
      nickname: "旧用户B",
      affinity: 28,
      relation: "朋友",
      specialRelation: null,
      shortTermAffinity: 2,
      longTermAffinity: 28,
      chatCount: 2,
      actionStats: null,
      lastInteractionAt: null,
      coefficientState: null,
    },
  ]);
  assert.equal(database.tables[MIGRATION_MODEL_NAME].at(-1).status, "success");
});
