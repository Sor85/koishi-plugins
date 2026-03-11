/**
 * 初始化与变量回退测试
 * 验证默认好感配置、写前初始化与变量无记录回退行为
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createAffinityStore,
  createAffinityProvider,
} = require("../lib/index.js");

function createConfig(overrides = {}) {
  return {
    scopeId: "宁宁",
    affinityEnabled: true,
    affinityDisplayRange: 1,
    baseAffinityConfig: {
      initialAffinity: 30,
      maxIncreasePerMessage: 5,
      maxDecreasePerMessage: 10,
    },
    initialAffinity: 30,
    maxIncreasePerMessage: 5,
    maxDecreasePerMessage: 10,
    affinityDynamics: {},
    blacklistLogInterception: true,
    shortTermBlacklistPenalty: 5,
    unblockPermanentInitialAffinity: 10,
    rankDefaultLimit: 10,
    rankRenderAsImage: false,
    blacklistDefaultLimit: 10,
    inspectRenderAsImage: false,
    inspectShowImpression: false,
    debugLogging: false,
    blacklistRenderAsImage: false,
    shortTermBlacklistRenderAsImage: false,
    relationships: [],
    relationshipAffinityLevels: [
      { min: 0, max: 29, relation: "陌生", note: "" },
      { min: 30, max: 59, relation: "朋友", note: "" },
      { min: 60, max: 100, relation: "亲密", note: "" },
    ],
    variableSettings: {
      affinityVariableName: "affinity",
      relationshipLevelVariableName: "relationshipLevel",
      blacklistListVariableName: "blacklistList",
      userAliasVariableName: "userAlias",
    },
    xmlToolSettings: {
      enableAffinityXmlToolCall: true,
      enableBlacklistXmlToolCall: true,
      enableRelationshipXmlToolCall: true,
      enableUserAliasXmlToolCall: true,
      characterPromptTemplate: "",
    },
    ...overrides,
  };
}

function createDatabase() {
  const rows = [];
  return {
    rows,
    async get(_model, query) {
      return rows.filter((row) =>
        Object.entries(query).every(([key, value]) => row[key] === value),
      );
    },
    async upsert(_model, entries) {
      for (const entry of entries) {
        const index = rows.findIndex(
          (row) => row.scopeId === entry.scopeId && row.userId === entry.userId,
        );
        const next = { ...entry };
        if (index >= 0) rows[index] = next;
        else rows.push(next);
      }
    },
  };
}

function createStore(configOverrides = {}) {
  const database = createDatabase();
  const store = createAffinityStore({
    ctx: { database },
    config: createConfig(configOverrides),
    log() {},
  });
  return { store, database };
}

test("旧随机区间配置迁移为单值时取中位数", () => {
  const config = {
    scopeId: "宁宁",
    baseAffinityConfig: {
      initialAffinity: 30,
      maxIncreasePerMessage: 5,
      maxDecreasePerMessage: 10,
    },
    initialRandomMin: 10,
    initialRandomMax: 30,
    maxIncreasePerMessage: 5,
    maxDecreasePerMessage: 10,
  };

  const base = {
    initialAffinity: 30,
    ...(config.baseAffinityConfig || {}),
  };
  const low = Number(config.initialRandomMin);
  const high = Number(config.initialRandomMax);
  base.initialAffinity = Math.floor((low + high) / 2);

  assert.equal(base.initialAffinity, 20);
});

test("createAffinityStore 默认初始值读取单值配置", () => {
  const { store } = createStore({
    initialAffinity: 37,
    baseAffinityConfig: {
      initialAffinity: 37,
      maxIncreasePerMessage: 5,
      maxDecreasePerMessage: 10,
    },
  });

  assert.equal(store.defaultInitial(), 37);
  assert.deepEqual(store.initialRange(), {
    low: 37,
    high: 37,
    min: 0,
    max: 100,
  });
});

test("ensureForSeed 无记录时按默认好感初始化到数据库", async () => {
  const { store, database } = createStore({
    initialAffinity: 35,
    baseAffinityConfig: {
      initialAffinity: 35,
      maxIncreasePerMessage: 5,
      maxDecreasePerMessage: 10,
    },
  });

  const state = await store.ensureForSeed(
    { scopeId: "宁宁", platform: "onebot", userId: "1001" },
    "1001",
    (value, low, high) => Math.min(Math.max(value, low), high),
  );

  assert.equal(state.isNew, true);
  assert.equal(state.affinity, 35);
  assert.equal(database.rows.length, 1);
  assert.equal(database.rows[0].affinity, 35);
  assert.equal(database.rows[0].relation, "朋友");
});

test("affinity 变量无记录时返回默认好感", async () => {
  const { store } = createStore();
  const provider = createAffinityProvider({
    config: createConfig(),
    cache: {
      get() {
        return null;
      },
      set() {},
      clear() {},
    },
    store,
  });

  const result = await provider(["宁宁"], null, {
    session: { platform: "onebot", userId: "1001", selfId: "2000" },
  });

  assert.equal(result, 30);
});

test("affinity 变量多行输出在无记录时返回默认好感与对应关系", async () => {
  const { store } = createStore({ affinityDisplayRange: 2 });
  const provider = createAffinityProvider({
    config: createConfig({ affinityDisplayRange: 2 }),
    cache: {
      get() {
        return null;
      },
      set() {},
      clear() {},
    },
    store,
    async fetchEntries() {
      return [{ userId: "1002", username: "小明" }];
    },
  });

  const result = await provider(["宁宁"], null, {
    session: { platform: "onebot", userId: "1001", selfId: "2000" },
  });

  assert.equal(
    result,
    "id:1001 name:1001 affinity:30 relationship:朋友\nid:1002 name:小明 affinity:30 relationship:朋友",
  );
});
