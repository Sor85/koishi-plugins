/**
 * 好感度增量结算测试
 * 验证短期阈值跨越后的长期结算与短期清零语义
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { applyAffinityDelta } = require("../lib/index.js");

function createHarness(overrides = {}) {
  const calls = {
    ensureForSeed: [],
    save: [],
    log: [],
  };

  const currentState = {
    longTermAffinity: 30,
    shortTermAffinity: 0,
    chatCount: 0,
    actionStats: {
      total: 0,
      counts: { increase: 0, decrease: 0 },
      entries: [],
    },
    coefficientState: { coefficient: 1 },
    ...overrides.currentState,
  };

  const store = {
    async ensureForSeed(seed, userId, clampFn) {
      calls.ensureForSeed.push({ seed, userId, clampFn });
      return currentState;
    },
    async save(seed, value, relation, extra) {
      calls.save.push({ seed, value, relation, extra });
      return { ok: true };
    },
    clamp(value) {
      return Math.max(0, Math.min(100, Number(value)));
    },
  };

  return {
    calls,
    params: {
      seed: { scopeId: "宁宁", platform: "onebot", userId: "1001" },
      userId: "1001",
      delta: 1,
      action: "increase",
      store,
      levelResolver: {
        resolveLevelByAffinity(affinity) {
          return { relation: affinity >= 60 ? "亲密" : "朋友" };
        },
      },
      maxActionEntries: 20,
      shortTermConfig: {
        promoteThreshold: 10,
        demoteThreshold: -10,
        longTermPromoteStep: 3,
        longTermDemoteStep: 5,
      },
      log(level, message, detail) {
        calls.log.push({ level, message, detail });
      },
      ...overrides.params,
    },
  };
}

test("applyAffinityDelta 未跨正向阈值时只累加短期好感", async () => {
  const { params, calls } = createHarness({
    params: { delta: 4, action: "increase" },
  });

  const result = await applyAffinityDelta(params);

  assert.equal(result.success, true);
  assert.equal(result.longTermAffinity, 30);
  assert.equal(result.shortTermAffinity, 4);
  assert.equal(calls.save.length, 1);
  assert.equal(calls.save[0].value, 30);
  assert.equal(calls.save[0].extra.longTermAffinity, 30);
  assert.equal(calls.save[0].extra.shortTermAffinity, 4);
  assert.equal(calls.save[0].extra.chatCount, undefined);
  assert.equal(calls.save[0].extra.lastInteractionAt, undefined);
});

test("applyAffinityDelta 正向大幅增加跨阈值时长期只增加一次且短期归零", async () => {
  const { params, calls } = createHarness({
    params: { delta: 100, action: "increase" },
  });

  const result = await applyAffinityDelta(params);

  assert.equal(result.success, true);
  assert.equal(result.longTermAffinity, 33);
  assert.equal(result.shortTermAffinity, 0);
  assert.equal(result.delta, 100);
  assert.equal(calls.save.length, 1);
  assert.equal(calls.save[0].value, 33);
  assert.equal(calls.save[0].extra.longTermAffinity, 33);
  assert.equal(calls.save[0].extra.shortTermAffinity, 0);
});

test("applyAffinityDelta 负向大幅减少跨阈值时长期只减少一次且短期归零", async () => {
  const { params, calls } = createHarness({
    currentState: { longTermAffinity: 40, shortTermAffinity: 0 },
    params: { delta: 100, action: "decrease" },
  });

  const result = await applyAffinityDelta(params);

  assert.equal(result.success, true);
  assert.equal(result.longTermAffinity, 35);
  assert.equal(result.shortTermAffinity, 0);
  assert.equal(result.delta, -100);
  assert.equal(calls.save.length, 1);
  assert.equal(calls.save[0].value, 35);
  assert.equal(calls.save[0].extra.longTermAffinity, 35);
  assert.equal(calls.save[0].extra.shortTermAffinity, 0);
});

test("applyAffinityDelta 不再负责累加互动次数或更新时间", async () => {
  const { params, calls } = createHarness({
    currentState: { chatCount: 7 },
    params: { delta: 2, action: "increase" },
  });

  const result = await applyAffinityDelta(params);

  assert.equal(result.success, true);
  assert.equal(calls.save.length, 1);
  assert.equal(calls.save[0].extra.chatCount, undefined);
  assert.equal(calls.save[0].extra.lastInteractionAt, undefined);
});

test("applyAffinityDelta 恰好达到正向阈值时触发长期增长并清空短期", async () => {
  const { params, calls } = createHarness({
    params: { delta: 10, action: "increase" },
  });

  const result = await applyAffinityDelta(params);

  assert.equal(result.success, true);
  assert.equal(result.longTermAffinity, 33);
  assert.equal(result.shortTermAffinity, 0);
  assert.equal(calls.save[0].extra.shortTermAffinity, 0);
});
