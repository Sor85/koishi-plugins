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
    initialAffinity: 30,
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

test("createAffinityStore 默认初始值读取单值配置", () => {
  const { store } = createStore({
    initialAffinity: 37,
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

test("affinity 变量无记录时返回默认格式且不显示 nickname", async () => {
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
    async getUserAlias() {
      return null;
    },
  });

  const result = await provider(["宁宁"], null, {
    session: { platform: "onebot", userId: "1001", selfId: "2000" },
  });

  assert.equal(result, "id:1001 name:1001 affinity:30 relationship:朋友");
});

test("affinity 变量存在 nickname 时输出 nickname 字段", async () => {
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
    async getUserAlias(scopeId, platform, userId) {
      assert.equal(scopeId, "宁宁");
      assert.equal(platform, "onebot");
      assert.equal(userId, "1001");
      return "蒸汽机姐姐";
    },
  });

  const result = await provider(["宁宁"], null, {
    session: { platform: "onebot", userId: "1001", selfId: "2000" },
  });

  assert.equal(
    result,
    "id:1001 name:1001 nickname:蒸汽机姐姐 affinity:30 relationship:朋友",
  );
});

test("affinity 变量按数据库 scopeId 读取而不是按插件 scopeId 过滤", async () => {
  const { store } = createStore({ scopeId: "机器人A" });
  await store.save({ scopeId: "nene", platform: "onebot", userId: "1001" }, 66);

  const provider = createAffinityProvider({
    config: createConfig({ scopeId: "机器人A" }),
    cache: {
      get() {
        return null;
      },
      set() {},
      clear() {},
    },
    store,
    async getUserAlias() {
      return null;
    },
  });

  const result = await provider(["nene"], null, {
    session: { platform: "onebot", userId: "1001", selfId: "2000" },
  });

  assert.equal(result, "id:1001 name:1001 affinity:66 relationship:亲密");
});

test("recordInteraction 在已有记录时只增加互动次数并更新时间", async () => {
  const { store, database } = createStore();
  const before = new Date("2024-01-01T00:00:00.000Z");
  await store.save(
    { scopeId: "宁宁", platform: "onebot", userId: "1001" },
    66,
    "",
    {
      longTermAffinity: 66,
      shortTermAffinity: 5,
      chatCount: 2,
      lastInteractionAt: before,
    },
  );

  await store.recordInteraction({
    scopeId: "宁宁",
    platform: "onebot",
    userId: "1001",
    session: { userId: "1001", selfId: "2000", username: "用户A" },
  });

  const row = database.rows[0];
  assert.equal(row.affinity, 66);
  assert.equal(row.longTermAffinity, 66);
  assert.equal(row.shortTermAffinity, 5);
  assert.equal(row.chatCount, 3);
  assert.ok(row.lastInteractionAt instanceof Date);
  assert.notEqual(row.lastInteractionAt.getTime(), before.getTime());
});

test("affinity 变量多行输出在无记录时返回默认好感并按需带上 nickname", async () => {
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
    async getUserAlias(_scopeId, _platform, userId) {
      return userId === "1002" ? "小明同学" : null;
    },
  });

  const result = await provider(["宁宁"], null, {
    session: { platform: "onebot", userId: "1001", selfId: "2000" },
  });

  assert.equal(
    result,
    "id:1001 name:1001 affinity:30 relationship:朋友\nid:1002 name:小明 nickname:小明同学 affinity:30 relationship:朋友",
  );
});
