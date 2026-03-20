/**
 * affinityDynamics 配置默认值测试
 * 验证 schema 不再使用对象级 default，且运行时默认解析保持稳定
 */

const test = require("node:test");
const assert = require("node:assert/strict");

function loadPlugin() {
  return require("../lib/index.js");
}

function createConfig(overrides = {}) {
  return {
    scopeId: "宁宁",
    botSelfIds: [],
    affinityEnabled: true,
    affinityDisplayRange: 1,
    initialAffinity: 30,
    affinityDynamics: undefined,
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

test("AffinitySchema 不为 affinityDynamics 写入完整对象级默认值", () => {
  const { AffinitySchema } = loadPlugin();
  const dynamicsSchema = AffinitySchema.dict.affinityDynamics;

  assert.deepEqual(dynamicsSchema.meta.default, {});
  assert.deepEqual(dynamicsSchema.dict.shortTerm.meta.default, {});
  assert.deepEqual(dynamicsSchema.dict.actionWindow.meta.default, {});
  assert.deepEqual(dynamicsSchema.dict.coefficient.meta.default, {});

  assert.equal(
    dynamicsSchema.dict.shortTerm.dict.promoteThreshold.meta.default,
    15,
  );
  assert.equal(
    dynamicsSchema.dict.shortTerm.dict.demoteThreshold.meta.default,
    -10,
  );
  assert.equal(
    dynamicsSchema.dict.actionWindow.dict.bonusChatThreshold.meta.default,
    10,
  );
  assert.equal(
    dynamicsSchema.dict.actionWindow.dict.maxEntries.meta.default,
    80,
  );
  assert.equal(dynamicsSchema.dict.coefficient.dict.base.meta.default, 1);
  assert.equal(
    dynamicsSchema.dict.coefficient.dict.decayPerDay.meta.default,
    0.05,
  );
});

test("resolveShortTermConfig 在 affinityDynamics 缺失时返回稳定默认值", () => {
  const { resolveShortTermConfig } = loadPlugin();

  const resolved = resolveShortTermConfig(createConfig());

  assert.deepEqual(resolved, {
    promoteThreshold: 15,
    demoteThreshold: -10,
    longTermPromoteStep: 3,
    longTermDemoteStep: 5,
  });
});

test("resolveActionWindowConfig 在 affinityDynamics 缺失时返回稳定默认值", () => {
  const { resolveActionWindowConfig } = loadPlugin();

  const resolved = resolveActionWindowConfig(createConfig());

  assert.deepEqual(resolved, {
    windowHours: 24,
    windowMs: 24 * 3600 * 1000,
    increaseBonus: 2,
    decreaseBonus: 2,
    bonusChatThreshold: 10,
    maxEntries: 80,
  });
});

test("resolveCoefficientConfig 在 affinityDynamics 缺失时返回稳定默认值", () => {
  const { resolveCoefficientConfig } = loadPlugin();

  const resolved = resolveCoefficientConfig(createConfig());

  assert.deepEqual(resolved, {
    base: 1,
    maxDrop: 0.3,
    maxBoost: 0.3,
    decayPerDay: 0.05,
    boostPerDay: 0.05,
    min: 0.7,
    max: 1.3,
  });
});
