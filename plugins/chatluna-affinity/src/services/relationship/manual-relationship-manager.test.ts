/**
 * 手动关系配置管理测试
 * 验证运行时关系更新不会触发配置回写递归，并覆盖同步数据库行为
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { createManualRelationshipManager } = require("../../../lib/index.js");

function createHarness(overrides = {}) {
  const calls = {
    get: [],
    upsert: [],
    log: [],
    applyConfigUpdate: [],
  };
  const config = {
    scopeId: "宁宁",
    relationships: [],
    ...overrides.config,
  };
  const ctx = {
    database: {
      async get(model, query) {
        calls.get.push({ model, query });
        if (typeof overrides.get === "function") {
          return overrides.get(model, query);
        }
        return [];
      },
      async upsert(model, rows) {
        calls.upsert.push({ model, rows });
        if (typeof overrides.upsert === "function") {
          return overrides.upsert(model, rows);
        }
      },
    },
  };

  const manager = createManualRelationshipManager({
    ctx,
    config,
    log(level, message, detail) {
      calls.log.push({ level, message, detail });
    },
    applyConfigUpdate() {
      calls.applyConfigUpdate.push(true);
      throw new Error("不应触发 scope.update");
    },
  });

  return { manager, config, calls };
}

test("createManualRelationshipManager update 在运行时更新关系且不触发配置回写", () => {
  const { manager, config, calls } = createHarness({
    config: {
      relationships: [{ userId: "1001", relation: "朋友", note: "旧备注" }],
    },
  });

  manager.update("1001", "恋人");

  assert.deepEqual(config.relationships, [
    { userId: "1001", relation: "恋人", note: "旧备注" },
  ]);
  assert.equal(calls.applyConfigUpdate.length, 0);
});

test("createManualRelationshipManager update 为新用户追加关系且不触发配置回写", () => {
  const { manager, config, calls } = createHarness();

  manager.update("1002", "朋友");

  assert.deepEqual(config.relationships, [{ userId: "1002", relation: "朋友" }]);
  assert.equal(calls.applyConfigUpdate.length, 0);
});

test("createManualRelationshipManager remove 删除关系并清理数据库 specialRelation", async () => {
  const existing = {
    scopeId: "宁宁",
    userId: "1001",
    specialRelation: "朋友",
    affinity: 10,
  };
  const { manager, config, calls } = createHarness({
    config: {
      relationships: [{ userId: "1001", relation: "朋友" }],
    },
    get() {
      return [existing];
    },
  });

  const result = await manager.remove("1001");

  assert.equal(result, true);
  assert.deepEqual(config.relationships, []);
  assert.equal(calls.applyConfigUpdate.length, 0);
  assert.equal(calls.get.length, 1);
  assert.equal(calls.upsert.length, 1);
  assert.deepEqual(calls.upsert[0].rows, [
    { ...existing, specialRelation: null },
  ]);
});

test("createManualRelationshipManager remove 在数据库异常时记录 warn 且不抛出", async () => {
  const failure = new Error("db boom");
  const { manager, config, calls } = createHarness({
    config: {
      relationships: [{ userId: "1001", relation: "朋友" }],
    },
    get() {
      throw failure;
    },
  });

  const result = await manager.remove("1001");

  assert.equal(result, true);
  assert.deepEqual(config.relationships, []);
  assert.equal(calls.applyConfigUpdate.length, 0);
  assert.equal(calls.log.length, 1);
  assert.deepEqual(calls.log[0], {
    level: "warn",
    message: "同步删除关系到数据库失败",
    detail: failure,
  });
});

test("createManualRelationshipManager syncToDatabase 只同步差异关系", async () => {
  const records = [
    {
      scopeId: "宁宁",
      userId: "1001",
      specialRelation: "陌生",
      affinity: 5,
    },
    {
      scopeId: "宁宁",
      userId: "1002",
      specialRelation: "朋友",
      affinity: 8,
    },
  ];
  const { manager, calls } = createHarness({
    config: {
      relationships: [
        { userId: "1001", relation: "恋人" },
        { userId: "1002", relation: "朋友" },
      ],
    },
    get() {
      return records;
    },
  });

  await manager.syncToDatabase();

  assert.equal(calls.get.length, 1);
  assert.deepEqual(calls.get[0].query, {
    scopeId: "宁宁",
    userId: { $in: ["1001", "1002"] },
  });
  assert.equal(calls.upsert.length, 1);
  assert.deepEqual(calls.upsert[0].rows, [
    { ...records[0], specialRelation: "恋人" },
  ]);
  assert.deepEqual(calls.log[0], {
    level: "info",
    message: "已同步特殊关系配置到数据库",
    detail: { count: 1 },
  });
});
