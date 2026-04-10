/**
 * 模型响应处理器测试
 * 验证 XML 解析后的副作用分发、隔离与错误兜底行为
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { createModelResponseProcessor } = require("../../../lib/index.js");

function createSession(overrides = {}) {
  return {
    userId: "1001",
    selfId: "bot-a",
    platform: "onebot",
    guildId: "2001",
    username: "会话用户名",
    bot: {
      internal: {
        async getGroupMemberInfo() {
          return { card: "群名片昵称", nickname: "群昵称" };
        },
      },
    },
    ...overrides,
  };
}

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
    relationshipAffinityLevels: [],
    variableSettings: {
      affinityVariableName: "affinity",
      relationshipLevelVariableName: "relationshipLevel",
      blacklistListVariableName: "blacklistList",
    },
    botSelfIds: [],
    xmlToolSettings: {
      injectXmlToolAsReplyTool: false,
      enableAffinityXmlToolCall: true,
      enableBlacklistXmlToolCall: true,
      enableRelationshipXmlToolCall: true,
      enableUserAliasXmlToolCall: true,
      characterPromptTemplate: "",
    },
    ...overrides,
  };
}

function createProcessorHarness(overrides = {}) {
  const calls = {
    ensureForSeed: [],
    recordInteraction: [],
    save: [],
    load: [],
    clear: [],
    removeTemporary: [],
    recordPermanent: [],
    recordTemporary: [],
    unblockPermanent: [],
    setAlias: [],
    resolveLevelByAffinity: [],
    log: [],
  };

  const state = {
    loadResult: overrides.loadResult,
    recordTemporaryResult:
      overrides.recordTemporaryResult === undefined
        ? { id: 1 }
        : overrides.recordTemporaryResult,
    saveImpl: overrides.saveImpl,
  };

  const log = (level, message, detail) => {
    calls.log.push({ level, message, detail });
  };

  const store = {
    async ensureForSeed(seed, userId, clampFn) {
      calls.ensureForSeed.push({ seed, userId, clampFn });
      return {
        longTermAffinity: 30,
        shortTermAffinity: 0,
        chatCount: 0,
        actionStats: {
          total: 0,
          counts: { increase: 0, decrease: 0 },
          entries: [],
        },
        coefficientState: { coefficient: 1 },
      };
    },
    async recordInteraction(seed, userId) {
      calls.recordInteraction.push({ seed, userId });
      return { ok: true };
    },
    async save(seed, value, relation, extra) {
      calls.save.push({ seed, value, relation, extra });
      if (typeof state.saveImpl === "function") {
        return state.saveImpl(seed, value, relation, extra);
      }
      return { ok: true };
    },
    clamp(value) {
      return Math.max(0, Math.min(100, Number(value)));
    },
    async load(scopeId, userId) {
      calls.load.push({ scopeId, userId });
      return state.loadResult ?? null;
    },
  };

  const processor = createModelResponseProcessor({
    config: createConfig(overrides.config),
    cache: {
      clear(scopeId, userId) {
        calls.clear.push({ scopeId, userId });
      },
    },
    store,
    blacklist: {
      async removeTemporary(platform, userId) {
        calls.removeTemporary.push({ platform, userId });
        return { ok: true };
      },
      async recordPermanent(platform, userId, detail) {
        calls.recordPermanent.push({ platform, userId, detail });
        return { ok: true };
      },
      async recordTemporary(platform, userId, durationHours, penalty, detail) {
        calls.recordTemporary.push({
          platform,
          userId,
          durationHours,
          penalty,
          detail,
        });
        return state.recordTemporaryResult;
      },
    },
    unblockPermanent: async (params) => {
      calls.unblockPermanent.push(params);
      return { ok: true };
    },
    userAlias: {
      async setAlias(platform, userId, alias) {
        calls.setAlias.push({ platform, userId, alias });
        return { ok: true };
      },
    },
    levelResolver: {
      resolveLevelByAffinity(affinity) {
        calls.resolveLevelByAffinity.push(affinity);
        return { relation: affinity >= 60 ? "亲密" : "朋友" };
      },
    },
    shortTermConfig: {
      promoteThreshold: 10,
      demoteThreshold: -10,
      longTermPromoteStep: 1,
      longTermDemoteStep: 1,
    },
    actionWindowConfig: {
      maxEntries: 20,
    },
    shouldExecuteXmlActions: overrides.shouldExecuteXmlActions,
    log,
  });

  return { processor, calls };
}

test("createModelResponseProcessor 在命中 selfId 且有有效回复时先执行首次初始化并写入 nickname", async () => {
  const { processor, calls } = createProcessorHarness({
    config: {
      botSelfIds: ["bot-a"],
    },
  });
  const session = createSession();

  await processor({
    response: "普通回复文本",
    session,
  });

  assert.equal(calls.ensureForSeed.length, 1);
  assert.equal(calls.ensureForSeed[0].seed.scopeId, "宁宁");
  assert.equal(calls.ensureForSeed[0].seed.platform, "onebot");
  assert.equal(calls.ensureForSeed[0].seed.userId, "1001");
  assert.equal(calls.ensureForSeed[0].seed.nickname, "群名片昵称");
  assert.equal(calls.ensureForSeed[0].seed.session, session);
  assert.equal(calls.save.length, 0);
  assert.equal(calls.clear.length, 0);
});

test("createModelResponseProcessor 在 selfId 不命中时不执行首次初始化", async () => {
  const { processor, calls } = createProcessorHarness({
    config: {
      botSelfIds: ["bot-b"],
    },
  });

  await processor({
    response: "普通回复文本",
    session: createSession({ selfId: "bot-a" }),
  });

  assert.equal(calls.ensureForSeed.length, 0);
});

test("createModelResponseProcessor 在已有记录时不重复首次初始化", async () => {
  const { processor, calls } = createProcessorHarness({
    config: {
      botSelfIds: ["bot-a"],
    },
    loadResult: {
      affinity: 30,
      longTermAffinity: 30,
      nickname: "已有昵称",
      specialRelation: null,
    },
  });

  await processor({
    response: "普通回复文本",
    session: createSession(),
  });

  assert.equal(calls.ensureForSeed.length, 0);
  assert.equal(calls.load.length, 1);
  assert.deepEqual(calls.load[0], { scopeId: "宁宁", userId: "1001" });
});

test("createModelResponseProcessor 在有效回复时记录一次真实互动", async () => {
  const { processor, calls } = createProcessorHarness({
    config: {
      botSelfIds: ["bot-a"],
    },
  });
  const session = createSession();

  await processor({
    response: "普通回复文本",
    session,
  });

  assert.equal(calls.recordInteraction.length, 1);
  assert.deepEqual(calls.recordInteraction[0], {
    seed: {
      scopeId: "宁宁",
      platform: "onebot",
      userId: "1001",
      session,
    },
    userId: "1001",
  });
});

test("createModelResponseProcessor 在单条回复含多个 XML 时只记录一次真实互动", async () => {
  const { processor, calls } = createProcessorHarness({
    config: {
      botSelfIds: ["bot-a"],
    },
  });
  const session = createSession();

  await processor({
    response:
      '<affinity scopeId="宁宁" userId="1001" action="increase" delta="2" /><relationship scopeId="宁宁" userId="1001" action="set" relation="朋友" />',
    session,
  });

  assert.equal(calls.recordInteraction.length, 1);
});

test("createModelResponseProcessor 在 userId 等于 selfId 时不记录互动", async () => {
  const { processor, calls } = createProcessorHarness({
    config: {
      botSelfIds: ["bot-a"],
    },
  });

  await processor({
    response: "普通回复文本",
    session: createSession({ userId: "bot-a" }),
  });

  assert.equal(calls.ensureForSeed.length, 0);
  assert.equal(calls.recordInteraction.length, 0);
});

test("createModelResponseProcessor 处理合法 affinity increase 并清理缓存", async () => {
  const { processor, calls } = createProcessorHarness();

  await processor({
    response:
      '<affinity scopeId="宁宁" userId="1001" action="increase" delta="2" />',
    session: null,
  });

  assert.equal(calls.ensureForSeed.length, 1);
  assert.equal(calls.save.length, 1);
  assert.deepEqual(calls.save[0].seed, {
    scopeId: "宁宁",
    platform: "onebot",
    userId: "1001",
  });
  assert.equal(calls.clear.length, 1);
  assert.deepEqual(calls.clear[0], { scopeId: "宁宁", userId: "1001" });
});

test("createModelResponseProcessor 忽略 affinity set XML", async () => {
  const { processor, calls } = createProcessorHarness();

  await processor({
    response:
      '<affinity scopeId="宁宁" userId="1001" action="set" value="66" />',
    session: null,
  });

  assert.equal(calls.ensureForSeed.length, 0);
  assert.equal(calls.save.length, 0);
  assert.equal(calls.clear.length, 0);
});

test("createModelResponseProcessor 忽略 scopeId 不匹配的 affinity XML", async () => {
  const { processor, calls } = createProcessorHarness();

  await processor({
    response:
      '<affinity scopeId="别的实例" userId="1001" action="increase" delta="2" />',
    session: null,
  });

  assert.equal(calls.ensureForSeed.length, 0);
  assert.equal(calls.save.length, 0);
  assert.equal(calls.clear.length, 0);
});

test("createModelResponseProcessor 忽略非法 delta 的 affinity XML", async () => {
  const { processor, calls } = createProcessorHarness();

  await processor({
    response:
      '<affinity scopeId="宁宁" userId="1001" action="increase" delta="0" />',
    session: null,
  });

  assert.equal(calls.ensureForSeed.length, 0);
  assert.equal(calls.save.length, 0);
  assert.equal(calls.clear.length, 0);
});

test("createModelResponseProcessor 处理临时黑名单并按惩罚扣减 affinity", async () => {
  const { processor, calls } = createProcessorHarness({
    loadResult: {
      affinity: 50,
      longTermAffinity: 40,
      nickname: "小明",
      specialRelation: "朋友",
    },
  });

  await processor({
    response:
      '<blacklist scopeId="宁宁" userId="1001" action="add" mode="temporary" durationHours="12" note="xml" />',
    session: null,
  });

  assert.equal(calls.recordTemporary.length, 1);
  assert.deepEqual(calls.recordTemporary[0], {
    platform: "onebot",
    userId: "1001",
    durationHours: 12,
    penalty: 5,
    detail: { note: "xml", nickname: "小明" },
  });
  assert.equal(calls.save.length, 1);
  assert.equal(calls.save[0].value, 35);
  assert.equal(calls.save[0].relation, "朋友");
  assert.equal(calls.clear.length, 1);
});

test("createModelResponseProcessor 处理永久黑名单移除", async () => {
  const { processor, calls } = createProcessorHarness();

  await processor({
    response:
      '<blacklist scopeId="宁宁" userId="1001" action="remove" mode="permanent" />',
    session: null,
  });

  assert.equal(calls.unblockPermanent.length, 1);
  assert.deepEqual(calls.unblockPermanent[0], {
    source: "xml",
    platform: "onebot",
    userId: "1001",
    seed: { scopeId: "宁宁", platform: "onebot", userId: "1001" },
  });
  assert.equal(calls.clear.length, 0);
});

test("createModelResponseProcessor 处理 userAlias 与 relationship 混合 XML", async () => {
  const { processor, calls } = createProcessorHarness();

  await processor({
    response:
      '<userAlias scopeId="宁宁" userId="1001" name="小明同学" /><relationship scopeId="宁宁" userId="1001" action="set" relation="朋友" />',
    session: null,
  });

  assert.equal(calls.setAlias.length, 1);
  assert.deepEqual(calls.setAlias[0], {
    platform: "onebot",
    userId: "1001",
    alias: "小明同学",
  });
  assert.equal(calls.save.length, 1);
  assert.ok(Number.isNaN(calls.save[0].value));
  assert.equal(calls.save[0].relation, "朋友");
  assert.equal(calls.clear.length, 1);
});

test("createModelResponseProcessor 在 shouldExecuteXmlActions=false 时跳过 XML 动作但保留互动记录", async () => {
  const { processor, calls } = createProcessorHarness({
    shouldExecuteXmlActions: () => false,
    config: {
      botSelfIds: ["bot-a"],
    },
  });
  const session = createSession();

  await processor({
    response:
      '<affinity scopeId="宁宁" userId="1001" action="increase" delta="2" /><blacklist scopeId="宁宁" userId="1001" action="add" mode="temporary" durationHours="12" note="xml" /><userAlias scopeId="宁宁" userId="1001" name="小明同学" /><relationship scopeId="宁宁" userId="1001" action="set" relation="朋友" />',
    session,
  });

  assert.equal(calls.ensureForSeed.length, 1);
  assert.equal(calls.recordInteraction.length, 1);
  assert.equal(calls.save.length, 0);
  assert.equal(calls.recordTemporary.length, 0);
  assert.equal(calls.recordPermanent.length, 0);
  assert.equal(calls.removeTemporary.length, 0);
  assert.equal(calls.unblockPermanent.length, 0);
  assert.equal(calls.setAlias.length, 0);
  assert.equal(calls.clear.length, 0);
});


test("createModelResponseProcessor 在依赖抛错时记录 warn", async () => {
  const { processor, calls } = createProcessorHarness({
    saveImpl() {
      throw new Error("save failed");
    },
  });

  await processor({
    response:
      '<relationship scopeId="宁宁" userId="1001" action="set" relation="朋友" />',
    session: null,
  });

  assert.equal(calls.log.length, 1);
  assert.equal(calls.log[0].level, "warn");
  assert.equal(calls.log[0].message, "处理模型输出事件失败");
  assert.equal(calls.log[0].detail.scopeId, "宁宁");
  assert.equal(calls.log[0].detail.error.message, "save failed");
});
