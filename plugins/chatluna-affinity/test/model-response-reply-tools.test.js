/**
 * 回复参数工具注册测试
 * 覆盖开关判断、字段注册与 invoke/render 行为
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  hasReplyToolsEnabled,
  registerCharacterReplyTools,
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

function createDeps(overrides = {}) {
  const calls = {
    fields: [],
    save: [],
    clear: [],
    removeTemporary: [],
    recordPermanent: [],
    recordTemporary: [],
    unblockPermanent: [],
    setAlias: [],
    load: [],
    ensureForSeed: [],
  };

  const registerReplyToolField = (field) => {
    calls.fields.push(field);
    return () => {};
  };

  const deps = {
    ctx: {
      chatluna_character: {
        registerReplyToolField,
      },
    },
    config: createConfig({
      xmlToolSettings: {
        ...createConfig().xmlToolSettings,
        injectXmlToolAsReplyTool: true,
      },
    }),
    cache: {
      clear(scopeId, userId) {
        calls.clear.push({ scopeId, userId });
      },
    },
    store: {
      async ensureForSeed(seed, userId) {
        calls.ensureForSeed.push({ seed, userId });
        return { longTermAffinity: 30, shortTermAffinity: 0 };
      },
      async recordInteraction() {
        return { ok: true };
      },
      async save(seed, value, relation) {
        calls.save.push({ seed, value, relation });
        return { ok: true };
      },
      clamp(value) {
        return Math.max(0, Math.min(100, Number(value)));
      },
      async load(scopeId, userId) {
        calls.load.push({ scopeId, userId });
        return {
          affinity: 40,
          longTermAffinity: 40,
          nickname: "小明",
          specialRelation: "朋友",
        };
      },
    },
    blacklist: {
      async removeTemporary(platform, userId) {
        calls.removeTemporary.push({ platform, userId });
        return true;
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
        return { ok: true };
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
    shortTermConfig: {
      promoteThreshold: 10,
      demoteThreshold: -10,
      longTermPromoteStep: 1,
      longTermDemoteStep: 1,
    },
    actionWindowConfig: {
      maxEntries: 20,
    },
    coefficientConfig: {
      base: 1,
      maxDrop: 0.3,
      maxBoost: 0.5,
      decayPerDay: 0.03,
      boostPerDay: 0.03,
      min: 0.7,
      max: 1.5,
    },
    log: () => {},
    ...overrides,
  };

  return { deps, calls };
}

test("hasReplyToolsEnabled 仅在开关开启且至少一个 XML 工具开启时返回 true", () => {
  const off = createConfig();
  assert.equal(hasReplyToolsEnabled(off), false);

  const on = createConfig({
    xmlToolSettings: {
      ...off.xmlToolSettings,
      injectXmlToolAsReplyTool: true,
      enableAffinityXmlToolCall: true,
      enableBlacklistXmlToolCall: false,
      enableRelationshipXmlToolCall: false,
      enableUserAliasXmlToolCall: false,
    },
  });
  assert.equal(hasReplyToolsEnabled(on), true);
});

test("registerCharacterReplyTools 按固定顺序注册已启用字段", () => {
  const { deps, calls } = createDeps({
    config: createConfig({
      xmlToolSettings: {
        injectXmlToolAsReplyTool: true,
        enableAffinityXmlToolCall: true,
        enableBlacklistXmlToolCall: true,
        enableRelationshipXmlToolCall: true,
        enableUserAliasXmlToolCall: true,
        characterPromptTemplate: "",
      },
    }),
  });

  registerCharacterReplyTools(deps);
  assert.deepEqual(
    calls.fields.map((field) => field.name),
    [
      "affinity_affinity",
      "affinity_blacklist",
      "affinity_relationship",
      "affinity_user_alias",
    ],
  );
});

test("registerCharacterReplyTools 在缺少服务时安全跳过", () => {
  const { deps } = createDeps({
    ctx: {},
  });
  assert.doesNotThrow(() => registerCharacterReplyTools(deps));
});

test("registerCharacterReplyTools 的 render 输出 XML 片段", () => {
  const { deps, calls } = createDeps();
  registerCharacterReplyTools(deps);

  const affinityField = calls.fields.find(
    (field) => field.name === "affinity_affinity",
  );
  const aliasField = calls.fields.find(
    (field) => field.name === "affinity_user_alias",
  );

  assert.deepEqual(
    affinityField.render({}, {}, [{ user_id: "1001", action: "increase", delta: 2 }], {}),
    ['<affinity scopeId="宁宁" userId="1001" action="increase" delta="2" />'],
  );
  assert.deepEqual(
    aliasField.render({}, {}, [{ user_id: "1001", name: "小明同学" }], {}),
    ['<userAlias scopeId="宁宁" userId="1001" name="小明同学" />'],
  );
});

test("registerCharacterReplyTools invoke 能映射到 affinity 现有服务", async () => {
  const { deps, calls } = createDeps();
  registerCharacterReplyTools(deps);

  const affinityField = calls.fields.find(
    (field) => field.name === "affinity_affinity",
  );
  const blacklistField = calls.fields.find(
    (field) => field.name === "affinity_blacklist",
  );
  const relationshipField = calls.fields.find(
    (field) => field.name === "affinity_relationship",
  );
  const aliasField = calls.fields.find(
    (field) => field.name === "affinity_user_alias",
  );

  await affinityField.invoke(
    {},
    { userId: "1001", selfId: "bot-a", platform: "onebot" },
    [{ user_id: "1001", action: "increase", delta: 2 }],
    {},
  );
  assert.equal(calls.ensureForSeed.length, 1);
  assert.equal(calls.clear.length, 1);

  await blacklistField.invoke(
    {},
    null,
    [
      {
        user_id: "1001",
        action: "add",
        mode: "temporary",
        duration_hours: 12,
        note: "xml",
      },
    ],
    {},
  );
  assert.equal(calls.recordTemporary.length, 1);

  await relationshipField.invoke(
    {},
    null,
    [{ user_id: "1001", action: "set", relation: "朋友" }],
    {},
  );
  assert.ok(calls.save.some((item) => Number.isNaN(item.value)));

  await aliasField.invoke(
    {},
    null,
    [{ user_id: "1001", name: "小明" }],
    {},
  );
  assert.equal(calls.setAlias.length, 1);
});
